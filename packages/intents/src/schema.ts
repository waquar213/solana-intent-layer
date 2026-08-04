/**
 * The versioned Intent + ExecutionPlan schemas — the contract of the whole
 * engine. The PARSER (deterministic or LLM) emits an `Intent`; the PLANNER
 * turns a resolved intent into an `ExecutionPlan`. Because the LLM's output is
 * validated against `IntentSchema` (schema-forced tool use), the model can only
 * ever produce a shape we understand — it proposes, deterministic code
 * disposes (ADR-0014).
 *
 * All money amounts on the wire are STRINGS: decimal strings for user-facing
 * amounts, base-unit integer strings inside plans — never floats (handbook 01).
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '1' as const;

/** How a user expressed an amount. Resolved to base units by the resolver. */
export const AmountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fiat'), currency: z.string().min(1), value: z.string().regex(/^\d+(\.\d+)?$/u) }),
  z.object({ kind: z.literal('asset'), symbol: z.string().min(1), value: z.string().regex(/^\d+(\.\d+)?$/u) }),
  z.object({ kind: z.literal('all') }),
  z.object({
    kind: z.literal('fraction'),
    numerator: z.number().int().positive(),
    denominator: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('percent'), bps: z.number().int().min(1).max(10_000) }),
]);
export type Amount = z.infer<typeof AmountSchema>;

const Asset = z.string().min(1).max(20); // symbol, uppercased by the parser

/** A recurrence schedule for automated intents. */
export const ScheduleSchema = z.object({
  every: z.enum(['day', 'week', 'month']),
  /** Day-of-week 0–6 for weekly; day-of-month 1–28 for monthly. */
  on: z.number().int().min(0).max(28).optional(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// --- Intent variants (discriminated on `kind`) ---

/**
 * The chain the user explicitly NAMED, exactly as they wrote it ("sepolia", "arbitrum one",
 * "ethereum mainnet"). Absent when they named none.
 *
 * This field exists because the parser used to strip the chain word and forget it, so "swap 1 USDC
 * for ETH on sepolia" and "swap 1 USDC for ETH" produced identical intents — and the swap silently
 * settled on GIWA. Carrying it makes the request auditable; the PLANNER decides whether it can be
 * honoured, and must never silently substitute another chain.
 */
const RequestedChain = z.string().min(1).optional();

const Transfer = z.object({
  kind: z.literal('transfer'),
  asset: Asset,
  amount: AmountSchema,
  recipient: z.string().min(1),
  chain: RequestedChain,
});
const Swap = z.object({
  kind: z.literal('swap'),
  fromAsset: Asset,
  toAsset: Asset,
  amount: AmountSchema,
  chain: RequestedChain,
});
/** Compound: convert, THEN send the proceeds — "convert 5 USDC to SOL and send to <addr>". */
const SwapAndSend = z.object({
  kind: z.literal('swap_and_send'),
  fromAsset: Asset,
  toAsset: Asset,
  amount: AmountSchema,
  recipient: z.string().min(1),
  chain: RequestedChain,
});
const Buy = z.object({ kind: z.literal('buy'), asset: Asset, amount: AmountSchema });
const Stake = z.object({ kind: z.literal('stake'), asset: Asset, amount: AmountSchema });
const Rebalance = z.object({ kind: z.literal('rebalance'), target: z.literal('stables') });
const Recurring = z.object({
  kind: z.literal('recurring'),
  schedule: ScheduleSchema,
  inner: z.discriminatedUnion('kind', [Buy, Swap, Transfer]),
});
const EmergencyExit = z.object({
  kind: z.literal('emergency_exit'),
  trigger: z.object({ asset: Asset, direction: z.enum(['drops', 'rises']), percent: z.number().positive() }),
  target: z.literal('stables'),
});
const Query = z.object({ kind: z.literal('query'), question: z.string().min(1) });
const Clarify = z.object({
  kind: z.literal('clarify'),
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
});
const Unsupported = z.object({ kind: z.literal('unsupported'), reason: z.string().min(1) });

export const IntentSchema = z.discriminatedUnion('kind', [
  Transfer,
  Swap,
  SwapAndSend,
  Buy,
  Stake,
  Rebalance,
  Recurring,
  EmergencyExit,
  Query,
  Clarify,
  Unsupported,
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentKind = Intent['kind'];

/** Actionable (fund-moving) intent kinds the planner produces plans for. */
export const ACTIONABLE_KINDS: readonly IntentKind[] = ['transfer', 'swap', 'swap_and_send', 'buy', 'stake', 'rebalance'];

// --- ExecutionPlan (the planner's structured output) ---

export const PlanAmountSchema = z.object({
  symbol: z.string(),
  /** Base-unit integer string. */
  base: z.string().regex(/^\d+$/u),
  decimals: z.number().int().min(0).max(36),
  /** USD value in micro-USD (integer string), when priced. */
  valueMicros: z.string().regex(/^\d+$/u).optional(),
});
export type PlanAmount = z.infer<typeof PlanAmountSchema>;

export const PlanStepSchema = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.enum(['transfer', 'swap', 'bridge', 'approve', 'stake']),
  chainId: z.string(),
  description: z.string(),
  /** seq numbers this step depends on (empty = can start immediately). */
  dependsOn: z.array(z.number().int().nonnegative()),
  params: z.record(z.unknown()),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const RiskReportSchema = z.object({
  level: z.enum(['low', 'medium', 'high', 'block']),
  reasons: z.array(z.string()),
});
export type RiskReport = z.infer<typeof RiskReportSchema>;

export const ExecutionPlanSchema = z.object({
  planId: z.string(),
  intentId: z.string(),
  intentKind: z.string(),
  assets: z.array(z.string()),
  sourceChains: z.array(z.string()),
  destChains: z.array(z.string()),
  steps: z.array(PlanStepSchema),
  quote: z.object({
    youSend: PlanAmountSchema,
    youReceiveMin: PlanAmountSchema.nullable(),
    totalFeeMicros: z.string().regex(/^\d+$/u),
    feePct: z.number(),
    slippageBps: z.number().int().nonnegative(),
    etaSeconds: z.number().int().nonnegative(),
  }),
  risk: RiskReportSchema,
  /** What happens if a step fails mid-flight (never strand funds). */
  fallback: z.string(),
  /** Reversal strategy where possible; null when irreversible. */
  rollback: z.string().nullable(),
  /** Human-readable summary rendered on the confirm sheet. */
  confirmation: z.string(),
  /**
   * True when the risk level is elevated (medium/high) and the plan therefore
   * requires an explicit, elevated confirmation / step-up before it may be
   * signed. Graduated risk is NOT silently ignored: only `block` is rejected
   * outright; medium/high proceed but must be confirmed. The execution layer +
   * Policy gate enforce this at sign time.
   */
  requiresStepUp: z.boolean(),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
