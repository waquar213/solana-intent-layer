import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema } from '../src/envelope.js';
import { MONEY_PATH_TOPICS, TOPIC_KEY, TOPICS } from '../src/topics.js';
import { REDIS_KEY_SPEC, redisKeys } from '../src/redis-keys.js';
import { ChainEventSchema, EVENT_SCHEMAS, ExecutionStepEventSchema } from '../src/schemas.js';

describe('event envelope', () => {
  it('accepts a well-formed envelope', () => {
    const parsed = EventEnvelopeSchema.parse({
      id: 'evt-1',
      type: 'execution.step.confirmed.v1',
      occurredAt: '2026-07-05T00:00:00.000Z',
      key: 'exec-1',
      correlationId: 'intent-1',
      payload: {},
    });
    expect(parsed.id).toBe('evt-1');
  });

  it('rejects malformed type strings', () => {
    for (const type of ['ExecutionStep', 'execution.step', 'execution.step.v', 'UPPER.case.v1']) {
      expect(
        EventEnvelopeSchema.safeParse({ id: 'x', type, occurredAt: '2026-07-05T00:00:00.000Z', key: 'k', payload: {} })
          .success,
        type,
      ).toBe(false);
    }
  });

  it('rejects non-datetime occurredAt', () => {
    expect(
      EventEnvelopeSchema.safeParse({ id: 'x', type: 'a.b.v1', occurredAt: 'yesterday', key: 'k', payload: {} })
        .success,
    ).toBe(false);
  });
});

describe('topic registry', () => {
  it('every topic has a documented partition key', () => {
    for (const topic of Object.values(TOPICS)) {
      expect(TOPIC_KEY[topic], topic).toBeDefined();
    }
  });

  it('money-path topics are a subset of the registry', () => {
    for (const t of MONEY_PATH_TOPICS) expect(Object.values(TOPICS)).toContain(t);
  });

  it('every topic name is versioned', () => {
    for (const topic of Object.values(TOPICS)) expect(topic).toMatch(/\.v\d+$/u);
  });
});

describe('redis key builders', () => {
  it('build namespaced keys and lowercase addresses', () => {
    expect(redisKeys.portfolio('id-1')).toBe('pf:id-1');
    expect(redisKeys.tokenMeta('ethereum', '0xABCDef')).toBe('tok:ethereum:0xabcdef');
    expect(redisKeys.rateLimit('parse', 'user-1')).toBe('rl:parse:user-1');
    expect(redisKeys.seen('portfolio', 'evt-9')).toBe('seen:portfolio:evt-9');
  });

  it('security-critical key families never expire (noeviction groups)', () => {
    expect(REDIS_KEY_SPEC.rateLimit.ttlSeconds).toBeNull();
    expect(REDIS_KEY_SPEC.rateLimit.group).toBe('rt');
    expect(REDIS_KEY_SPEC.sessionRevoked.ttlSeconds).toBeNull();
    expect(REDIS_KEY_SPEC.seen.group).toBe('dedupe');
  });

  it('every key builder has a matching spec', () => {
    for (const name of Object.keys(redisKeys)) {
      expect(REDIS_KEY_SPEC[name as keyof typeof REDIS_KEY_SPEC], name).toBeDefined();
    }
  });
});

describe('event payload schemas', () => {
  it('validates a chain event and enforces base-unit amounts', () => {
    const ok = ChainEventSchema.parse({
      identityId: 'id-1',
      chainId: 'ethereum',
      kind: 'received',
      assetId: 'ETH',
      amount: '1000000000000000000',
      txHash: '0xabc',
      confirmations: 12,
    });
    expect(ok.provisional).toBe(false); // default applied
    expect(ChainEventSchema.safeParse({ ...ok, amount: '1.5' }).success).toBe(false); // no floats
  });

  it('rejects an execution step with an unknown status', () => {
    expect(
      ExecutionStepEventSchema.safeParse({
        executionId: 'e',
        planId: 'p',
        seq: 0,
        chainId: 'base',
        status: 'teleported',
      }).success,
    ).toBe(false);
  });

  it('EVENT_SCHEMAS maps real topic names', () => {
    expect(EVENT_SCHEMAS[TOPICS.chainEvents]).toBe(ChainEventSchema);
    expect(EVENT_SCHEMAS[TOPICS.executionSteps]).toBe(ExecutionStepEventSchema);
  });
});
