import { describe, expect, it } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils';
import { encodeIntentExecute, intentHashOf, keccak256Hex } from '../src/evm/intent.js';

describe('IntentExecutor calldata', () => {
  it('encodes execute(bytes32,(address,uint256)[]) byte-identical to `cast calldata`', () => {
    // Expected value produced by:
    //   cast calldata "execute(bytes32,(address,uint256)[])" 0x11..11 "[(0x22..22,1000000000000000)]"
    const hash = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const addr = '0x2222222222222222222222222222222222222222';
    const out = encodeIntentExecute(hash, [{ to: addr, amount: 1_000_000_000_000_000n }]);
    expect(out).toBe(
      '0x68cd9bdd' +
        '1111111111111111111111111111111111111111111111111111111111111111' +
        '0000000000000000000000000000000000000000000000000000000000000040' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '0000000000000000000000002222222222222222222222222222222222222222' +
        '00000000000000000000000000000000000000000000000000038d7ea4c68000',
    );
  });

  it('encodes multiple steps: length word then inlined static tuples', () => {
    const hash = `0x${'00'.repeat(32)}`;
    const out = encodeIntentExecute(hash, [
      { to: `0x${'11'.repeat(20)}`, amount: 1n },
      { to: `0x${'22'.repeat(20)}`, amount: 2n },
    ]);
    // length = 2
    expect(out).toContain('0000000000000000000000000000000000000000000000000000000000000002');
    // both amounts present
    expect(out.endsWith('0000000000000000000000000000000000000000000000000000000000000002')).toBe(true);
  });

  it('intentHashOf is deterministic keccak256 of the utf8 string', () => {
    expect(intentHashOf('a')).toBe(keccak256Hex(utf8ToBytes('a')));
    expect(intentHashOf('giwa')).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('rejects a malformed intentHash and empty steps', () => {
    expect(() => encodeIntentExecute('0x1234', [{ to: `0x${'11'.repeat(20)}`, amount: 1n }])).toThrow();
    expect(() => encodeIntentExecute(`0x${'00'.repeat(32)}`, [])).toThrow();
  });
});
