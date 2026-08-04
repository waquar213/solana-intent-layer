/**
 * Every event on the bus is wrapped in a common envelope. The envelope carries
 * the identity needed for idempotent consumption (`id`), causal tracing
 * (`correlationId` = originating intent id), ordering key, and schema version.
 * Payloads are validated against their own schema; the envelope is validated
 * here (architecture 01 §4, 03 §3).
 */
import { z } from 'zod';

export const EventEnvelopeSchema = z.object({
  /** Globally unique event id — consumers dedupe on this. */
  id: z.string().min(1),
  /** Fully-qualified type, e.g. "execution.step.confirmed.v1". */
  type: z.string().regex(/^[a-z]+(\.[a-z0-9]+)+\.v\d+$/u, 'type must be dotted lower-case ending in .vN'),
  /** ISO-8601 UTC. Producers stamp this; kept as a string to avoid tz ambiguity. */
  occurredAt: z.string().datetime(),
  /** Partition/order key (identity id, intent id, execution id, asset, …). */
  key: z.string().min(1),
  /** Trace correlation — the originating intent id where applicable. */
  correlationId: z.string().min(1).optional(),
  /** The validated domain payload (shape enforced per event type). */
  payload: z.unknown(),
});

export type EventEnvelope<T = unknown> = Omit<z.infer<typeof EventEnvelopeSchema>, 'payload'> & { payload: T };
