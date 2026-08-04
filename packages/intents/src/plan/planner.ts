/**
 * The Planner — the deterministic core that turns a validated `Intent` into an
 * `ExecutionPlan` (or a clarify / rejection). This is where the safety checks
 * live: balance, recipient validity + network match, route availability, and
 * risk. The AI never reaches here — it only produced the typed Intent; the
 * planner VERIFIES and PLANS, and nothing executes without this plan plus a
 * device signature downstream (ADR-0032). The planner never signs or executes.
 */
import { usdToMicros } from '@intent-wallet/portfolio';
import { baseToDecimal, formatMicrosOrDash } from './format.js';
import type { Amount, ExecutionPlan, Intent, PlanAmount, PlanStep, RiskReport } from '../schema.js';
import { IntentError, isIntentError } from '../errors.js';
import { resolveAmountToBase } from './resolve.js';
import type { EngineContext, Holding, Route } from './context.js';

export type PlanOutcome =
  | { kind: 'plan'; plan: ExecutionPlan }
  | { kind: 'clarify'; question: string; options?: string[] }
  | { kind: 'automation'; intent: Intent }
  | { kind: 'answer'; question: string }
  | { kind: 'rejected'; reason: string; risk: RiskReport };

const LOW_RISK: RiskReport = { level: 'low', reasons: [] };
const STABLES = ['USDC', 'USDT', 'DAI'];
/** Native proof-of-stake assets the wallet can stake (per the chain capability profiles:
 *  Ethereum / Solana / Polygon are PoS). Stablecoins and non-PoS assets (BTC) are NOT staked —
 *  "stake USDC" is a category error, not a plan. */
const STAKEABLE = new Set(['ETH', 'SOL', 'POL', 'MATIC']);

/** Simplified asset → ecosystem for recipient network-matching (canonical registry is a follow-up). */
/**
 * Which chain family an asset settles on. Table-driven, because the old if-chain defaulted
 * EVERYTHING except BTC/SOL to 'evm' — including dUSDC, the wallet's Solana devnet dollar. That
 * silently inverted both checks for it: a dUSDC send to a real Solana address was refused as
 * "a different network", and one to an EVM address was accepted. (WBTC/GUSDC stay 'evm' — they
 * really are EVM tokens.)
 */
const ASSET_ECOSYSTEM: Record<string, 'btc' | 'sol' | 'evm'> = {
  BTC: 'btc',
  SOL: 'sol',
  DUSDC: 'sol',
};
function assetEcosystem(symbol: string): 'btc' | 'sol' | 'evm' {
  return ASSET_ECOSYSTEM[symbol.toUpperCase()] ?? 'evm';
}

/**
 * A chain the user can NAME → the chain id this wallet settles it on. Anything absent from here is
 * a chain the wallet has no route to at all ("arbitrum", "optimism", "base", "ethereum mainnet").
 */
const NAMED_CHAINS: Record<string, string> = {
  giwa: 'eip155:91342',
  'giwa sepolia': 'eip155:91342',
  l2: 'eip155:91342',
  sepolia: 'eip155:11155111',
  'ethereum sepolia': 'eip155:11155111',
  l1: 'eip155:11155111',
  solana: 'solana:mainnet',
  'solana devnet': 'solana:mainnet',
  bitcoin: 'bip122:bitcoin',
  'bitcoin testnet': 'bip122:bitcoin',
};

const CHAIN_LABEL: Record<string, string> = {
  'eip155:91342': 'GIWA Sepolia',
  'eip155:11155111': 'Ethereum Sepolia',
  'eip155:1': 'Ethereum',
  'solana:mainnet': 'Solana',
  'bip122:bitcoin': 'Bitcoin',
};
const chainLabel = (id: string): string => CHAIN_LABEL[id] ?? id;

/** The chain id for a name the user typed, or null when this wallet has no such chain. */
function resolveNamedChain(name: string): string | null {
  return NAMED_CHAINS[name.trim().toLowerCase()] ?? null;
}

/**
 * Where a transfer of each asset ACTUALLY settles today.
 *
 * This mirrors `executableTransfer` in the web client, which derives the chain from the ASSET and
 * reads the plan's own `chainId` exactly zero times — verified: the plan says `eip155:1` (Ethereum
 * mainnet) for an ETH send, while a real send from this wallet settled on GIWA Sepolia. Without this
 * map the planner could only refuse chains it has no route to, and "send ETH on sepolia" would pass
 * through to be silently redirected to GIWA — the same silent substitution, one layer down.
 *
 * MUST stay in sync with `executableTransfer`. The proper fix is to make the plan's chain truthful
 * and have the client honour it (roadmap #1); that changes every transfer plan, so it is not this
 * change. Absent asset ⇒ no claim is made and the request passes through unchanged.
 */
const TRANSFER_HOME_CHAIN: Record<string, string> = {
  ETH: 'eip155:91342', // GIWA, through the deployed IntentExecutor
  GUSDC: 'eip155:91342',
  USDC: 'eip155:11155111', // ERC-20s stay on Sepolia — no GIWA token map yet
  USDT: 'eip155:11155111',
  DAI: 'eip155:11155111',
  SOL: 'solana:mainnet', // executed on devnet
  DUSDC: 'solana:mainnet',
  BTC: 'bip122:bitcoin', // executed on testnet
};

const NET_LABEL: Record<'btc' | 'sol' | 'evm', string> = {
  btc: 'a Bitcoin address',
  sol: 'a Solana address',
  evm: 'an EVM (0x…) address',
};

/**
 * The same-purpose asset on another chain family, where this wallet genuinely has one — so a
 * cross-network mismatch can say what WOULD work instead of dead-ending at "not possible".
 *
 * Only the dollars map 1:1 (dUSDC IS this wallet's Solana dollar). BTC→WBTC is deliberately
 * absent: wrapped BTC is a different asset with different trust assumptions, not a chain variant,
 * and offering it would be exactly the quiet substitution this planner exists to refuse.
 */
const DOLLARS = new Set(['USDC', 'USDT', 'DAI', 'GUSDC']);
function siblingOnEcosystem(symbol: string, eco: 'btc' | 'sol' | 'evm'): string | null {
  const s = symbol.toUpperCase();
  if (eco === 'sol' && DOLLARS.has(s)) return 'DUSDC';
  if (eco === 'evm' && s === 'DUSDC') return 'USDC';
  return null;
}

/**
 * Why no route exists — a transient "try later" and a structural "this can never be one swap" are
 * very different answers, and saying "right now" for the second one invites the user to keep
 * retrying something impossible. A swap settles in ONE pool on ONE chain, so assets from different
 * chain families can only be exchanged by bridging first.
 */
function noRouteReason(fromAsset: string, toAsset: string): string {
  if (assetEcosystem(fromAsset) === assetEcosystem(toAsset)) {
    return `No route to convert ${fromAsset} to ${toAsset} right now.`;
  }
  return `${fromAsset} and ${toAsset} are on different chains, so no single swap can convert between them — that needs a bridge. This wallet bridges Ethereum Sepolia → GIWA in ETH; ${fromAsset} → ${toAsset} is not a route it has. Nothing was planned or signed.`;
}

export async function planIntent(intent: Intent, ctx: EngineContext): Promise<PlanOutcome> {
  switch (intent.kind) {
    case 'clarify':
      return intent.options
        ? { kind: 'clarify', question: intent.question, options: intent.options }
        : { kind: 'clarify', question: intent.question };
    case 'unsupported':
      return { kind: 'rejected', reason: intent.reason, risk: LOW_RISK };
    case 'query':
      return answerQuery(intent.question, ctx);
    case 'recurring':
    case 'emergency_exit':
      return { kind: 'automation', intent };
    case 'transfer':
      return withResolutionErrors(() => planTransfer(intent, ctx));
    case 'swap':
      return withResolutionErrors(() => planSwap(intent.fromAsset, intent.toAsset, intent.amount, ctx, intent.chain));
    case 'swap_and_send':
      return withResolutionErrors(() => planSwapAndSend(intent, ctx));
    case 'buy':
      return withResolutionErrors(() => planBuy(intent.asset, intent.amount, ctx));
    case 'stake':
      return withResolutionErrors(() => planStake(intent.asset, intent.amount, ctx));
    case 'rebalance':
      return withResolutionErrors(() => planRebalance(ctx));
  }
}

/** Turns a RESOLUTION_FAILED IntentError (e.g. non-USD fiat, missing price) into a clarify. */
async function withResolutionErrors(fn: () => Promise<PlanOutcome>): Promise<PlanOutcome> {
  try {
    return await fn();
  } catch (err) {
    if (isIntentError(err, 'RESOLUTION_FAILED')) return { kind: 'clarify', question: err.message };
    throw err;
  }
}

async function planTransfer(intent: Extract<Intent, { kind: 'transfer' }>, ctx: EngineContext): Promise<PlanOutcome> {
  const holding = ctx.holdings.get(intent.asset);
  if (!holding) return { kind: 'rejected', reason: `You don't hold any ${intent.asset}.`, risk: LOW_RISK };

  const amountBase = resolveAmountToBase(intent.amount, holding, ctx.prices);
  if (amountBase <= 0n) return { kind: 'clarify', question: 'How much would you like to send?' };
  if (amountBase > holding.totalBase) {
    return {
      kind: 'rejected',
      reason: `That's more than your ${holding.symbol} balance (${baseToDecimal(holding.totalBase, holding.decimals)}).`,
      risk: LOW_RISK,
    };
  }
  // TIER-SPLIT: a whole-wallet (max) transfer is the demonstrated drain path — the NL layer is
  // NOT permitted to author it into a signable plan. Step-up habituates (users tap through); a
  // whole-wallet move must go through the structured Send flow, where the amount and recipient
  // are set field-by-field and free text never becomes a max-value transfer. This changes what
  // the parser is ALLOWED to do with dangerous input, not just how the confirmation looks.
  // The trip is on the RESOLVED amount, so "send all", "send 2 ETH" (=full), "100%", $-priced-to-
  // full, and unit-obfuscated variants all land here — AND a near-whole send that leaves only
  // dust (< 1% remaining) is a functional drain, so it's blocked too. CUMULATIVE: we add what the
  // user has already sent this session (injected ledger), so a drain SPLIT across several
  // under-threshold sends (1 ETH, then 0.99 ETH) is caught on the send that completes it — a
  // per-transaction check alone can't see cumulative depletion.
  const priorOut = ctx.sessionOutflowBase?.(intent.asset) ?? 0n;
  const cumulative = amountBase + priorOut;
  if ((holding.totalBase - cumulative) * 100n < holding.totalBase) {
    return {
      kind: 'rejected',
      reason:
        priorOut > 0n
          ? `Together with what you've already sent this session, this empties your ${holding.symbol}. Use Send to move the rest — you set the amount and confirm the recipient there.`
          : `For your safety I won't move your entire ${holding.symbol} balance from a typed message. Open Send to make a max transfer — you set the amount and confirm the recipient there.`,
      risk: LOW_RISK,
    };
  }

  const recipient = await ctx.resolveRecipient(intent.recipient);
  if (recipient.kind === 'not_found') {
    // An EVM-address-shaped query that fails to resolve almost always failed its EIP-55
    // checksum — a single mistyped character. Say THAT (Sentinel's typo defense), not the
    // generic "add a contact" — which reads as if the wallet just doesn't recognize a name.
    if (/^0x[0-9a-fA-F]{40}$/u.test(recipient.query)) {
      return {
        kind: 'clarify',
        question: `That address looks mistyped — "${recipient.query}" fails its checksum (change one character and a real address stops validating). Sentinel stopped it so your funds can't go to a wrong or dead wallet. Paste the exact, correct address to continue.`,
      };
    }
    return { kind: 'clarify', question: `I don't know "${recipient.query}". Paste an address or add a contact.` };
  }
  if (recipient.kind === 'ambiguous') {
    return { kind: 'clarify', question: 'Which one did you mean?', options: recipient.candidates.map((c) => c.name) };
  }
  const address = recipient.kind === 'contact' ? recipient.contact.address : recipient.address;
  const recipientEcosystem = recipient.kind === 'contact' ? recipient.contact.ecosystem : recipient.ecosystem;
  if (recipientEcosystem !== assetEcosystem(intent.asset)) {
    // "That address is on a different network" was a dead end: true, but it left the user with no
    // idea what WOULD work. Where the wallet holds the equivalent asset on the recipient's own
    // network, name it and hand over the exact command. Never substitute it silently — the user
    // re-states the intent, so the asset that gets signed is always one they asked for by name.
    const sibling = siblingOnEcosystem(intent.asset, recipientEcosystem);
    const shown = baseToDecimal(amountBase, holding.decimals);
    if (sibling) {
      const siblingHolding = ctx.holdings.get(sibling);
      return {
        kind: 'clarify',
        question: siblingHolding
          ? `${intent.asset} doesn't exist on that address's network — ${shorten(address)} is ${NET_LABEL[recipientEcosystem]}. This wallet's dollar there is ${sibling}, and you hold ${baseToDecimal(siblingHolding.totalBase, siblingHolding.decimals)}. To send that instead: “send ${shown} ${sibling} to ${address}”.`
          : `${intent.asset} doesn't exist on that address's network — ${shorten(address)} is ${NET_LABEL[recipientEcosystem]}. The equivalent there is ${sibling}, but you don't hold any, so there's nothing to send. Give ${NET_LABEL[assetEcosystem(intent.asset)]} to send ${intent.asset}.`,
      };
    }
    return {
      kind: 'rejected',
      reason: `That address is on a different network than ${intent.asset} — sending ${intent.asset} needs ${NET_LABEL[assetEcosystem(intent.asset)]}, and ${shorten(address)} is ${NET_LABEL[recipientEcosystem]}.`,
      risk: LOW_RISK,
    };
  }

  const risk = await ctx.risk.scan({ type: 'recipient', value: address });
  if (risk.level === 'block') return { kind: 'rejected', reason: 'Blocked for your safety.', risk };

  // A named chain must be honoured or refused — never quietly swapped for another. "send 0.5 ETH to
  // 0x… on arbitrum" is the right address on the wrong network, which for a contract or exchange
  // deposit address is a permanent loss.
  if (intent.chain !== undefined) {
    const wanted = resolveNamedChain(intent.chain);
    if (wanted === null) {
      return {
        kind: 'rejected',
        reason: `You asked to send on ${intent.chain}, which this wallet has no route to — it settles transfers on GIWA Sepolia, Ethereum Sepolia, Solana and Bitcoin. Nothing has been signed. Sending ${intent.asset} to that address on another network could be unrecoverable, so I stopped instead of choosing a chain for you.`,
        risk: LOW_RISK,
      };
    }
    const home = TRANSFER_HOME_CHAIN[intent.asset.toUpperCase()];
    if (home !== undefined && wanted !== home) {
      return {
        kind: 'clarify',
        question: `You asked to send ${intent.asset} on ${intent.chain}, but this wallet settles ${intent.asset} transfers on ${chainLabel(home)}. Nothing has been signed — send the same message without the chain name to proceed on ${chainLabel(home)}.`,
      };
    }
  }

  const chainId = ctx.defaultChainFor(intent.asset);
  const feeMicros = await ctx.estimateFeeMicros(chainId);
  const send = toPlanAmount(intent.asset, amountBase, holding.decimals, ctx);

  const step: PlanStep = {
    seq: 0,
    kind: 'transfer',
    chainId,
    description: `Send ${baseToDecimal(amountBase, holding.decimals)} ${intent.asset} to ${shorten(address)}`,
    dependsOn: [],
    params: { asset: intent.asset, amountBase: amountBase.toString(), to: address },
  };

  return {
    kind: 'plan',
    plan: finalizePlan(
      ctx,
      'transfer',
      {
        assets: [intent.asset],
        sourceChains: [chainId],
        destChains: [chainId],
        steps: [step],
        quote: quote(send, null, feeMicros, 0, 15),
        risk,
        fallback: 'If the network rejects it, nothing is sent and your funds stay put.',
        rollback: null,
        confirmation: `Send ${baseToDecimal(amountBase, holding.decimals)} ${intent.asset} to ${
          recipient.kind === 'contact' ? recipient.contact.name : shorten(address)
        }. Network fee ~${formatMicrosOrDash(feeMicros)}.`,
      },
    ),
  };
}

async function planSwap(
  fromAsset: string,
  toAsset: string,
  amount: Amount,
  ctx: EngineContext,
  /** The chain the user named, if any — see `chainMismatch`. `planBuy` funds a swap and names none. */
  requestedChain?: string,
): Promise<PlanOutcome> {
  const holding = ctx.holdings.get(fromAsset);
  if (!holding) return { kind: 'rejected', reason: `You don't hold any ${fromAsset}.`, risk: LOW_RISK };
  const amountBase = resolveAmountToBase(amount, holding, ctx.prices);
  if (amountBase <= 0n) return { kind: 'clarify', question: 'How much would you like to convert?' };
  if (amountBase > holding.totalBase) {
    return { kind: 'rejected', reason: `That's more than your ${fromAsset} balance.`, risk: LOW_RISK };
  }
  // TIER-SPLIT (no blanket swap exemption): a whole-wallet (or dust-leaving) swap into an ARBITRARY
  // token from typed text is a drain SETUP — "value stays yours" is local reasoning; the
  // destination token or route can be the trap. NL may not author a max conversion; a deliberate
  // full swap goes through the app's Swap flow. (Whole-wallet moves into KNOWN stablecoins are the
  // separate `rebalance` path, which is allowed.)
  if ((holding.totalBase - amountBase) * 100n < holding.totalBase) {
    return {
      kind: 'rejected',
      reason: `For your safety I won't convert your entire ${fromAsset} balance from a typed message — a whole-wallet swap is a common drain setup. Do a max conversion deliberately in the app, or say "move everything to stablecoins".`,
      risk: LOW_RISK,
    };
  }

  const route = await ctx.routes.findRoute({
    fromSymbol: fromAsset,
    toSymbol: toAsset,
    amountBase,
    fromDecimals: holding.decimals,
  });
  if (!route)
    return { kind: 'rejected', reason: noRouteReason(fromAsset, toAsset), risk: LOW_RISK };

  const mismatch = chainMismatch(requestedChain, route.legs[0]?.chainId, 'convert');
  if (mismatch) return mismatch;

  const risk = await ctx.risk.scan({ type: 'token', value: toAsset });
  if (risk.level === 'block') return { kind: 'rejected', reason: `${toAsset} is flagged as unsafe.`, risk };

  return {
    kind: 'plan',
    plan: buildRoutePlan(ctx, fromAsset, toAsset, amountBase, holding, route, risk, fullBalanceNote(amountBase, holding)),
  };
}

/**
 * Refuse to settle on a chain other than the one the user NAMED.
 *
 * The parser used to strip "on sepolia" and forget it, so a swap the user asked for on Sepolia
 * executed on GIWA and reported success — the same silent-substitution class as a dropped recipient.
 * Returning a `clarify` (not a plan) also closes the AUTO path for free: `PlanFlow` — which owns the
 * auto-sign effect — only mounts for a `plan` outcome, so nothing can be auto-signed on a mismatch.
 *
 * We do NOT offer to route it elsewhere: conversions settle where the router says, and promising a
 * chain the executor cannot reach would just move the lie one step later.
 */
function chainMismatch(requested: string | undefined, actual: string | undefined, verb: string): PlanOutcome | null {
  if (requested === undefined || actual === undefined) return null;
  const wanted = resolveNamedChain(requested);
  if (wanted === actual) return null; // asked for exactly where it settles — proceed silently
  const where = chainLabel(actual);
  return {
    kind: 'clarify',
    question:
      wanted === null
        ? `You asked to ${verb} on ${requested}, which this wallet has no route to. It settles on ${where}. Nothing has been signed — send the same message without the chain name to proceed on ${where}.`
        : `You asked to ${verb} on ${requested}, but this wallet ${verb}s on ${where}. Nothing has been signed — send the same message without the chain name to proceed on ${where}.`,
  };
}

/**
 * Compound: convert, THEN send the proceeds. Produces a 2-step plan — the swap leg(s) followed by
 * a transfer of the received `toAsset` to the recipient. The recipient is validated UP FRONT
 * (checksum + right-network) so a bad send target aborts before any swap is proposed; the "and
 * send …" is never silently dropped.
 */
async function planSwapAndSend(
  intent: Extract<Intent, { kind: 'swap_and_send' }>,
  ctx: EngineContext,
): Promise<PlanOutcome> {
  const { fromAsset, toAsset, amount } = intent;
  const holding = ctx.holdings.get(fromAsset);
  if (!holding) return { kind: 'rejected', reason: `You don't hold any ${fromAsset}.`, risk: LOW_RISK };
  const amountBase = resolveAmountToBase(amount, holding, ctx.prices);
  if (amountBase <= 0n) return { kind: 'clarify', question: 'How much would you like to convert?' };
  if (amountBase > holding.totalBase) return { kind: 'rejected', reason: `That's more than your ${fromAsset} balance.`, risk: LOW_RISK };
  if ((holding.totalBase - amountBase) * 100n < holding.totalBase) {
    return { kind: 'rejected', reason: `For your safety I won't convert your entire ${fromAsset} balance from a typed message — do a max conversion deliberately in the app.`, risk: LOW_RISK };
  }

  // Validate the send target FIRST — never swap toward a bad/typo'd/wrong-network recipient.
  const recipient = await ctx.resolveRecipient(intent.recipient);
  if (recipient.kind === 'not_found') {
    if (/^0x[0-9a-fA-F]{40}$/u.test(recipient.query)) {
      return { kind: 'clarify', question: `That address looks mistyped — "${recipient.query}" fails its checksum. Sentinel stopped it so the converted funds can't go to a wrong or dead wallet. Paste the exact, correct address.` };
    }
    return { kind: 'clarify', question: `I don't know "${recipient.query}". Paste an address or add a contact.` };
  }
  if (recipient.kind === 'ambiguous') {
    return { kind: 'clarify', question: 'Which recipient did you mean?', options: recipient.candidates.map((c) => c.name) };
  }
  const address = recipient.kind === 'contact' ? recipient.contact.address : recipient.address;
  const recipientEcosystem = recipient.kind === 'contact' ? recipient.contact.ecosystem : recipient.ecosystem;
  if (recipientEcosystem !== assetEcosystem(toAsset)) {
    return { kind: 'rejected', reason: `That recipient is on a different network than ${toAsset} — sending ${toAsset} needs a ${assetEcosystem(toAsset).toUpperCase()} address.`, risk: LOW_RISK };
  }

  const route = await ctx.routes.findRoute({ fromSymbol: fromAsset, toSymbol: toAsset, amountBase, fromDecimals: holding.decimals });
  if (!route) return { kind: 'rejected', reason: noRouteReason(fromAsset, toAsset), risk: LOW_RISK };

  const chainIssue = chainMismatch(intent.chain, route.legs[0]?.chainId, 'convert');
  if (chainIssue) return chainIssue;
  const risk = await ctx.risk.scan({ type: 'token', value: toAsset });
  if (risk.level === 'block') return { kind: 'rejected', reason: `${toAsset} is flagged as unsafe.`, risk };
  const recipientRisk = await ctx.risk.scan({ type: 'recipient', value: address });
  if (recipientRisk.level === 'block') return { kind: 'rejected', reason: 'Recipient blocked for your safety.', risk: recipientRisk };

  const chains = new Set<string>();
  const swapSteps: PlanStep[] = route.legs.map((leg, i) => {
    chains.add(leg.chainId);
    return { seq: i, kind: leg.kind, chainId: leg.chainId, description: leg.description, dependsOn: i === 0 ? [] : [i - 1], params: { from: fromAsset, to: toAsset, venue: leg.venue } };
  });
  // The send happens where the PROCEEDS actually live: a native BTC/SOL output goes on its own
  // chain (not the swap venue's) — a SOL->BTC send is a Bitcoin transfer, never an Ethereum one.
  // An EVM token (e.g. gUSDC) lives on the chain it was swapped on, so use the swap leg there.
  const outEcosystem = assetEcosystem(toAsset);
  const swapOutChain = route.legs[route.legs.length - 1]?.chainId;
  const sendChain =
    outEcosystem === 'btc'
      ? 'bip122:bitcoin'
      : outEcosystem === 'sol'
        ? 'solana:mainnet'
        : (swapOutChain ?? ctx.defaultChainFor(toAsset));
  chains.add(sendChain);
  const sendStep: PlanStep = {
    seq: swapSteps.length,
    kind: 'transfer',
    chainId: sendChain,
    description: `Send the ${toAsset} received to ${shorten(address)}`,
    dependsOn: [swapSteps.length - 1],
    params: { asset: toAsset, amountBase: route.outMinBase.toString(), to: address },
  };

  const spend = toPlanAmount(fromAsset, amountBase, holding.decimals, ctx);
  const receiveMin: PlanAmount = { symbol: toAsset, base: route.outMinBase.toString(), decimals: route.outDecimals };
  const venues = [...new Set(route.legs.map((l) => l.venue).filter((v): v is string => !!v))].map(prettyVenue);
  const via = venues.length > 0 ? ` via ${venues.join(' + ')}` : '';
  const toWhom = recipient.kind === 'contact' ? recipient.contact.name : shorten(address);

  // A medium/high RECIPIENT risk (e.g. an address-poisoning look-alike → 'high') must force step-up
  // here just as it does for a plain transfer — the compound path was passing only the TOKEN scan to
  // finalizePlan, silently dropping the recipient risk. Merge: worse level + both reasons.
  const levelRank: Record<string, number> = { low: 0, medium: 1, high: 2, block: 3 };
  const mergedRisk = {
    level: (levelRank[recipientRisk.level] ?? 0) > (levelRank[risk.level] ?? 0) ? recipientRisk.level : risk.level,
    reasons: [...risk.reasons, ...recipientRisk.reasons],
  };

  return {
    kind: 'plan',
    plan: finalizePlan(ctx, 'swap_and_send', {
      assets: [fromAsset, toAsset],
      sourceChains: [...chains],
      destChains: [sendChain],
      steps: [...swapSteps, sendStep],
      quote: quote(spend, receiveMin, route.feeMicros, route.slippageBps, route.etaSeconds),
      risk: mergedRisk,
      fallback: 'If the convert step fails, nothing is sent and your funds stay put. If it converts but the send fails, the proceeds remain safely in your wallet.',
      rollback: null,
      confirmation: `Convert ${baseToDecimal(amountBase, holding.decimals)} ${fromAsset} to at least ${baseToDecimal(route.outMinBase, route.outDecimals)} ${toAsset}${via}, then send it to ${toWhom}.`,
    }),
  };
}

async function planBuy(asset: string, amount: Amount, ctx: EngineContext): Promise<PlanOutcome> {
  // Fund from the stable with the LARGEST balance, not merely the first non-zero one: if ANY single
  // stable can cover the spend, the largest can, so this never over-refuses a fundable buy (e.g. 5 USDC
  // + 1000 USDT, "buy $500 ETH" must fund from USDT, not reject on USDC). Compare by DECIMAL value since
  // stables differ in decimals (USDC/USDT 6, DAI 18) yet all peg ~$1.
  const funding = STABLES.map((s) => ctx.holdings.get(s))
    .filter((h): h is Holding => !!h && h.totalBase > 0n)
    .sort((a, b) => Number(b.totalBase) / 10 ** b.decimals - Number(a.totalBase) / 10 ** a.decimals)[0];
  if (!funding) return { kind: 'clarify', question: 'You need USDC or USDT to buy. Add some first.' };
  // Exact-output buys ("buy 2 ETH") need a price to size the spend — MVP asks for a spend amount.
  if (amount.kind !== 'fiat') {
    return { kind: 'clarify', question: `How much would you like to spend on ${asset}? e.g. $100.` };
  }
  return planSwap(funding.symbol, asset, amount, ctx);
}

async function planStake(asset: string, amount: Amount, ctx: EngineContext): Promise<PlanOutcome> {
  // Stakeability is a property of the ASSET, checked before balance: staking a stablecoin or
  // a non-PoS coin is a category error, so say so plainly rather than build a plan that can't work.
  if (!STAKEABLE.has(asset.toUpperCase())) {
    return {
      kind: 'rejected',
      reason: `${asset} can't be staked — it isn't a proof-of-stake asset. You can stake ETH, SOL, or POL.`,
      risk: LOW_RISK,
    };
  }
  const holding = ctx.holdings.get(asset);
  if (!holding) return { kind: 'rejected', reason: `You don't hold any ${asset} to stake.`, risk: LOW_RISK };
  const amountBase = resolveAmountToBase(amount, holding, ctx.prices);
  if (amountBase <= 0n || amountBase > holding.totalBase) {
    return { kind: 'rejected', reason: `You don't have that much ${asset} to stake.`, risk: LOW_RISK };
  }
  // ETH/SOL/POL all pay gas in the SAME asset being staked, so a "stake all" (leaving < 1% of the
  // balance) would have nothing left for the network fee → the broadcast is rejected on-chain. Refuse
  // it up front, mirroring the whole-wallet-transfer block, rather than building a plan that must fail.
  if ((holding.totalBase - amountBase) * 100n < holding.totalBase) {
    return {
      kind: 'rejected',
      reason: `Staking your entire ${asset} balance would leave nothing for the network fee — stake a little less so there's ${asset} for gas.`,
      risk: LOW_RISK,
    };
  }
  const chainId = ctx.defaultChainFor(asset);
  const feeMicros = await ctx.estimateFeeMicros(chainId);
  const send = toPlanAmount(asset, amountBase, holding.decimals, ctx);
  const step: PlanStep = {
    seq: 0,
    kind: 'stake',
    chainId,
    description: `Stake ${baseToDecimal(amountBase, holding.decimals)} ${asset}`,
    dependsOn: [],
    params: { asset, amountBase: amountBase.toString() },
  };
  return {
    kind: 'plan',
    plan: finalizePlan(ctx, 'stake', {
      assets: [asset],
      sourceChains: [chainId],
      destChains: [chainId],
      steps: [step],
      quote: quote(send, null, feeMicros, 0, 60),
      risk: LOW_RISK,
      fallback: 'If staking fails, your funds remain unstaked and available.',
      rollback: 'Unstaking from the wallet UI is not wired yet — staked funds sit in the staking contract until an unstake path ships.',
      confirmation: `Stake ${baseToDecimal(amountBase, holding.decimals)} ${asset}. Network fee ~${formatMicrosOrDash(feeMicros)}.`,
    }, fullBalanceNote(amountBase, holding)),
  };
}

async function planRebalance(ctx: EngineContext): Promise<PlanOutcome> {
  // gUSDC / dUSDC are the wallet's OWN dollar-equivalents (DOLLARS) — already stable, so they must be
  // neither swept NOR reported as "couldn't be routed". Using the bare STABLES set here wrongly treated
  // an all-gUSDC wallet as fully non-stable → "No routes available" instead of "already in stablecoins".
  const isStable = (sym: string): boolean => DOLLARS.has(sym.toUpperCase()) || sym.toUpperCase() === 'DUSDC';
  const nonStable = ctx.holdings.list().filter((h) => !isStable(h.symbol) && h.totalBase > 0n);
  if (nonStable.length === 0) return { kind: 'clarify', question: 'Everything is already in stablecoins.' };

  const steps: PlanStep[] = [];
  const assets: string[] = ['USDC'];
  const chains = new Set<string>();
  let seq = 0;
  let totalFeeMicros = 0n;
  // Accumulate the minimum USDC received across every swap — the rebalance's slippage
  // guarantee. Without it the execution sandbox (rightly) refuses to sign a swap that has
  // no minimum-received and PARKS, so a rebalance could never complete.
  let totalOutMinBase = 0n;
  let outDecimals = 6; // USDC
  for (const holding of nonStable) {
    // Native gas assets (ETH/SOL/POL) pay their swap gas in the SAME coin, so leave a small reserve —
    // routing the whole balance would revert for lack of gas (same reason stake-all / swap-all are
    // blocked). ERC-20s pay gas in ETH, so route the full token balance.
    const isNativeGas = ['ETH', 'SOL', 'POL'].includes(holding.symbol.toUpperCase());
    const swapBase = isNativeGas ? (holding.totalBase * 99n) / 100n : holding.totalBase;
    if (swapBase <= 0n) continue;
    const route = await ctx.routes.findRoute({
      fromSymbol: holding.symbol,
      toSymbol: 'USDC',
      amountBase: swapBase,
      fromDecimals: holding.decimals,
    });
    if (!route) continue; // skip assets we can't route; surfaced in the summary
    assets.push(holding.symbol);
    totalFeeMicros += route.feeMicros;
    totalOutMinBase += route.outMinBase;
    outDecimals = route.outDecimals;
    for (const leg of route.legs) {
      steps.push({
        seq: seq++,
        kind: leg.kind,
        chainId: leg.chainId,
        description: leg.description,
        dependsOn: [],
        params: { from: holding.symbol, to: 'USDC' },
      });
      chains.add(leg.chainId);
    }
  }
  if (steps.length === 0)
    return { kind: 'rejected', reason: 'No routes available to move into stablecoins right now.', risk: LOW_RISK };

  const send: PlanAmount = { symbol: 'MULTI', base: '0', decimals: 0 };
  const receiveMin: PlanAmount = { symbol: 'USDC', base: totalOutMinBase.toString(), decimals: outDecimals };
  // Count + ETA the assets that ACTUALLY route (assets[0] is the USDC target), and name the ones that
  // couldn't — the loop silently `continue`s past unroutable holdings (e.g. BTC→USDC has no route), so
  // using nonStable.length would over-count and the confirmation would promise moves that don't happen.
  const routedCount = assets.length - 1;
  const skipped = nonStable.filter((h) => !assets.includes(h.symbol)).map((h) => h.symbol);
  const skipNote = skipped.length > 0 ? ` (${skipped.join(', ')} couldn't be routed and stay put)` : '';
  return {
    kind: 'plan',
    plan: finalizePlan(ctx, 'rebalance', {
      assets,
      sourceChains: [...chains],
      destChains: [...chains],
      steps,
      quote: quote(send, receiveMin, totalFeeMicros, 50, 60 * routedCount),
      risk: LOW_RISK,
      fallback:
        'Each asset is converted independently; if one fails, the others still complete and nothing is stranded.',
      rollback: null,
      confirmation: `Move ${routedCount} asset(s) into USDC${skipNote}. Total fees ~${formatMicrosOrDash(totalFeeMicros)}.`,
    }),
  };
}

// --- helpers ---

/**
 * Answer a read-only wallet query WITHOUT a plan. A balance/holdings question is answered
 * from the real holdings; anything else — a greeting, small talk, or a question we can't
 * answer — gets a friendly capability guide. We NEVER echo the user's words back as if
 * they were the answer.
 */
function answerQuery(question: string, ctx: EngineContext): PlanOutcome {
  const lower = question.toLowerCase();
  const aboutBalance =
    /\b(balance|balances|holding|holdings|portfolio|worth|net\s?worth|assets?|own|have|coins?|tokens?|how much)\b/u.test(
      lower,
    );
  if (aboutBalance) {
    const held = ctx.holdings.list().filter((h) => h.totalBase > 0n);
    if (held.length === 0) {
      return {
        kind: 'answer',
        question: "You don't hold any assets yet. Fund your wallet, then tell me what to do — send, swap, buy, stake, or rebalance.",
      };
    }
    let totalMicros = 0n;
    let top = { symbol: '', micros: 0n };
    const parts = held.map((h) => {
      const value = toPlanAmount(h.symbol, h.totalBase, h.decimals, ctx).valueMicros;
      const micros = value ? BigInt(value) : 0n;
      totalMicros += micros;
      if (micros > top.micros) top = { symbol: h.symbol, micros };
      const usd = micros > 0n ? ` (~${formatMicrosOrDash(micros)})` : '';
      return `${baseToDecimal(h.totalBase, h.decimals)} ${h.symbol}${usd}`;
    });
    const total = totalMicros > 0n ? ` — about ${formatMicrosOrDash(totalMicros)} in total` : '';
    // Highlight the largest position by value (only when it's a meaningful share of a >1 mix).
    const biggest =
      totalMicros > 0n && top.symbol && held.length > 1
        ? ` Your biggest position is ${top.symbol} (${Number((top.micros * 100n) / totalMicros)}%).`
        : '';
    return { kind: 'answer', question: `You hold ${parts.join(', ')}${total}.${biggest}` };
  }
  const greeting = /^(hi|hello|hey|yo|gm|gn|sup|hiya|hola|namaste|greetings)\b/u.test(lower);
  const lead = greeting
    ? "Hey! I'm your intent wallet."
    : "I'm your intent wallet — just say what you want in plain English.";
  return {
    kind: 'answer',
    question:
      `${lead} I plan it, check it for risk, and your device signs — I never move funds on my own. Things you can ask:\n` +
      '• Send — “send 0.1 ETH to alice.eth”\n' +
      '• Swap — “swap 100 USDC for ETH”\n' +
      '• Buy — “buy $50 of SOL”\n' +
      '• Stake — “stake 1 ETH”\n' +
      '• Rebalance — “move everything to stablecoins”\n' +
      '• Recurring — “buy $50 of ETH every Monday”\n' +
      '• Protect — “exit everything if BTC drops 15%”\n' +
      '• Ask — “what’s my balance”',
  };
}

function buildRoutePlan(
  ctx: EngineContext,
  fromAsset: string,
  toAsset: string,
  amountBase: bigint,
  holding: Holding,
  route: Route,
  risk: RiskReport,
  stepUpNote?: string,
): ExecutionPlan {
  const chains = new Set<string>();
  const steps: PlanStep[] = route.legs.map((leg, i) => {
    chains.add(leg.chainId);
    return {
      seq: i,
      kind: leg.kind,
      chainId: leg.chainId,
      description: leg.description,
      dependsOn: i === 0 ? [] : [i - 1],
      params: { from: fromAsset, to: toAsset, venue: leg.venue },
    };
  });
  const send = toPlanAmount(fromAsset, amountBase, holding.decimals, ctx);
  const receiveMin: PlanAmount = { symbol: toAsset, base: route.outMinBase.toString(), decimals: route.outDecimals };
  // Name the venue(s) the swap routes through (e.g. "via Uniswap v3") so the user sees WHERE
  // their funds go, not just an opaque step count.
  const venues = [...new Set(route.legs.map((l) => l.venue).filter((v): v is string => !!v))].map(prettyVenue);
  const via = venues.length > 0 ? `via ${venues.join(' + ')}` : `in ${route.legs.length} step(s)`;
  return finalizePlan(ctx, 'swap', {
    assets: [fromAsset, toAsset],
    sourceChains: [...chains],
    destChains: [...chains],
    steps,
    quote: quote(send, receiveMin, route.feeMicros, route.slippageBps, route.etaSeconds),
    risk,
    fallback: 'If a step fails mid-route, your funds are parked safely on the current chain and you can resume.',
    rollback: null,
    confirmation: `Convert ${baseToDecimal(amountBase, holding.decimals)} ${fromAsset} to at least ${baseToDecimal(
      route.outMinBase,
      route.outDecimals,
    )} ${toAsset} ${via}. Fees ~${formatMicrosOrDash(route.feeMicros)}, ~${Math.ceil(route.etaSeconds / 60)} min.`,
  }, stepUpNote);
}

/** A human label for a route venue id ("uniswap-v3" → "Uniswap v3", "jupiter" → "Jupiter"). */
const VENUE_LABELS: Record<string, string> = { 'uniswap-v3': 'Uniswap v3', jupiter: 'Jupiter', 'giwa-simpleamm': 'GIWA SimpleAMM', solamm: 'solAMM' };
function prettyVenue(v: string): string {
  return VENUE_LABELS[v] ?? v.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());
}

/**
 * Assembles the final plan, stamping ids and enforcing GRADUATED RISK: a medium
 * or high risk level (block is already rejected upstream) sets `requiresStepUp`
 * and surfaces the risk reasons in the confirmation, so an elevated-risk action
 * can never proceed on the same silent path as a benign one.
 */
function finalizePlan(
  ctx: EngineContext,
  intentKind: string,
  parts: Omit<ExecutionPlan, 'planId' | 'intentId' | 'intentKind' | 'requiresStepUp'>,
  stepUpNote?: string,
): ExecutionPlan {
  // A medium/high risk level OR a full-balance move (stepUpNote) forces step-up: a max-value,
  // irreversible action can never proceed on the same silent path as a benign one — the fix
  // that survives a user who taps through the confirmation without reading it.
  const riskStepUp = parts.risk.level === 'medium' || parts.risk.level === 'high';
  // A fund-moving plan whose SENT asset couldn't be priced has no USD value for the spend cap / biometric
  // step-up to evaluate — authorizePlan reads a missing valueMicros as $0 and the cap never fires. Fail
  // CLOSED: force step-up so an unvalued move can't ride the same silent auto path as a benign one
  // (mirrors the client autoDecision, which stays manual when usdVal is null).
  // Exclude the rebalance sentinel: planRebalance sets a synthetic youSend {symbol:'MULTI', base:'0'} with
  // no valueMicros — that is a structural constant, NOT a pricing failure, so keying only on
  // `valueMicros === undefined` would mislabel every (fully-priced) rebalance as "couldn't price". A real
  // unpriced fund move has a positive base with no value; require base !== '0'.
  const unpricedMove = parts.quote.youSend.base !== '0' && parts.quote.youSend.valueMicros === undefined;
  const requiresStepUp = riskStepUp || stepUpNote !== undefined || unpricedMove;
  const prefix = riskStepUp
    ? `⚠️ Elevated risk (${parts.risk.reasons.join('; ') || parts.risk.level}). `
    : stepUpNote !== undefined
      ? `⚠️ ${stepUpNote} `
      : unpricedMove
        ? `⚠️ Couldn't price this asset — confirm the amount carefully. `
        : '';
  return { planId: ctx.ids.plan(), intentId: ctx.ids.intent(), intentKind, ...parts, confirmation: prefix + parts.confirmation, requiresStepUp };
}

function quote(
  youSend: PlanAmount,
  youReceiveMin: PlanAmount | null,
  feeMicros: bigint,
  slippageBps: number,
  etaSeconds: number,
): ExecutionPlan['quote'] {
  const sendValue = youSend.valueMicros ? BigInt(youSend.valueMicros) : 0n;
  const feePct = sendValue > 0n ? Number((feeMicros * 10_000n) / sendValue) / 100 : 0;
  return { youSend, youReceiveMin, totalFeeMicros: feeMicros.toString(), feePct, slippageBps, etaSeconds };
}

/** Builds a PlanAmount, attaching a USD value when the price is known. */
function toPlanAmount(symbol: string, base: bigint, decimals: number, ctx: EngineContext): PlanAmount {
  const price = ctx.prices.getUsd(symbol);
  const amount: PlanAmount = { symbol, base: base.toString(), decimals };
  if (price) {
    // valueMicros = base * priceMicros / 10^decimals
    amount.valueMicros = ((base * usdToMicros(price)) / 10n ** BigInt(decimals)).toString();
  }
  return amount;
}

function shorten(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** A step-up note when a move spends the ENTIRE holding — a max-value, irreversible action. */
function fullBalanceNote(amountBase: bigint, holding: Holding): string | undefined {
  return amountBase === holding.totalBase
    ? `This moves your entire ${holding.symbol} balance — confirm the amount and recipient.`
    : undefined;
}

// Re-exported so callers don't need a second import for the error type check.
export { IntentError };
