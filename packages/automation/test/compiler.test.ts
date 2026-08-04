import { describe, expect, it } from 'vitest';
import { compileTemplate, createTestEnv, WorkflowCompiler } from '../src/index.js';

describe('compileTemplate — natural language → typed workflow', () => {
  it('compiles a DCA rule', () => {
    const w = compileTemplate('Buy ₹5,000 BTC every Monday');
    expect(w?.trigger).toEqual({ kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: 1 });
    expect(w?.actions[0]).toEqual({
      kind: 'swap',
      fromAsset: 'USDC',
      toAsset: 'BTC',
      amountMicros: 5_000_000_000n,
      chainId: 'ethereum',
    });
  });

  it('compiles a buy-the-dip rule', () => {
    const w = compileTemplate('If BTC falls 10%, buy ₹50,000');
    expect(w?.trigger).toEqual({ kind: 'price_move', symbol: 'BTC', direction: 'drops', pct: 10 });
    expect(w?.actions[0]).toMatchObject({ kind: 'swap', toAsset: 'BTC', amountMicros: 50_000_000_000n });
  });

  // ── money parsing (regressions) ───────────────────────────────────────────
  // These three all came from parsing the amount with `parseFloat(raw.replace(/,/g,'')) * 1e6`.
  // An automation runs UNATTENDED, so a misread amount is spent without anyone looking.
  it('REFUSES an ambiguous decimal comma instead of silently 10x-ing the spend', () => {
    // "1,5" is $1.50 in most of the world. Stripping the comma made it $15 — a 10x overspend on a
    // recurring buy. Ambiguity must be declined (→ COMPILE_FAILED), never guessed.
    expect(compileTemplate('buy 1,5 BTC every monday')).toBeNull();
    expect(compileTemplate('buy 0,5 ETH every week')).toBeNull();
    expect(compileTemplate('If BTC falls 10%, buy 1,5')).toBeNull();
  });

  it('does not THROW on a malformed amount (BigInt(NaN) used to escape as a RangeError)', () => {
    expect(() => compileTemplate('buy ,, BTC every monday')).not.toThrow();
    expect(compileTemplate('buy ,, BTC every monday')).toBeNull();
    expect(() => compileTemplate('buy , ETH every day')).not.toThrow();
    expect(compileTemplate('buy , ETH every day')).toBeNull();
  });

  it('converts large and long amounts EXACTLY (no float rounding)', () => {
    // 9007199254740993 > Number.MAX_SAFE_INTEGER: the float path returned …992.
    const big = compileTemplate('buy 9007199254740993 BTC every monday');
    expect(big?.actions[0]).toMatchObject({ amountMicros: 9_007_199_254_740_993_000_000n });
    // More than 6 decimals must TRUNCATE to micro-USD, not round through a float.
    const long = compileTemplate('buy 123456789012.345678 BTC every monday');
    expect(long?.actions[0]).toMatchObject({ amountMicros: 123_456_789_012_345_678n });
    expect(compileTemplate('buy 1.23456789 BTC every monday')?.actions[0]).toMatchObject({ amountMicros: 1_234_567n });
  });

  it('still accepts clean thousands groups and plain decimals', () => {
    expect(compileTemplate('buy 5,000 BTC every monday')?.actions[0]).toMatchObject({ amountMicros: 5_000_000_000n });
    expect(compileTemplate('buy 1,234,567.89 BTC every monday')?.actions[0]).toMatchObject({ amountMicros: 1_234_567_890_000n });
    expect(compileTemplate('buy 50.25 ETH every friday')?.actions[0]).toMatchObject({ amountMicros: 50_250_000n });
  });

  it('REFUSES a percentage that would arm a trigger which can never fire', () => {
    // parseFloat('...') is NaN; every comparison against NaN is false, so the workflow would sit
    // active and silently never trigger.
    expect(compileTemplate('If BTC falls ...%, buy 500')).toBeNull();
    expect(compileTemplate('If BTC falls 0%, buy 500')).toBeNull();
    expect(compileTemplate('If BTC falls 10%, buy 500')?.trigger).toMatchObject({ pct: 10 });
  });

  it('compiles a scheduled reward claim', () => {
    const w = compileTemplate('Claim staking rewards every Friday');
    expect(w?.trigger).toEqual({ kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: 5 });
    expect(w?.actions[0]).toMatchObject({ kind: 'claim_rewards' });
  });

  it('compiles an exploit-triggered exit', () => {
    const w = compileTemplate('If a protocol is exploited, move my funds to USDC');
    expect(w?.trigger).toEqual({ kind: 'risk_event', minSeverity: 'high' });
    expect(w?.actions[0]).toMatchObject({ kind: 'execute_intent' });
  });

  it('returns null for an uncompilable utterance (LLM fallback would take over)', () => {
    expect(compileTemplate('do something clever with my money')).toBeNull();
  });

  it('WorkflowCompiler produces a complete, active workflow', async () => {
    const compiler = new WorkflowCompiler(createTestEnv());
    const wf = await compiler.compile('Buy ₹5,000 BTC every Monday', 'user-1', { sessionKeyId: 'sk-9' });
    expect(wf.ownerId).toBe('user-1');
    expect(wf.status).toBe('active');
    expect(wf.sessionKeyId).toBe('sk-9');
    expect(wf.id).toBeTruthy();
  });
});
