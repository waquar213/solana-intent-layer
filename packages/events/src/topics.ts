/**
 * Kafka topic registry (architecture 03 §3). Topic names are versioned; the
 * partition key for each is fixed so per-entity ordering is total. Nothing in
 * the codebase hardcodes a topic string — import from here.
 */
export const TOPICS = {
  chainEvents: 'chain.events.v1',
  intentLifecycle: 'intent.lifecycle.v1',
  executionSteps: 'execution.steps.v1',
  riskFlags: 'risk.flags.v1',
  priceTicks: 'price.ticks.v1',
  gasConditions: 'gas.conditions.v1',
  notifyOutbox: 'notify.outbox.v1',
  identityRegistered: 'identity.registered.v1',
  analyticsRaw: 'analytics.raw.v1',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/** The partition key semantics per topic — documents WHAT the envelope `key` must be. */
export const TOPIC_KEY: Record<TopicName, string> = {
  'chain.events.v1': 'identityId',
  'intent.lifecycle.v1': 'intentId',
  'execution.steps.v1': 'executionId',
  'risk.flags.v1': 'subject',
  'price.ticks.v1': 'assetId',
  'gas.conditions.v1': 'chainId',
  'notify.outbox.v1': 'identityId',
  'identity.registered.v1': 'identityId',
  'analytics.raw.v1': 'eventId',
};

/** Money-path topics whose DLQ depth > 0 must page on-call (architecture 03 §3). */
export const MONEY_PATH_TOPICS: readonly TopicName[] = [TOPICS.executionSteps, TOPICS.chainEvents];
