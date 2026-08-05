/**
 * The crown jewel — OutcomeView renders an AI intent result and drives the full
 * plan → authorize → execute flow. AI proposes, the deterministic Risk + Policy
 * gate verifies, the device signature disposes; this component never signs on its own.
 *
 * Design law (Rams/Ive): mostly-monochrome dark + ONE accent, ONE primary action per
 * phase, mechanism (route / gas / slippage / chain) hidden in Simple mode and revealed
 * only in Pro. Large numbers, small gray labels, generous spacing. Never fabricate a
 * value: everything here is the server's plan or a live on-chain quote, or an honest
 * empty/awaiting state.
 *
 * Self-contained — every sub-component lives in this file; it consumes only ./ui,
 * ./theme, ./mode, ./wallet, ./broadcast, ./api, and the wire ./types.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Palette, radius, space, type as T, RISK } from './theme';
import { Card, CardLabel, PrimaryButton, RiskBadge, TextButton, StatusDot, usdFromMicros } from './ui';
import { isPro, useMode } from './mode';
import { beginBroadcast, currentIdentity, endBroadcast, isUnlocked } from './wallet';
import { assessSessionDrain, priorOutflow, recordOutflow } from './drain';
import { assessRecipientLive } from './poison';
import type { ChainId } from '@intent-wallet/chains';
import {
  balanceForAsset,
  decimalToBase,
  estimateSendUsd,
  executeTransferStep,
  isExecutableAsset,
  isSwappablePair,
  quoteSwap,
  sendSwap,
  type EvmSendResult,
  type SwapQuote,
} from './broadcast';
import { MAINNET_SPEND_CAP_USD } from '@intent-wallet/chains';
import { authorizeIntent, executeIntent } from './api';
import { isMainnet } from './network';
import { recordRecipient } from './recents';
import { getTxMode, autoDecision, recordAutoSpendUsd } from './settings';
import type { ExecuteResult, ExecutionPlan, Outcome, Permission, PlanAmount } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
//  OutcomeView — the single entry point
// ═══════════════════════════════════════════════════════════════════════════════

export function OutcomeView({ outcome }: { outcome: Outcome }): React.JSX.Element {
  if (outcome.kind === 'plan') return <PlanFlow plan={outcome.plan} />;
  if (outcome.kind === 'rejected') return <RejectedCard reason={outcome.reason} level={outcome.risk.level} />;
  if (outcome.kind === 'automation') return <AutomationCard intentKind={outcome.intentKind} />;
  if (outcome.kind === 'clarify') return <ClarifyCard question={outcome.question} options={outcome.options} />;
  return <AnswerCard question={outcome.question} />;
}

// ── non-plan outcomes ─────────────────────────────────────────────────────────

function RejectedCard({ reason, level }: { reason: string; level: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Card style={s.edgeDanger}>
      <View style={s.rowBetween}>
        <CardLabel>Not possible</CardLabel>
        {level !== 'low' && <RiskBadge level={level} />}
      </View>
      <Text style={s.body}>{reason}</Text>
    </Card>
  );
}

function AutomationCard({ intentKind }: { intentKind: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Card style={s.edgeAccent}>
      <CardLabel>Automation</CardLabel>
      <Text style={s.body}>This becomes a recurring rule ({intentKind}).</Text>
    </Card>
  );
}

function ClarifyCard({ question, options }: { question: string; options?: string[] }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Card>
      <Text style={s.body}>{question}</Text>
      {options && options.length > 0 && (
        <View style={s.chipWrap}>
          {options.map((o) => (
            <View key={o} style={s.optChip}>
              <Text style={s.optChipTxt}>{o}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function AnswerCard({ question }: { question: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Card>
      <Text style={s.body}>{question}</Text>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Plan → authorize → execute detectors (real on-device execution)
// ═══════════════════════════════════════════════════════════════════════════════

interface RealTransfer {
  asset: string;
  amountBase: string;
  to: string;
  chainLabel: string;
}

/** An in-app executable native/token transfer, or null if the plan isn't one. */
function executableTransfer(plan: ExecutionPlan): RealTransfer | null {
  if (plan.intentKind !== 'transfer') return null;
  const p = plan.steps[0]?.params;
  if (!p || typeof p.to !== 'string' || typeof p.amountBase !== 'string' || typeof p.asset !== 'string') return null;
  if (!isExecutableAsset(p.asset)) return null;
  const a = p.asset.toUpperCase();
  const main = isMainnet();
  const chainLabel = a === 'SOL' ? (main ? 'Solana' : 'Solana devnet') : a === 'BTC' ? (main ? 'Bitcoin' : 'Bitcoin testnet') : main ? 'Ethereum' : 'Sepolia';
  // Return the UPPERCASED symbol (not raw p.asset): the LLM path doesn't enforce the asset-casing
  // invariant, and a lowercase 'sol'/'btc'/'usdc' would fall through the strict === in the drain
  // derivations (drainDec/realChain/ownForReal) to the 18-dec/sepolia default — over-scaling the
  // balance so the cumulative-drain guard silently fails OPEN. Web's executableTransfer does the same.
  return { asset: a, amountBase: p.amountBase, to: p.to, chainLabel };
}

interface RealSwap {
  fromSym: string;
  toSym: string;
  amountInBase: string;
}

/** An in-app executable Uniswap swap, or null if the pair isn't swappable. */
function executableSwap(plan: ExecutionPlan): RealSwap | null {
  if (plan.intentKind !== 'swap') return null;
  const fromSym = plan.quote.youSend.symbol;
  const toSym = plan.quote.youReceiveMin?.symbol ?? plan.assets.find((x) => x.toUpperCase() !== fromSym.toUpperCase()) ?? '';
  if (!toSym || !isSwappablePair(fromSym, toSym)) return null;
  return { fromSym, toSym, amountInBase: plan.quote.youSend.base };
}

type Phase = 'planned' | 'authorizing' | 'authorized' | 'executing' | 'done';

/** Slippage tolerance, in basis points. 0.5% is the default. */
const SLIPPAGE_OPTIONS = [10, 50, 100] as const;

// ═══════════════════════════════════════════════════════════════════════════════
//  PlanFlow — the 6-stage vertical stepper + the one primary action per phase
// ═══════════════════════════════════════════════════════════════════════════════

function PlanFlow({ plan }: { plan: ExecutionPlan }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const pro = isPro(useMode());
  const [phase, setPhase] = useState<Phase>('planned');
  const [permission, setPermission] = useState<Permission | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [realTx, setRealTx] = useState<EvmSendResult | null>(null);
  const [bal, setBal] = useState<{ amount: string; symbol: string } | null>(null);
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false); // the one-shot quote came back null/errored — offer Retry
  const [quoteAttempt, setQuoteAttempt] = useState(0); // bump to re-fire the quote effect
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [mainnetAck, setMainnetAck] = useState(false); // explicit per-send confirm for real-funds
  const [highValueAck, setHighValueAck] = useState(false); // second confirm above the mainnet spend cap
  const [usdVal, setUsdVal] = useState<number | null>(null); // best-effort USD value of the transfer
  const [err, setErr] = useState<string | null>(null);
  const [poisonBlocks, setPoisonBlocks] = useState<string[]>([]); // on-chain first-time poison HARD blocks
  const [poisonChecking, setPoisonChecking] = useState(false); // an on-chain poison check is in flight
  const [poisonWarns, setPoisonWarns] = useState<string[]>([]); // on-chain poison WARNINGS — weaker evidence; Auto holds, manual shows them and lets the human decide
  const [poisonChecked, setPoisonChecked] = useState(false); // the on-chain check POSITIVELY completed — an inconclusive/errored check leaves this false so Auto stays on manual

  const real = executableTransfer(plan);
  const swap = executableSwap(plan);
  const canReal = real != null && isUnlocked();
  const canSwap = swap != null && isUnlocked();

  // Cumulative session-drain guard (ported from web): block a multi-send that empties the wallet across
  // this session's sends (>= 90% cumulative once something already left). Self-send exempt; a non-numeric
  // balance (unknown) is fail-soft (not blocked). `real.amountBase` is already base units.
  const drainDec = real ? (real.asset === 'SOL' ? 9 : real.asset === 'BTC' ? 8 : real.asset === 'USDC' ? 6 : 18) : 18;
  // RealTransfer carries no chain field — derive the ledger chain from the asset, matching the Send sheet's
  // ChainKey (SOL->solana-devnet, BTC->bitcoin-testnet, else sepolia) so both surfaces feed one bucket.
  const realChain = real ? (real.asset === 'SOL' ? 'solana-devnet' : real.asset === 'BTC' ? 'bitcoin-testnet' : 'sepolia') : '';
  const me = currentIdentity();
  const ownForReal =
    real && me ? (real.asset === 'SOL' ? me.sol.address : real.asset === 'BTC' ? me.btc.address : me.evm.address) : undefined;
  const realSelfSend = !!real && !!ownForReal && real.to.toLowerCase() === ownForReal.toLowerCase();
  const drainBlock =
    canReal && real != null && !realSelfSend && bal != null && /^\d+(\.\d+)?$/u.test(bal.amount)
      ? assessSessionDrain({ priorBase: priorOutflow(realChain, real.asset), amountBase: BigInt(real.amountBase), balanceBase: BigInt(decimalToBase(bal.amount, drainDec)) }) === 'block'
      : false;
  // Mirror web's `evmRecipientCheckable`: an external 0x recipient is the ONLY target the on-chain poison
  // check covers, so it's the only one whose still-pending / inconclusive check should hold Auto. A non-EVM
  // (SOL/BTC) target is never checkable → poisonChecked stays false for it → it must NOT be held forever.
  const isEvmRecipient = real != null && /^0x[0-9a-fA-F]{40}$/u.test(real.to);

  useEffect(() => {
    if (real) balanceForAsset(real.asset).then(setBal).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planId]);
  useEffect(() => {
    if (!swap) return;
    setQuoteFailed(false);
    // A null quote (transient RPC / rate-limit / momentary no-liquidity) is RECOVERABLE — flag it so the
    // UI offers Retry instead of a dead-end (the execute button below is disabled while !swapQuote, so a
    // tap can't throw "still fetching" forever, and Auto won't silently wait on a quote that never comes).
    quoteSwap({ fromSym: swap.fromSym, toSym: swap.toSym, amountInBase: swap.amountInBase })
      .then((q) => {
        setSwapQuote(q);
        if (!q) setQuoteFailed(true);
      })
      .catch(() => {
        setSwapQuote(null);
        setQuoteFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planId, quoteAttempt]);
  // Best-effort USD value of the transfer — drives the mainnet high-value spend-cap confirmation.
  useEffect(() => {
    if (real && isMainnet()) estimateSendUsd(real.asset, real.amountBase).then(setUsdVal).catch(() => setUsdVal(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planId]);
  // On-chain first-time POISON check for the chat recipient (EVM only — a non-0x target self-returns
  // UNKNOWN). Catches a lookalike of an on-chain counterparty / dust-spray poisoner even on a fresh
  // install; gates the manual button AND the Auto effect so a poisoned recipient can't auto-sign.
  useEffect(() => {
    const target = real?.to;
    const meEvm = currentIdentity()?.evm.address;
    if (!target || !meEvm || !/^0x[0-9a-fA-F]{40}$/u.test(target)) {
      setPoisonBlocks([]);
      setPoisonWarns([]);
      setPoisonChecked(false);
      setPoisonChecking(false);
      return;
    }
    let live = true;
    setPoisonChecking(true);
    // The on-chain poison check must query the chain the recipient ACTUALLY receives on — Ethereum on
    // mainnet, not the 'sepolia' the drain-ledger key reuses. Passing 'sepolia' for a mainnet address read
    // UNRELATED Sepolia history: a real mainnet dust-poisoner was invisible (the hard block never fired) and
    // a benign mainnet recipient could false-block. 'ethereum' has no explorer configured here, so
    // assessRecipientLive returns UNKNOWN (inconclusive) — which HOLDS Auto (safe), never a fabricated
    // clean bill. Mirrors web, which skips the on-chain check off-Sepolia (App.tsx evmChain gate).
    const poisonChain: ChainId = isMainnet() ? 'ethereum' : 'sepolia';
    assessRecipientLive({ chain: poisonChain, me: meEvm, target })
      .then((r) => {
        if (!live) return;
        setPoisonBlocks(r.blocked);
        setPoisonWarns(r.warnings);
        setPoisonChecked(r.checked); // false when explorer + RPC both failed → an inconclusive verdict, not a clean bill
      })
      .catch(() => {
        if (!live) return;
        setPoisonBlocks([]);
        setPoisonWarns([]);
        setPoisonChecked(false); // an errored check is INCONCLUSIVE — Auto must hold, never read it as "clean"
      })
      .finally(() => live && setPoisonChecking(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planId]);
  // Fail SAFE, not open: on mainnet, a still-loading OR failed USD estimate (usdVal == null) counts
  // as high-value, so the 2nd confirmation is required rather than the spend cap being silently skipped.
  const highValue = isMainnet() && canReal && (usdVal == null || usdVal > MAINNET_SPEND_CAP_USD);

  const minOut = swapQuote ? (swapQuote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n : null;
  const minOutDisplay = minOut != null && swapQuote ? baseToFixed(minOut, swapQuote.decimalsOut, 4) : '—';

  const authorize = async (): Promise<void> => {
    setPhase('authorizing');
    setErr(null);
    try {
      setPermission(await authorizeIntent(plan.planId));
      setPhase('authorized');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Authorization failed');
      setPhase('planned');
    }
  };

  // Re-entrancy latch. The execute button is render-gated on `phase`, and `setPhase` is
  // ASYNCHRONOUS — two quick taps (far more likely on touch, where a laggy frame invites a second
  // tap) both pass the `phase === 'authorized'` check and both broadcast. `disabled` alone cannot
  // close that window; a ref can, because it updates synchronously. Mirrors apps/web/src/App.tsx
  // and this app's own FlowSend.tsx, which already guard the same way.
  const execInFlight = useRef(false);

  const execute = async (): Promise<void> => {
    if (execInFlight.current) return; // a broadcast is already in flight — ignore the double-tap
    execInFlight.current = true;
    beginBroadcast(); // block an account switch until this send settles (wrong-account/nonce guard)
    setPhase('executing');
    setErr(null);
    try {
      if (canReal && real) {
        // On mainnet the chains guard requires an explicit acknowledgement; a transfer above the
        // spend cap needs a second high-value confirmation. Thread the USD value + both acks.
        const guard = isMainnet()
          ? {
              acknowledgeMainnet: true,
              ...(usdVal != null ? { amountUsd: usdVal } : {}),
              ...(highValueAck ? { acknowledgeHighValue: true } : {}),
            }
          : undefined;
        setRealTx(await executeTransferStep(real, guard));
        recordRecipient(real.to); // known-good reference for future poisoning detection
        if (!realSelfSend) recordOutflow(realChain, real.asset, BigInt(real.amountBase)); // feed the cumulative-drain ledger
        setPhase('done');
      } else if (canSwap && swap) {
        if (!swapQuote || minOut == null) throw new Error('Still fetching a live quote — try again in a second.');
        setRealTx(await sendSwap({ fromSym: swap.fromSym, toSym: swap.toSym, amountInBase: swap.amountInBase, amountOutMin: minOut, fee: swapQuote.fee }));
        setPhase('done');
      } else {
        setResult(await executeIntent(plan.planId));
        setPhase('done');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Execution failed');
      setPhase('authorized');
    } finally {
      execInFlight.current = false; // release on success, error, or throw
      endBroadcast();
    }
  };

  // ── AUTO MODE ────────────────────────────────────────────────────────────────
  // In Auto mode, drive authorize → execute automatically WITHIN the user's bounds — no per-tx
  // tap. It still signs on-device and still passes the Risk/Policy gate. autoDecision() fails safe:
  // block risk / over-cap / unverified-mainnet-USD all fall back to the normal manual buttons.
  const autoDrivenRef = useRef(false); // this flow is being auto-driven (vs a manual tap)
  const autoAuthTriedRef = useRef(false); // auto-authorize fired once
  const autoExecTriedRef = useRef(false); // auto-execute fired once — NEVER retry on failure (would loop)
  const spentRecordedRef = useRef(false); // the mainnet auto-spend has been debited once
  const autoDec = autoDecision(isMainnet() ? usdVal : null, plan.risk.level);
  useEffect(() => {
    // Never auto-sign a drain/poison, while checking, OR a step-up plan (full-balance / elevated-risk):
    // requiresStepUp exists so a max-value move "can't proceed on the silent path" — Auto IS that path,
    // so it drops to manual (parity with web App.tsx). Reachable: mobile Auto runs freely on testnet.
    // The recipient safety is designed as "BLOCK on strong evidence, WARN on weaker, let the human weigh
    // the warnings" — but Auto has no human. So (parity with web's autoRecipientHold) Auto must ALSO hold
    // on any recipient WARNING (a passive never-used address, dust-spray under the block bar, an
    // unverified-token-only sender) AND, for an external EVM recipient, until the on-chain poison check
    // has POSITIVELY completed — an inconclusive/failed check (explorer + RPC both down → checked:false)
    // drops Auto back to manual instead of signing blind. This also closes a race: poisonChecked starts
    // false, so Auto can't authorize in the first render before the async check has even begun. Manual is
    // unchanged — it still shows the warnings and lets the human proceed.
    if (
      getTxMode() !== 'auto' ||
      !autoDec.auto ||
      drainBlock ||
      poisonBlocks.length > 0 ||
      poisonChecking ||
      poisonWarns.length > 0 ||
      (isEvmRecipient && !poisonChecked) ||
      plan.requiresStepUp ||
      highValue // a >$1,000 (or unpriced) MAINNET move is the statutory high-value gate — a human must tap the
      // high-value ack (below); Auto must never self-satisfy it. Drops to manual, where the checkbox is shown.
    )
      return;
    if (phase === 'planned' && !autoAuthTriedRef.current) {
      autoDrivenRef.current = true;
      autoAuthTriedRef.current = true;
      setMainnetAck(true); // Auto IS the consent to operate on mainnet within the user's caps.
      // NOT setHighValueAck — the $1,000 statutory high-value gate is deliberately NOT auto-satisfiable; a
      // high-value plan never reaches here (the `highValue` gate above dropped it to manual for a human tap).
      void authorize();
    } else if (phase === 'authorized' && permission?.mayProceedToSign && autoDrivenRef.current && !autoExecTriedRef.current) {
      if (canSwap && !swapQuote) return; // a swap needs its live quote before it can sign — don't consume the try
      autoExecTriedRef.current = true;
      void execute();
    }
    // A failed authorize/execute drops back to 'planned'/'authorized' — we do NOT auto-retry (that
    // would spin forever); the manual buttons reappear so the user can retry deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    usdVal,
    swapQuote,
    permission?.mayProceedToSign,
    autoDec.auto,
    plan.requiresStepUp,
    // Re-evaluate the gate when a safety verdict resolves — without these, a clean check that flips
    // poisonChecked→true (on testnet usdVal never changes) would never re-run the effect, so Auto would
    // stay held on an OK recipient. Lengths/booleans (not the array refs) keep the deps stable.
    poisonChecked,
    poisonChecking,
    poisonBlocks.length,
    poisonWarns.length,
    drainBlock,
  ]);
  // Announce an async safety verdict to a screen reader. The on-chain poison / drain check resolves
  // AFTER the user reaches review and then silently disables the execute button — without this an SR
  // user gets no signal (parity with web's aria-live). announceForAccessibility works on iOS + Android.
  useEffect(() => {
    const msg = drainBlock
      ? 'Blocked: together with this session, this would drain your wallet.'
      : poisonBlocks[0];
    if (msg) AccessibilityInfo.announceForAccessibility(`Blocked. ${msg}`);
  }, [drainBlock, poisonBlocks]);
  // Debit the daily auto-budget once a mainnet auto-tx actually confirms.
  useEffect(() => {
    if (phase === 'done' && autoDrivenRef.current && !spentRecordedRef.current && isMainnet() && usdVal != null) {
      spentRecordedRef.current = true;
      recordAutoSpendUsd(usdVal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, usdVal]);

  const feeUsd = usdFromMicros(plan.quote.totalFeeMicros);
  const etaMin = Math.max(1, Math.round(plan.quote.etaSeconds / 60));
  const etaSec = Math.max(1, plan.quote.etaSeconds);
  const done = result != null || realTx != null;

  // ── stage states derived from phase ──
  const authState: StageState = permission ? 'done' : phase === 'authorizing' ? 'active' : 'pending';
  const execState: StageState = done ? 'done' : phase === 'executing' ? 'active' : 'pending';

  return (
    <Card style={s.edgeAccent}>
      {/* header — titleCased intent + (auto badge) + risk badge */}
      <View style={s.rowBetween}>
        <Text style={s.kindTitle}>{titleCase(plan.intentKind)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {getTxMode() === 'auto' && <Text style={{ ...T.caption, color: c.accent, fontWeight: '700' }}>⚡ AUTO</Text>}
          <RiskBadge level={plan.risk.level} />
        </View>
      </View>
      <Text style={s.confirmation}>{plan.confirmation}</Text>

      {/* SIMPLE mode → one honest line, no mechanism. PRO → the full stepper. */}
      {!pro ? (
        <SimpleSummary plan={plan} real={real} etaSec={etaSec} />
      ) : (
        <View style={s.stepper}>
          <Stage icon="✦" title="Understood your intent" state="done">
            <Text style={s.stageTxt}>Parsed as a {plan.intentKind} across {plan.assets.join(' → ') || 'your wallet'}.</Text>
          </Stage>

          <Stage icon="🛡" title="Security checked" state="done">
            {plan.risk.reasons.length > 0 ? (
              plan.risk.reasons.map((r, i) => (
                <Text key={i} style={s.stageTxt}>• {r}</Text>
              ))
            ) : (
              <Text style={s.stageTxt}>No threats flagged by the risk engine.</Text>
            )}
            {plan.requiresStepUp && <Text style={[s.stageTxt, { color: c.warn }]}>Elevated risk — extra confirmation required before signing.</Text>}
          </Stage>

          <Stage icon="🧭" title="Best route" state="done">
            <RouteGraph plan={plan} />
          </Stage>

          <Stage icon="⛽" title="Estimated cost" state="done">
            <Cost k="You send" v={`${plan.quote.youSend.symbol} ${baseToDec(plan.quote.youSend)}`} />
            {plan.quote.youReceiveMin && (
              // Show the LIVE signed floor (minOutDisplay) when a live quote exists — that is the amount the
              // tx actually enforces (amountOutMin). Falling back to the planner estimate here would display
              // a "guaranteed minimum" that isn't the one signed. Mirrors web App.tsx.
              <Cost
                k="You receive (min)"
                v={`${plan.quote.youReceiveMin.symbol} ${swapQuote && minOut != null ? minOutDisplay : baseToDec(plan.quote.youReceiveMin)}`}
              />
            )}
            <Cost k="Network fee" v={`~${feeUsd}`} />
            {/* Applied slippage (the user-selected tolerance the tx signs at), not the stale planner value. */}
            <Cost k="Slippage" v={`${(swapQuote ? slippageBps : plan.quote.slippageBps) / 100}%`} />
            <Cost k="ETA" v={`~${etaMin} min`} />
          </Stage>

          <Stage icon="🔐" title="Authorize (Risk + Policy)" state={authState}>
            {permission ? (
              <AuthzView p={permission} />
            ) : phase === 'authorizing' ? (
              <Text style={s.stageTxt}>Checking risk & policy…</Text>
            ) : (
              <Text style={s.stageTxt}>Not yet authorized — review the plan, then authorize.</Text>
            )}
          </Stage>

          <Stage icon="🚀" title="Execute (sign → broadcast → confirm)" state={execState}>
            <ExecStage
              phase={phase}
              realTx={realTx}
              result={result}
              real={real}
              swap={swap}
              canReal={canReal}
              canSwap={canSwap}
              bal={bal}
              swapQuote={swapQuote}
              slippageBps={slippageBps}
              onSlippage={setSlippageBps}
              minOutDisplay={minOutDisplay}
            />
          </Stage>
        </View>
      )}

      {/* SIMPLE-mode authorize result (the stepper hides it, so surface it plainly) */}
      {!pro && permission && (
        <View style={{ marginTop: space.md }}>
          <AuthzView p={permission} />
        </View>
      )}
      {!pro && (realTx || result) && (
        <View style={{ marginTop: space.md }}>
          {realTx ? <SignedResult realTx={realTx} chainLabel={real?.chainLabel} /> : result ? <ExecResultView r={result} /> : null}
        </View>
      )}

      {/* MAINNET confirmation — an explicit per-send acknowledgement of real, irreversible funds */}
      {phase === 'authorized' && permission?.mayProceedToSign && isMainnet() && canReal && (
        <>
          <Pressable
            style={s.mainnetAck}
            onPress={() => setMainnetAck((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: mainnetAck }}
          >
            <View style={[s.ackBox, mainnetAck && s.ackBoxOn]}>{mainnetAck ? <Text style={s.ackMark}>✓</Text> : null}</View>
            <Text style={s.ackTxt}>
              MAINNET — sending {usdVal != null ? `~$${usdVal.toLocaleString('en-US', { maximumFractionDigits: 2 })} of ` : ''}REAL funds. Irreversible. I understand.
            </Text>
          </Pressable>
          {highValue && (
            <Pressable
              style={[s.mainnetAck, { marginTop: space.sm }]}
              onPress={() => setHighValueAck((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: highValueAck }}
            >
              <View style={[s.ackBox, highValueAck && s.ackBoxOn]}>{highValueAck ? <Text style={s.ackMark}>✓</Text> : null}</View>
              <Text style={s.ackTxt}>
                {usdVal == null
                  ? "Couldn’t confirm this transfer’s USD value — I’ve double-checked the recipient and amount."
                  : `Large transfer (over $${MAINNET_SPEND_CAP_USD.toLocaleString('en-US')}). I’ve double-checked the recipient and amount.`}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* Auto mode fell back to a manual confirm — tell the user WHY (over cap / unverified value) */}
      {getTxMode() === 'auto' && !autoDec.auto && autoDec.reason && (phase === 'planned' || phase === 'authorized') && (
        <Text style={{ ...T.caption, color: c.warn, marginTop: space.sm }}>⚡ Auto paused — {autoDec.reason}. Confirm manually below.</Text>
      )}

      {/* ONE primary action per phase */}
      <View style={{ marginTop: space.base }}>
        {drainBlock && (
          <Text style={s.blockedNote}>⛔ Together with this session's sends, this empties your balance. Send a smaller amount, or use the Send sheet.</Text>
        )}
        {poisonBlocks.map((b, i) => (
          <Text key={`pb${i}`} style={s.blockedNote}>🧬 {b}</Text>
        ))}
        {poisonWarns.map((w, i) => (
          <Text key={`pw${i}`} style={s.warnNote}>⚠️ {w}</Text>
        ))}
        {poisonChecking && <Text style={s.blockedNote}>Checking the recipient on-chain…</Text>}
        {phase === 'planned' && <PrimaryButton label="Review & authorize" onPress={() => void authorize()} />}
        {phase === 'authorizing' && <PrimaryButton label="Review & authorize" onPress={() => {}} busy />}
        {phase === 'authorized' && permission?.mayProceedToSign && (
          <PrimaryButton
            label={isMainnet() && canReal ? 'Sign & send REAL funds' : 'Sign on device & execute'}
            danger={isMainnet() && canReal}
            disabled={
              (canSwap && !swapQuote) || // a swap can't sign without its live quote (was: throws on every tap)
              drainBlock ||
              poisonBlocks.length > 0 ||
              poisonChecking ||
              (isMainnet() && canReal && (!mainnetAck || (highValue && !highValueAck)))
            }
            onPress={() => void execute()}
          />
        )}
        {phase === 'authorized' && canSwap && !swapQuote && quoteFailed && (
          <TextButton
            label="↻ Retry quote"
            onPress={() => {
              setQuoteFailed(false);
              setQuoteAttempt((n) => n + 1);
            }}
          />
        )}
        {phase === 'executing' && <PrimaryButton label="Sign on device & execute" onPress={() => {}} busy />}
        {phase === 'authorized' && permission != null && !permission.mayProceedToSign && (
          <Text style={s.blockedNote}>Can't proceed until the requirements above are met.</Text>
        )}
      </View>

      {err && <Text style={s.err}>{err}</Text>}

      <Text style={s.foot}>
        plan {plan.planId.slice(0, 10)}… ·{' '}
        {canReal ? 'signs on your device & broadcasts for real' : canSwap ? 'real Uniswap v3 swap on Sepolia' : isUnlocked() ? 'server-side executor' : 'unlock to sign for real'}
      </Text>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Simple-mode summary — no route / gas / slippage; just what happens
// ═══════════════════════════════════════════════════════════════════════════════

function SimpleSummary({ plan, real, etaSec }: { plan: ExecutionPlan; real: RealTransfer | null; etaSec: number }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const send = `${plan.quote.youSend.symbol} ${baseToDec(plan.quote.youSend)}`;
  const dest = real ? 'the recipient' : plan.quote.youReceiveMin ? `${plan.quote.youReceiveMin.symbol}` : 'your wallet';
  return (
    <View style={s.simpleBox}>
      <Text style={s.simpleLine}>Send {send} → arrives at {dest} in ~{formatEta(etaSec)}.</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Execute stage body (Pro)
// ═══════════════════════════════════════════════════════════════════════════════

function ExecStage(props: {
  phase: Phase;
  realTx: EvmSendResult | null;
  result: ExecuteResult | null;
  real: RealTransfer | null;
  swap: RealSwap | null;
  canReal: boolean;
  canSwap: boolean;
  bal: { amount: string; symbol: string } | null;
  swapQuote: SwapQuote | null;
  slippageBps: number;
  onSlippage: (bps: number) => void;
  minOutDisplay: string;
}): React.JSX.Element {
  const { phase, realTx, result, real, swap, canReal, canSwap, bal, swapQuote, slippageBps, onSlippage, minOutDisplay } = props;
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);

  if (realTx) return <SignedResult realTx={realTx} chainLabel={real?.chainLabel} />;
  if (result) return <ExecResultView r={result} />;
  if (phase === 'executing') return <Text style={s.stageTxt}>Signing on device & broadcasting…</Text>;

  if (canReal && real) {
    return <Text style={s.stageTxt}>Ready to sign · your {bal?.symbol ?? real.asset} on {real.chainLabel}: {bal?.amount ?? '…'}</Text>;
  }

  if (canSwap && swap) {
    return (
      <View style={{ gap: space.xs }}>
        <Text style={s.stageTxt}>
          Real Uniswap quote: {swapQuote ? `${baseToFixed(swapQuote.amountOut, swapQuote.decimalsOut, 4)} ${swapQuote.symbolOut}` : 'fetching…'} · swaps on-device on Sepolia
        </Text>
        <View style={s.slipRow}>
          <Text style={s.stageTxt}>Max slippage</Text>
          {SLIPPAGE_OPTIONS.map((bps) => (
            <Pressable
              key={bps}
              style={[s.slipOpt, slippageBps === bps && s.slipOptActive]}
              onPress={() => onSlippage(bps)}
              accessibilityRole="button"
              accessibilityLabel={`Max slippage ${bps / 100} percent`}
              accessibilityState={{ selected: slippageBps === bps }}
            >
              <Text style={[s.slipTxt, slippageBps === bps && { color: '#fff' }]}>{bps / 100}%</Text>
            </Pressable>
          ))}
        </View>
        {swapQuote && <Text style={s.stageTxt}>You receive at least {minOutDisplay} {swapQuote.symbolOut}</Text>}
      </View>
    );
  }

  return <Text style={s.stageTxt}>Awaiting authorization.</Text>;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Vertical stepper stage
// ═══════════════════════════════════════════════════════════════════════════════

type StageState = 'done' | 'active' | 'pending';

function Stage({ icon, title, state, children }: { icon: string; title: string; state: StageState; children: React.ReactNode }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const color = state === 'done' ? c.success : state === 'active' ? c.accent : c.text3;
  return (
    <View style={s.stage}>
      <View style={s.stageRail}>
        <Text style={[s.stageDot, { color }]}>{state === 'done' ? '✓' : icon}</Text>
      </View>
      <View style={{ flex: 1, opacity: state === 'pending' ? 0.55 : 1 }}>
        <Text style={s.stageTitle}>{title}</Text>
        <View style={{ marginTop: 3, gap: 3 }}>{children}</View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Route graph — a horizontal chip row from plan.steps + assets (Pro only)
// ═══════════════════════════════════════════════════════════════════════════════

function RouteGraph({ plan }: { plan: ExecutionPlan }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const nodes: { label: string; sub?: string; asset?: boolean }[] = [];
  if (plan.intentKind === 'rebalance') {
    const target = plan.assets[0] ?? 'USDC';
    const sources = plan.assets.slice(1);
    nodes.push({ label: sources.length > 1 ? `${sources.length} assets` : sources[0] ?? 'holdings', asset: true });
    plan.steps.forEach((st) => nodes.push({ label: titleCase(st.kind), sub: st.chainId }));
    nodes.push({ label: target, asset: true });
  } else {
    const from = plan.assets[0];
    if (from) nodes.push({ label: from, asset: true });
    plan.steps.forEach((st) => nodes.push({ label: titleCase(st.kind), sub: st.chainId }));
    const last = plan.assets[plan.assets.length - 1];
    if (plan.intentKind === 'transfer') nodes.push({ label: 'Recipient' });
    else if (last && last !== from) nodes.push({ label: last, asset: true });
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.xs }}>
      <View style={s.route}>
        {nodes.map((n, i) => (
          <View key={i} style={s.routeSeg}>
            <View style={[s.routeNode, n.asset && s.routeNodeAsset]}>
              <Text style={s.routeLabel}>{n.label}</Text>
              {n.sub && <Text style={s.routeSub}>{n.sub}</Text>}
            </View>
            {i < nodes.length - 1 && <Text style={s.routeArrow}>→</Text>}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Authorize + execute result views
// ═══════════════════════════════════════════════════════════════════════════════

const GATE_LABEL: Record<string, string> = {
  allow: 'Authorized',
  require_confirmation: 'Needs step-up',
  defer: 'Deferred',
  escalate: 'Escalated for review',
  block: 'Blocked by policy',
};

function AuthzView({ p }: { p: Permission }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const good = p.mayProceedToSign;
  const color = good ? c.success : c.danger;
  return (
    <View style={[s.gateBox, { borderColor: color }]}>
      <View style={s.gateHead}>
        <StatusDot color={color} />
        <Text style={[s.gateLabel, { color }]}>{GATE_LABEL[p.gate] ?? p.gate}</Text>
      </View>
      {p.drivenBy.length > 0 && <Text style={s.stageTxt}>checked by {p.drivenBy.join(' + ')}</Text>}
      {p.reasons.map((r, i) => (
        <Text key={i} style={s.stageTxt}>• {r}</Text>
      ))}
    </View>
  );
}

function SignedResult({ realTx, chainLabel }: { realTx: EvmSendResult; chainLabel?: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.signedBox}>
      <View style={s.gateHead}>
        <StatusDot color={c.success} />
        <Text style={[s.gateLabel, { color: c.success }]}>Signed on device & broadcast to {chainLabel ?? (isMainnet() ? 'Ethereum' : 'Sepolia')}</Text>
      </View>
      <Text style={s.sigMono}>{realTx.txid.slice(0, 26)}…</Text>
      <TextButton label="View on explorer →" onPress={() => void openUrl(realTx.explorerUrl)} />
    </View>
  );
}

function ExecResultView({ r }: { r: ExecuteResult }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  if (!r.executed) {
    return (
      <View style={[s.gateBox, { borderColor: c.danger }]}>
        <Text style={[s.gateLabel, { color: c.danger }]}>Execution refused — the server re-checked risk & policy and would not sign.</Text>
      </View>
    );
  }
  const ex = r.execution;
  if (!ex) return <Text style={s.stageTxt}>Executed.</Text>;
  const color = ex.status === 'completed' ? c.success : ex.status === 'parked' ? c.warn : c.danger;
  const label = ex.status === 'completed' ? 'Executed' : ex.status === 'parked' ? 'Parked — funds safe' : ex.status;
  return (
    <View style={[s.gateBox, { borderColor: color }]}>
      <View style={s.gateHead}>
        <StatusDot color={color} />
        <Text style={[s.gateLabel, { color }]}>{label}</Text>
      </View>
      {ex.status === 'completed' && <Text style={s.stageTxt}>Simulation passed (sandbox) → signed → confirmed on-chain.</Text>}
      <Text style={s.stageTxt}>{ex.fundsLocation.note}</Text>
      {ex.steps.map((st) => (
        <Text key={st.seq} style={s.stageTxt}>
          {st.kind} on {st.chainId} — {st.status}
          {st.txid ? ` · ${short(st.txid)}` : ''}
        </Text>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Small pieces
// ═══════════════════════════════════════════════════════════════════════════════

function Cost({ k, v }: { k: string; v: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.costRow}>
      <Text style={s.costK}>{k}</Text>
      <Text style={s.costV}>{v}</Text>
    </View>
  );
}

const baseToDec = (a: PlanAmount): string => {
  const n = Number(a.base) / 10 ** a.decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

/** Format a base-unit bigint to a fixed-dp decimal string using INTEGER math (no float) — so a
 *  large amount can't lose precision the way Number(base)/10**dec would past 2^53. Truncates. */
const baseToFixed = (base: bigint, decimals: number, dp: number): string => {
  const neg = base < 0n;
  const b = neg ? -base : base;
  const scale = 10n ** BigInt(decimals);
  const whole = b / scale;
  const frac = ((b % scale) * 10n ** BigInt(dp)) / scale; // first `dp` decimals, truncated
  return `${neg ? '-' : ''}${whole}.${frac.toString().padStart(dp, '0')}`;
};

const titleCase = (str: string): string => (str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/[_-]+/g, ' ') : str);

const short = (h: string): string => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

const formatEta = (seconds: number): string => {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

const openUrl = async (url: string): Promise<void> => {
  try {
    await Linking.openURL(url);
  } catch {
    /* the explorer URL was well-formed but the platform refused it — nothing to recover */
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════════════════════

const makeStyles = (c: Palette) => StyleSheet.create({
  edgeAccent: { borderColor: c.accent },
  edgeDanger: { borderColor: c.danger },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindTitle: { ...T.headline, color: c.text },
  confirmation: { ...T.body, color: c.text, marginTop: space.sm, lineHeight: 21 },
  body: { ...T.body, color: c.text, marginTop: space.sm, lineHeight: 21 },

  // simple mode
  simpleBox: { marginTop: space.md, backgroundColor: c.surface2, borderRadius: radius.md, padding: space.md },
  simpleLine: { ...T.body, color: c.text, lineHeight: 22 },

  // clarify chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  optChip: { backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  optChipTxt: { color: c.text2, fontSize: 13 },

  // stepper
  stepper: { marginTop: space.base, gap: space.xs },
  stage: { flexDirection: 'row', gap: space.md, paddingVertical: 5 },
  stageRail: { width: 20, alignItems: 'center' },
  stageDot: { fontSize: 14, fontWeight: '700' },
  stageTitle: { ...T.caption, color: c.text, fontWeight: '700' },
  stageTxt: { fontSize: 12.5, color: c.text2, lineHeight: 18 },

  // route graph
  route: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  routeSeg: { flexDirection: 'row', alignItems: 'center' },
  routeNode: { backgroundColor: c.surface2, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, minWidth: 54, alignItems: 'center' },
  routeNodeAsset: { borderColor: c.accent, backgroundColor: c.accentSubtle },
  routeLabel: { color: c.text, fontSize: 11.5, fontWeight: '700' },
  routeSub: { color: c.text3, fontSize: 9.5, marginTop: 1 },
  routeArrow: { color: c.text3, fontSize: 14, marginHorizontal: 5 },

  // cost rows
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  costK: { fontSize: 12.5, color: c.text3 },
  costV: { fontSize: 12.5, color: c.text, fontWeight: '600' },

  // gate + result boxes
  gateBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, marginTop: space.xs, gap: 3, backgroundColor: c.surface2 },
  gateHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  gateLabel: { fontSize: 13, fontWeight: '700', flexShrink: 1 },

  signedBox: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.success, borderRadius: radius.md, padding: space.md, marginTop: space.xs, gap: space.xs, backgroundColor: c.surface2 },
  sigMono: { fontSize: 12, color: c.text2, fontFamily: 'monospace' },

  // slippage control
  slipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs, flexWrap: 'wrap' },
  slipOpt: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: c.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  slipOptActive: { backgroundColor: c.accent, borderColor: c.accent },
  slipTxt: { fontSize: 12, color: c.text2, fontWeight: '600' },

  // action + footer
  blockedNote: { ...T.caption, color: c.text3, marginTop: space.xs },
  warnNote: { ...T.caption, color: c.warn, marginTop: space.xs },
  err: { color: c.danger, fontSize: 13, marginTop: space.md, lineHeight: 18 },
  foot: { ...T.caption, color: c.text3, marginTop: space.md },

  // mainnet real-funds acknowledgement
  mainnetAck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.danger,
    backgroundColor: 'rgba(220,59,59,0.06)',
  },
  ackBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  ackBoxOn: { backgroundColor: c.danger },
  ackMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  ackTxt: { ...T.caption, color: c.danger, flex: 1, lineHeight: 17, fontWeight: '600' },
});
