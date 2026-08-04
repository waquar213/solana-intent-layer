import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

function capturingLogger(level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    level,
    service: 'test-svc',
    sink: (line) => lines.push(JSON.parse(line)),
    now: () => '2026-07-05T00:00:00.000Z',
  });
  return { logger, lines };
}

describe('createLogger', () => {
  it('emits one JSON object per line with level, time, msg, service', () => {
    const { logger, lines } = capturingLogger();
    logger.info('hello', { a: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      msg: 'hello',
      service: 'test-svc',
      a: 1,
      time: '2026-07-05T00:00:00.000Z',
    });
  });

  it('honors the level threshold', () => {
    const { logger, lines } = capturingLogger('warn');
    logger.debug('nope');
    logger.info('nope');
    logger.warn('yes');
    logger.error('yes');
    expect(lines.map((l) => l['msg'])).toEqual(['yes', 'yes']);
  });

  it('child loggers merge context into every line', () => {
    const { logger, lines } = capturingLogger();
    const child = logger.child({ requestId: 'req-1' });
    child.info('a');
    child.child({ userId: 'u-1' }).info('b');
    expect(lines[0]).toMatchObject({ requestId: 'req-1' });
    expect(lines[1]).toMatchObject({ requestId: 'req-1', userId: 'u-1' });
  });

  it('redacts sensitive fields by key name (the core security guarantee)', () => {
    const { logger, lines } = capturingLogger();
    logger.info('auth', {
      apiKey: 'sk-secret',
      user: { password: 'hunter2', name: 'ok' },
      Authorization: 'Bearer xyz',
      mnemonic: 'abandon abandon',
    });
    const line = lines[0] as Record<string, any>;
    expect(line['apiKey']).toBe('[REDACTED]');
    expect(line['Authorization']).toBe('[REDACTED]');
    expect(line['mnemonic']).toBe('[REDACTED]');
    expect(line['user'].password).toBe('[REDACTED]');
    expect(line['user'].name).toBe('ok'); // non-sensitive siblings survive
  });

  it('serializes errors without leaking a stack, keeping code/statusCode', () => {
    const { logger, lines } = capturingLogger();
    const err = Object.assign(new Error('boom'), { code: 'X', statusCode: 500, stack: 'secret stack' });
    logger.error('failed', { err });
    const serialized = (lines[0] as Record<string, any>)['err'];
    expect(serialized).toMatchObject({ name: 'Error', message: 'boom', code: 'X', statusCode: 500 });
    expect(serialized.stack).toBeUndefined();
  });

  it('handles circular structures without throwing', () => {
    const { logger, lines } = capturingLogger();
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(() => logger.info('cycle', { cyclic })).not.toThrow();
    expect((lines[0] as Record<string, any>)['cyclic'].self).toBe('[CIRCULAR]');
  });

  it('serializes a SHARED (non-cyclic) reference under both keys — not a false [CIRCULAR] (N4)', () => {
    // A DAG / diamond: the SAME object referenced by two sibling keys is acyclic and must serialize in
    // full both times. Before N4 the shared `seen` set flagged the 2nd occurrence as '[CIRCULAR]',
    // silently dropping real log fields. A genuine self-cycle inside it is still caught.
    const { logger, lines } = capturingLogger();
    const shared: Record<string, unknown> = { id: 'x', name: 'ok' };
    logger.info('dag', { first: shared, second: shared });
    const line = lines[0] as Record<string, any>;
    expect(line['first']).toMatchObject({ id: 'x', name: 'ok' });
    expect(line['second']).toMatchObject({ id: 'x', name: 'ok' }); // was '[CIRCULAR]' before the fix
  });
});
