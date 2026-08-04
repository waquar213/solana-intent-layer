/**
 * Payload schemas for the core events. Evolution rule (architecture 01 §4):
 * within a major version you may only ADD OPTIONAL fields. A breaking change is
 * a new `.vN` topic + type. Amounts are base-unit strings (never floats).
 */
import { z } from 'zod';

const BaseUnitAmount = z.string().regex(/^\d+$/u, 'amount must be a base-unit integer string');
const EcosystemSchema = z.enum(['evm', 'btc', 'sol']);

/** chain.events.v1 — a normalized on-chain balance-affecting event. */
export const ChainEventSchema = z.object({
  identityId: z.string().min(1),
  chainId: z.string().min(1),
  kind: z.enum(['received', 'sent', 'token_received', 'token_sent']),
  assetId: z.string().min(1),
  amount: BaseUnitAmount,
  txHash: z.string().min(1),
  confirmations: z.number().int().nonnegative(),
  /** Below-finality events are provisional; a reorg emits `reverted: true`. */
  provisional: z.boolean().default(false),
  reverted: z.boolean().default(false),
});
export type ChainEvent = z.infer<typeof ChainEventSchema>;

/** execution.steps.v1 — a state transition of one leg of an execution. */
export const ExecutionStepEventSchema = z.object({
  executionId: z.string().min(1),
  planId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  chainId: z.string().min(1),
  status: z.enum(['started', 'signing', 'broadcast', 'confirmed', 'failed', 'reverted']),
  txHash: z.string().optional(),
});
export type ExecutionStepEvent = z.infer<typeof ExecutionStepEventSchema>;

/** intent.lifecycle.v1 — an intent moving through its states. */
export const IntentLifecycleEventSchema = z.object({
  intentId: z.string().min(1),
  identityId: z.string().min(1),
  status: z.enum(['parsed', 'clarifying', 'planned', 'approved', 'expired', 'failed']),
});
export type IntentLifecycleEvent = z.infer<typeof IntentLifecycleEventSchema>;

/** risk.flags.v1 — a risk verdict on a subject. */
export const RiskFlagEventSchema = z.object({
  subjectType: z.enum(['token', 'address', 'tx']),
  subject: z.string().min(1),
  level: z.enum(['low', 'medium', 'high', 'block']),
  reasons: z.array(z.string()).default([]),
});
export type RiskFlagEvent = z.infer<typeof RiskFlagEventSchema>;

/** identity.registered.v1 — a new identity for indexers to watch. */
export const IdentityRegisteredEventSchema = z.object({
  identityId: z.string().min(1),
  addresses: z.array(z.object({ ecosystem: EcosystemSchema, address: z.string().min(1) })).min(1),
});
export type IdentityRegisteredEvent = z.infer<typeof IdentityRegisteredEventSchema>;

/** Registry mapping each topic to its payload schema — used to validate on produce/consume. */
export const EVENT_SCHEMAS = {
  'chain.events.v1': ChainEventSchema,
  'execution.steps.v1': ExecutionStepEventSchema,
  'intent.lifecycle.v1': IntentLifecycleEventSchema,
  'risk.flags.v1': RiskFlagEventSchema,
  'identity.registered.v1': IdentityRegisteredEventSchema,
} as const;

export type EventSchemaMap = typeof EVENT_SCHEMAS;
