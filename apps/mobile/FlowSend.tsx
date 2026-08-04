/**
 * Send — a five-step wizard, one decision per step, inside a ./ui Sheet. The Rams/Ive rule
 * here is ruthless: each step asks exactly ONE thing, a single primary button advances it, and
 * the mechanism (chain, RPC, fee tier) stays hidden in Simple mode — Simple sends ETH on
 * Sepolia and never sees the chain tabs; Pro/Developer get to pick the network + asset.
 *
 *   0 Recipient → 1 Asset → 2 Amount → 3 Review → 4 Broadcast
 *
 * Recipients resolve like the rest of the app: a saved contact name wins, else an ENS `.eth`
 * name (debounced, EVM only) resolves via the API, else a raw address is validated by chain
 * family. Balances are live from ./broadcast. Broadcast REUSES ./broadcast's on-device
 * sign+send functions verbatim — no signing is reimplemented here; the private key never
 * leaves the sealed keyring. No fabricated data anywhere: an unfunded address surfaces the
 * node's real error plus a faucet note, never a fake success.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, type Palette, space, radius, mono, type as T } from './theme';
import {
  Card,
  Field,
  PrimaryButton,
  ProgressDots,
  SecondaryButton,
  Sheet,
  TextButton,
  Chip,
  shortAddr,
} from './ui';
import { useMode, isPro } from './mode';
import { beginBroadcast, currentIdentity, endBroadcast } from './wallet';
import { classify, resolveContact } from './contacts';
import { resolveEnsName } from './api';
import { assessSessionDrain, priorOutflow, recordOutflow } from './drain';
import { assessRecipientLive } from './poison';
import type { ChainId } from '@intent-wallet/chains';
import {
  decimalToBase,
  estimateUsdDecimal,
  getBtcTestnetBalance,
  getErc20Balance,
  getEvmTestnetBalance,
  getSolTestnetBalance,
  sendBtcTransfer,
  sendEvmTransfer,
  sendErc20Transfer,
  sendSolTransfer,
  sendSplTransfer,
  splToken,
  tokenInfo,
  type EvmSendResult,
} from './broadcast';
import { MAINNET_SPEND_CAP_USD } from '@intent-wallet/chains';
import { isMainnet } from './network';
import { recordRecipient } from './recents';

// ── the send model: chains + their assets ─────────────────────────────────────
type ChainKey = 'sepolia' | 'solana-devnet' | 'bitcoin-testnet';
type AssetKind = 'native' | 'erc20' | 'spl';
interface AssetDef {
  sym: string;
  dec: number;
  kind: AssetKind;
}
interface ChainDef {
  key: ChainKey;
  label: string;
  net: string;
  explorer: string;
  assets: AssetDef[];
}

const CHAINS: ChainDef[] = [
  {
    key: 'sepolia',
    label: 'Ethereum',
    net: 'Sepolia testnet',
    explorer: 'Etherscan',
    assets: [
      { sym: 'ETH', dec: 18, kind: 'native' },
      { sym: 'USDC', dec: 6, kind: 'erc20' },
    ],
  },
  {
    key: 'solana-devnet',
    label: 'Solana',
    net: 'Solana devnet',
    explorer: 'Solana Explorer',
    assets: [
      { sym: 'SOL', dec: 9, kind: 'native' },
      { sym: 'USDC', dec: 6, kind: 'spl' },
    ],
  },
  {
    key: 'bitcoin-testnet',
    label: 'Bitcoin',
    net: 'Bitcoin testnet',
    explorer: 'mempool.space',
    assets: [{ sym: 'tBTC', dec: 8, kind: 'native' }],
  },
];

const chainDef = (k: ChainKey): ChainDef => CHAINS.find((c) => c.key === k) ?? CHAINS[0];

/** The chain family an address on this chain must be, for raw-address validation. */
const FAMILY: Record<ChainKey, 'evm' | 'sol' | 'btc'> = {
  sepolia: 'evm',
  'solana-devnet': 'sol',
  'bitcoin-testnet': 'btc',
};

/** A live testnet balance for the selected asset on the selected chain, as a decimal string. */
async function balanceFor(chain: ChainKey, asset: AssetDef): Promise<string> {
  if (asset.kind === 'erc20') return getErc20Balance(asset.sym);
  if (asset.kind === 'spl') {
    // No on-chain SPL balance reader is wired; be honest and omit rather than fabricate.
    return '—';
  }
  if (chain === 'solana-devnet') return getSolTestnetBalance();
  if (chain === 'bitcoin-testnet') return getBtcTestnetBalance();
  return getEvmTestnetBalance();
}

// ── recipient resolution (contact → ENS → raw address) ────────────────────────
interface Recipient {
  /** The concrete address to send to, once a valid one is known. */
  address: string | null;
  /** UI hint: how the recipient resolved. */
  hint: { text: string; tone: 'ok' | 'bad' | 'pending' } | null;
}

function useRecipient(raw: string, chain: ChainKey): Recipient {
  const trimmed = raw.trim();
  const contactAddr = resolveContact(trimmed);
  const isEns = chain === 'sepolia' && /\.eth$/iu.test(trimmed);

  const [ensAddr, setEnsAddr] = useState<string | null>(null);
  const [ensResolving, setEnsResolving] = useState(false);

  // Debounced ENS lookup — EVM only, `.eth` names only, and never when a contact matched.
  useEffect(() => {
    if (!isEns || contactAddr) {
      setEnsAddr(null);
      setEnsResolving(false);
      return;
    }
    setEnsResolving(true);
    let live = true;
    const h = setTimeout(() => {
      resolveEnsName(trimmed)
        .then((a) => {
          if (live) setEnsAddr(a);
        })
        .catch(() => {
          if (live) setEnsAddr(null);
        })
        .finally(() => {
          if (live) setEnsResolving(false);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [trimmed, isEns, contactAddr]);

  if (!trimmed) return { address: null, hint: null };
  if (contactAddr) {
    // A saved contact can hold an address for ANY chain family — validate it against THIS chain
    // before it reaches the signer, exactly like a raw address (else a SOL contact routes to the EVM signer).
    const cf = classify(contactAddr);
    if (cf !== FAMILY[chain]) {
      return { address: null, hint: { text: `✕ Saved contact is a ${(cf ?? '?').toUpperCase()} address — wrong network`, tone: 'bad' } };
    }
    return { address: contactAddr, hint: { text: `✓ ${shortAddr(contactAddr)} · saved contact`, tone: 'ok' } };
  }
  if (isEns) {
    if (ensResolving) return { address: null, hint: { text: 'Resolving ENS…', tone: 'pending' } };
    if (ensAddr) return { address: ensAddr, hint: { text: `✓ ${shortAddr(ensAddr)}`, tone: 'ok' } };
    return { address: null, hint: { text: '✕ No ENS address record', tone: 'bad' } };
  }
  // Raw address — validate against the chain family.
  const fam = classify(trimmed);
  if (fam === FAMILY[chain]) {
    // BTC: the family check treats bc1 and tb1 as the same 'btc', so also require the bech32 HRP
    // to match the ACTIVE network — otherwise a tb1 (testnet) recipient advances on Mainnet and only
    // the signer rejects it late. bc1 = mainnet, tb1 = testnet.
    if (chain === 'bitcoin-testnet') {
      if (isMainnet() && !/^bc1/iu.test(trimmed)) return { address: null, hint: { text: '✕ Testnet address (tb1…) — Mainnet needs a bc1… address', tone: 'bad' } };
      if (!isMainnet() && !/^tb1/iu.test(trimmed)) return { address: null, hint: { text: '✕ Mainnet address (bc1…) — Testnet needs a tb1… address', tone: 'bad' } };
    }
    return { address: trimmed, hint: { text: `✓ Valid ${chain === 'sepolia' ? 'Ethereum' : chain === 'solana-devnet' ? 'Solana' : 'Bitcoin'} address`, tone: 'ok' } };
  }
  if (fam) return { address: null, hint: { text: `✕ That's a ${fam.toUpperCase()} address — wrong network`, tone: 'bad' } };
  return { address: null, hint: { text: '✕ Not a valid address, ENS name, or saved contact', tone: 'bad' } };
}

// ── the wizard ────────────────────────────────────────────────────────────────
export default function SendFlow({ onClose }: { onClose: () => void }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const mode = useMode();
  const pro = isPro(mode);
  const id = currentIdentity();

  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState('');
  const [chain, setChain] = useState<ChainKey>('sepolia');
  const [assetIdx, setAssetIdx] = useState(0);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EvmSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mainnetAck, setMainnetAck] = useState(false); // explicit real-funds confirm on mainnet
  const [highValueAck, setHighValueAck] = useState(false); // second confirm above the spend cap
  const [usdVal, setUsdVal] = useState<number | null>(null); // best-effort USD value of the send
  const inFlight = useRef(false); // re-entrancy latch for broadcast() — see below
  const [poisonBlocks, setPoisonBlocks] = useState<string[]>([]); // on-chain first-time poison HARD blocks
  const [poisonWarns, setPoisonWarns] = useState<string[]>([]); // non-fatal poison cautions
  const [poisonChecking, setPoisonChecking] = useState(false); // an on-chain check is in flight

  const def = chainDef(chain);
  const asset = def.assets[assetIdx] ?? def.assets[0];
  const recipient = useRecipient(raw, chain);
  // Labels follow the ACTIVE network so a real mainnet send is never labelled 'Sepolia'/'testnet'.
  const netLabel = isMainnet() ? (chain === 'sepolia' ? 'Ethereum' : chain === 'solana-devnet' ? 'Solana' : 'Bitcoin') : def.net;
  const explorerLabel = isMainnet() ? (chain === 'sepolia' ? 'Etherscan' : chain === 'solana-devnet' ? 'Solana Explorer' : 'mempool.space') : def.explorer;
  // Fail SAFE: on mainnet a still-loading/failed USD estimate (usdVal == null) counts as high-value
  // so the 2nd confirmation is required rather than the spend cap being silently skipped.
  const highValue = isMainnet() && (usdVal == null || usdVal > MAINNET_SPEND_CAP_USD);

  // Live balance whenever the chain/asset changes and we've reached the amount step.
  useEffect(() => {
    if (step < 2) return;
    let live = true;
    setBalance(null);
    balanceFor(chain, asset)
      .then((b) => {
        if (live) setBalance(b);
      })
      .catch(() => {
        if (live) setBalance('—');
      });
    return () => {
      live = false;
    };
  }, [step, chain, assetIdx]);

  // On-chain first-time POISON check (EVM recipients only — a non-0x target self-returns UNKNOWN). Catches
  // a lookalike of an on-chain counterparty or a dust-spray poisoner even on a fresh install (the local
  // guard only knows device history). Gates the send while checking AND on any hard block.
  useEffect(() => {
    const target = recipient.address;
    const meEvm = id?.evm.address;
    if (step < 3 || !target || !meEvm || !/^0x[0-9a-fA-F]{40}$/u.test(target)) {
      setPoisonBlocks([]);
      setPoisonWarns([]);
      setPoisonChecking(false);
      return;
    }
    let live = true;
    setPoisonChecking(true);
    assessRecipientLive({ chain: chain as ChainId, me: meEvm, target })
      .then((r) => {
        if (!live) return;
        setPoisonBlocks(r.blocked);
        setPoisonWarns(r.warnings);
      })
      .catch(() => {
        if (live) {
          setPoisonBlocks([]);
          setPoisonWarns([]);
        }
      })
      .finally(() => {
        if (live) setPoisonChecking(false);
      });
    return () => {
      live = false;
    };
  }, [step, chain, recipient.address, id]);

  // Best-effort USD value at the Review step — drives the mainnet high-value spend-cap confirmation.
  useEffect(() => {
    if (step !== 3 || !isMainnet()) {
      setUsdVal(null);
      return;
    }
    let live = true;
    estimateUsdDecimal(asset.sym, amount)
      .then((v) => live && setUsdVal(v))
      .catch(() => live && setUsdVal(null));
    return () => {
      live = false;
    };
  }, [step, amount, asset.sym]);

  // Reset both mainnet acks whenever what they attest to changes — so a stale confirmation from a
  // prior (smaller) amount can never authorize a different/larger send.
  useEffect(() => {
    setMainnetAck(false);
    setHighValueAck(false);
  }, [amount, raw, chain, assetIdx]);

  // Strict base-ten validation that MIRRORS the BigInt parsers in broadcast.ts. Number() would
  // accept '0x10' (→16) and '1e-3', which the parsers then reinterpret or reject — so validate the
  // exact string the parser will consume: digits, one optional dot, no more fraction than the asset's decimals.
  const amountOk = useMemo(() => {
    const t = amount.trim();
    if (!/^\d+(\.\d+)?$/u.test(t)) return false;
    const frac = t.split('.')[1] ?? '';
    if (frac.length > asset.dec) return false;
    return Number(t) > 0;
  }, [amount, asset.dec]);

  // Insufficient-balance guard — only when the balance is actually known (fail-soft: a failed read
  // shows "balance unknown" and does NOT block, since it may be a display outage, not a real zero).
  const balanceKnown = balance != null && balance !== '—' && Number.isFinite(Number(balance));
  // Compare in integer base units (BigInt), not JS floats — Number() loses precision at high
  // magnitudes and could wrongly pass/block a send at the exact-balance boundary.
  const overBalance =
    amountOk && balanceKnown && BigInt(decimalToBase(amount, asset.dec)) > BigInt(decimalToBase(balance, asset.dec));

  if (!id) {
    return (
      <Sheet title="Send" onClose={onClose}>
        <Card>
          <Text style={s.emptyTitle}>Wallet locked</Text>
          <Text style={s.emptyMeta}>Unlock your wallet to send.</Text>
        </Card>
      </Sheet>
    );
  }

  // Cumulative session-drain guard (ported from web): BLOCK a multi-send that empties the wallet across
  // several sends this session (>= 90% cumulative once something already left). A self-send never leaves
  // the wallet, so it's exempt. Base units reuse the strict conversion above; a failed balance read leaves
  // balanceBase null -> 'none' (fail-soft, like the over-balance check).
  const ownForChain = chain === 'solana-devnet' ? id.sol.address : chain === 'bitcoin-testnet' ? id.btc.address : id.evm.address;
  const selfSend = !!recipient.address && recipient.address.toLowerCase() === ownForChain.toLowerCase();
  const amountBaseBI = amountOk ? BigInt(decimalToBase(amount, asset.dec)) : null;
  const balanceBaseBI = balanceKnown ? BigInt(decimalToBase(balance as string, asset.dec)) : null;
  const drain: 'block' | 'warn' | 'none' =
    selfSend || amountBaseBI === null
      ? 'none'
      : assessSessionDrain({ priorBase: priorOutflow(chain, asset.sym), amountBase: amountBaseBI, balanceBase: balanceBaseBI });

  // Announce an async safety verdict to a screen reader — the on-chain poison check resolves after the
  // user reaches Review and then silently disables Next/Send; without this an SR user gets no signal
  // (parity with web's aria-live). announceForAccessibility works on iOS + Android.
  useEffect(() => {
    const msg =
      drain === 'block'
        ? 'Blocked: together with this session, this would empty your balance.'
        : poisonBlocks[0];
    if (msg) AccessibilityInfo.announceForAccessibility(`Blocked. ${msg}`);
  }, [drain, poisonBlocks]);

  const pickChain = (k: ChainKey): void => {
    setChain(k);
    setAssetIdx(0);
    setError(null);
  };

  const broadcast = async (): Promise<void> => {
    // Re-entrancy latch: a synchronous double-tap fires two onPress before React re-renders/unmounts
    // the button — without this, each would independently sign + sendRawTransaction (two real txs).
    // A ref (not `sending` state, which is stale within the same tick) closes that window.
    if (inFlight.current) return;
    if (!recipient.address) {
      setError('Enter a valid recipient.');
      return;
    }
    // Code-level mainnet guard (not just the disabled button): never broadcast with
    // acknowledgeMainnet:true unless the user actually checked the box — a stale-state or refactor
    // race can't slip a real-funds send past the acknowledgement.
    if (isMainnet() && !mainnetAck) {
      setError('Confirm the mainnet warning before sending.');
      return;
    }
    inFlight.current = true;
    beginBroadcast(); // block an account switch until this send settles (wrong-account/nonce guard)
    setSending(true);
    setError(null);
    setStep(4);
    try {
      const to = recipient.address;
      // On mainnet the guard requires an explicit ack; above the spend cap it needs a second
      // high-value confirmation too. Thread the USD value + both acks from the UI.
      const g = isMainnet()
        ? { guard: { acknowledgeMainnet: true, ...(usdVal != null ? { amountUsd: usdVal } : {}), ...(highValueAck ? { acknowledgeHighValue: true } : {}) } }
        : {};
      let r: EvmSendResult;
      if (asset.kind === 'erc20') {
        const t = tokenInfo(asset.sym);
        if (!t) throw new Error(`${asset.sym} is not a known token on this network`);
        r = await sendErc20Transfer({ token: t, to, amountBase: decimalToBase(amount, t.decimals), ...g });
      } else if (asset.kind === 'spl') {
        const t = splToken(asset.sym);
        if (!t) throw new Error(`${asset.sym} is not a known SPL token on this cluster`);
        r = await sendSplTransfer({ mint: t.mint, decimals: t.decimals, toOwner: to, amountBase: decimalToBase(amount, t.decimals), ...g });
      } else if (chain === 'solana-devnet') {
        r = await sendSolTransfer({ to, solAmount: amount, ...g });
      } else if (chain === 'bitcoin-testnet') {
        r = await sendBtcTransfer({ to, btcAmount: amount, ...g });
      } else {
        r = await sendEvmTransfer({ to, ethAmount: amount, ...g });
      }
      setResult(r);
      // Remember this recipient so a later POISONING lookalike of it is refused — no manual
      // contact-saving needed; this send itself becomes the known-good reference.
      recordRecipient(to);
      // Feed the cumulative session-drain ledger (a self-send never left the wallet, so it must NOT accrue).
      if (!selfSend && amountBaseBI != null) recordOutflow(chain, asset.sym, amountBaseBI);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Broadcast failed.');
    } finally {
      setSending(false);
      inFlight.current = false;
      endBroadcast();
    }
  };

  const faucetNote = isMainnet()
    ? `Fund your ${netLabel} address with real funds first — an empty address has nothing to spend, and every send also needs gas.`
    : chain === 'bitcoin-testnet'
      ? 'Fund your tb1q… address from a Bitcoin testnet faucet first — an empty address has no UTXOs to spend.'
      : chain === 'solana-devnet'
        ? 'Fund your address with devnet SOL from a faucet first — otherwise the node rejects the transfer for insufficient funds.'
        : 'Fund your address with Sepolia ETH from a faucet first — otherwise the node returns "insufficient funds".';

  // ── per-step body ────────────────────────────────────────────────────────────
  const hintColor = (tone: 'ok' | 'bad' | 'pending'): string => (tone === 'ok' ? c.success : tone === 'bad' ? c.danger : c.text2);

  return (
    <Sheet title="Send" onClose={onClose}>
      <View style={s.dots}>
        <ProgressDots count={5} active={step} />
      </View>

      {step === 0 && (
        <View style={s.stepGap}>
          <Text style={s.stepTitle}>Who are you sending to?</Text>
          <Field
            value={raw}
            onChangeText={setRaw}
            placeholder="0x… · name.eth · saved contact"
            mono
            autoFocus
          />
          {recipient.hint && (
            <Text style={[s.hint, { color: hintColor(recipient.hint.tone) }]}>{recipient.hint.text}</Text>
          )}
          <Text style={s.helper}>Send to a saved contact by name, an ENS name, or a raw address.</Text>
        </View>
      )}

      {step === 1 && (
        <View style={s.stepGap}>
          <Text style={s.stepTitle}>What are you sending?</Text>
          {pro ? (
            <>
              <Text style={s.groupLabel}>NETWORK</Text>
              <View style={s.chipRow}>
                {CHAINS.map((c) => (
                  <Chip key={c.key} label={c.label} active={chain === c.key} onPress={() => pickChain(c.key)} />
                ))}
              </View>
              <Text style={[s.groupLabel, { marginTop: space.sm }]}>ASSET</Text>
              <View style={s.chipRow}>
                {def.assets.map((a, i) => (
                  <Chip
                    key={a.sym}
                    label={a.kind === 'native' ? a.sym : `${a.sym} · ${a.kind.toUpperCase()}`}
                    active={assetIdx === i}
                    onPress={() => setAssetIdx(i)}
                  />
                ))}
              </View>
              <Text style={s.helper}>Sending on {def.net}.</Text>
            </>
          ) : (
            <>
              <View style={s.chipRow}>
                {def.assets.map((a, i) => (
                  <Chip key={a.sym} label={a.sym} active={assetIdx === i} onPress={() => setAssetIdx(i)} />
                ))}
              </View>
              <Text style={s.helper}>On Ethereum (Sepolia testnet). Switch to Pro mode to send on Solana or Bitcoin.</Text>
            </>
          )}
        </View>
      )}

      {step === 2 && (
        <View style={s.stepGap}>
          <Text style={s.stepTitle}>How much?</Text>
          <View style={s.amountRow}>
            <Field value={amount} onChangeText={setAmount} placeholder="0.0" keyboardType="decimal-pad" mono autoFocus />
            <Text style={s.amountSym}>{asset.sym}</Text>
          </View>
          <View style={s.balanceRow}>
            <Text style={s.helper}>
              Balance{' '}
              <Text style={s.balanceVal}>
                {balance == null ? '…' : balance === '—' ? 'unknown' : `${balance} ${asset.sym}`}
              </Text>
            </Text>
            {balanceKnown && Number(balance) > 0 && <TextButton label="Max" onPress={() => setAmount(balance ?? '')} />}
          </View>
          {overBalance && <Text style={[s.hint, { color: c.danger }]}>✕ More than your {asset.sym} balance ({balance} {asset.sym}).</Text>}
          {amount.trim().length > 0 && !amountOk && <Text style={[s.hint, { color: c.danger }]}>✕ Enter a plain amount like 0.5 (up to {asset.dec} decimals).</Text>}
          {!overBalance && drain === 'block' && (
            <Text style={[s.hint, { color: c.danger }]}>⛔ Together with this session's sends, this empties your wallet. Send a smaller amount.</Text>
          )}
          {!overBalance && drain === 'warn' && <Text style={[s.hint, { color: c.warn }]}>⚠ This is most of your {asset.sym} balance.</Text>}
        </View>
      )}

      {step === 3 && (
        <View style={s.stepGap}>
          <Text style={s.stepTitle}>Review before signing</Text>
          <Text style={s.irreversible}>This is irreversible.</Text>
          {poisonChecking && <Text style={s.hint}>Checking the recipient on-chain…</Text>}
          {poisonBlocks.map((b, i) => (
            <Text key={`pb${i}`} style={[s.hint, { color: c.danger }]}>🧬 {b}</Text>
          ))}
          {poisonBlocks.length === 0 &&
            poisonWarns.map((w, i) => (
              <Text key={`pw${i}`} style={[s.hint, { color: c.warn }]}>⚠ {w}</Text>
            ))}
          <Card style={s.reviewCard}>
            <ReviewRow label="Amount" value={`${amount} ${asset.sym}`} big />
            <View style={s.toBlock}>
              <Text style={s.reviewLabel}>To</Text>
              {recipient.address ? (
                <Text selectable style={s.toAddr}>
                  {recipient.address}
                </Text>
              ) : (
                <Text style={[s.toAddr, { color: c.danger }]}>{recipient.hint?.text ?? 'No valid recipient — go back and re-enter.'}</Text>
              )}
              {recipient.address && recipient.hint && (
                <Text style={[s.hint, { color: hintColor(recipient.hint.tone) }]}>{recipient.hint.text}</Text>
              )}
            </View>
            <ReviewRow label="Network" value={isMainnet() ? 'Mainnet' : def.net} />
          </Card>
          {isMainnet() && (
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
          )}
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
        </View>
      )}

      {step === 4 && (
        <View style={s.stepGap}>
          {sending && (
            <View style={s.center}>
              <ActivityIndicator color={c.accent} />
              <Text style={s.stepTitle}>Signing on-device & broadcasting…</Text>
              <Text style={s.helper}>Your key never leaves this phone.</Text>
            </View>
          )}

          {!sending && result && (
            <View style={s.center}>
              <Text style={s.successMark}>✓</Text>
              <Text style={s.stepTitle}>Sent on {netLabel}</Text>
              <Card style={s.reviewCard}>
                <ReviewRow label="Amount" value={`${amount} ${asset.sym}`} big />
                <ReviewRow label="To" value={shortAddr(recipient.address ?? '')} mono />
                <ReviewRow label="Tx" value={shortAddr(result.txid)} mono />
              </Card>
              <View style={s.resultActions}>
                <TextButton label={`View on ${explorerLabel} ↗`} onPress={() => void Linking.openURL(result.explorerUrl)} />
                <TextButton label="Copy tx id" tone="muted" onPress={() => void Clipboard.setStringAsync(result.txid)} />
              </View>
            </View>
          )}

          {!sending && error && (
            <View style={s.stepGap}>
              <Text style={s.failMark}>Couldn’t send</Text>
              <Card style={[s.reviewCard, { borderColor: c.danger }]}>
                <Text style={s.errText}>{error}</Text>
              </Card>
              <Text style={s.helper}>{faucetNote}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── footer: one primary per step ─────────────────────────────────────── */}
      <View style={s.footer}>{renderFooter()}</View>
    </Sheet>
  );

  function renderFooter(): React.JSX.Element {
    // Step 4 is terminal: success closes; error offers retry or edit.
    if (step === 4) {
      if (sending) return <View />;
      if (result) return <PrimaryButton label="Done" onPress={onClose} grow />;
      return (
        <>
          <SecondaryButton label="Edit" onPress={() => setStep(3)} grow />
          <PrimaryButton label="Try again" onPress={() => void broadcast()} busy={sending} grow />
        </>
      );
    }

    const back =
      step === 0 ? (
        <SecondaryButton label="Cancel" onPress={onClose} grow />
      ) : (
        <SecondaryButton label="Back" onPress={() => setStep((n) => n - 1)} grow />
      );

    let nextDisabled = false;
    let onNext = (): void => setStep((n) => n + 1);
    let nextLabel = 'Next';

    // The recipient can be invalidated AFTER step 0 — e.g. switching the network makes a raw address
    // the wrong family. Re-gate every pre-broadcast step on a currently-valid recipient.
    const recipientOk = recipient.address != null;
    if (step === 0) {
      nextDisabled = !recipientOk;
    } else if (step === 1) {
      nextDisabled = !recipientOk;
    } else if (step === 2) {
      nextDisabled = !amountOk || overBalance || drain === 'block' || !recipientOk;
    } else if (step === 3) {
      nextLabel = isMainnet() ? 'Send REAL funds' : 'Confirm & send';
      onNext = () => void broadcast();
      nextDisabled =
        !recipientOk || drain === 'block' || poisonBlocks.length > 0 || poisonChecking || (isMainnet() && (!mainnetAck || (highValue && !highValueAck)));
    }

    return (
      <>
        {back}
        <PrimaryButton label={nextLabel} onPress={onNext} disabled={nextDisabled} busy={step === 3 && sending} grow />
      </>
    );
  }
}

function ReviewRow({ label, value, mono: isMono, big }: { label: string; value: string; mono?: boolean; big?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.reviewRow}>
      <Text style={s.reviewLabel}>{label}</Text>
      <Text style={[big ? s.reviewValueBig : s.reviewValue, isMono && { fontFamily: mono }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  dots: { alignItems: 'center', paddingBottom: space.sm },
  stepGap: { gap: space.md },
  stepTitle: { ...T.title, color: c.text },
  helper: { ...T.caption, color: c.text3, lineHeight: 18 },
  groupLabel: { ...T.label, color: c.text3 },
  hint: { ...T.caption },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountSym: { ...T.headline, color: c.text2 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceVal: { color: c.text2, fontVariant: ['tabular-nums'] },

  irreversible: { ...T.caption, color: c.warn },
  reviewCard: { gap: space.md },
  mainnetAck: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger, backgroundColor: 'rgba(220,59,59,0.06)' },
  ackBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  ackBoxOn: { backgroundColor: c.danger },
  ackMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  ackTxt: { ...T.caption, color: c.danger, flex: 1, lineHeight: 17, fontWeight: '600' },
  toBlock: { gap: 4 },
  toAddr: { fontFamily: mono, fontSize: 13.5, color: c.text, lineHeight: 20 },
  reviewRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  reviewLabel: { ...T.caption, color: c.text3 },
  reviewValue: { ...T.body, color: c.text, flexShrink: 1, textAlign: 'right' },
  reviewValueBig: { ...T.headline, color: c.text, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },

  center: { alignItems: 'center', gap: space.md, paddingVertical: space.base },
  successMark: { fontSize: 44, color: c.success, fontWeight: '800' },
  failMark: { ...T.title, color: c.danger },
  errText: { ...T.body, color: c.text2, lineHeight: 20 },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },

  emptyTitle: { ...T.headline, color: c.text },
  emptyMeta: { ...T.caption, color: c.text3, marginTop: space.xs },

  footer: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
