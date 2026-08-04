/**
 * @intent-wallet/events — the contract between services. Producers and
 * consumers share these schemas, topic names, and key builders so the bus is
 * self-documenting and evolution stays additive-only within a major version.
 */
export { EventEnvelopeSchema, type EventEnvelope } from './envelope.js';
export { TOPICS, TOPIC_KEY, MONEY_PATH_TOPICS, type TopicName } from './topics.js';
export { redisKeys, REDIS_KEY_SPEC, type RedisGroup, type RedisKeySpec } from './redis-keys.js';
export {
  EVENT_SCHEMAS,
  ChainEventSchema,
  ExecutionStepEventSchema,
  IntentLifecycleEventSchema,
  RiskFlagEventSchema,
  IdentityRegisteredEventSchema,
  type ChainEvent,
  type ExecutionStepEvent,
  type IntentLifecycleEvent,
  type RiskFlagEvent,
  type IdentityRegisteredEvent,
  type EventSchemaMap,
} from './schemas.js';
