import { describe, expect, it } from 'vitest';
import { constantTimeEqual, zeroize } from '../src/bytes.js';

describe('zeroize', () => {
  it('fills every provided buffer with zeros', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([9, 9]);
    zeroize(a, b);
    expect([...a]).toEqual([0, 0, 0]);
    expect([...b]).toEqual([0, 0]);
  });

  it('tolerates null/undefined entries', () => {
    expect(() => zeroize(null, undefined, new Uint8Array([5]))).not.toThrow();
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal buffers and false for differing ones', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('detects a difference in any position (including the last byte)', () => {
    const a = new Uint8Array(32).fill(7);
    const b = new Uint8Array(32).fill(7);
    b[31] = 8;
    expect(constantTimeEqual(a, b)).toBe(false);
    expect(constantTimeEqual(a, a.slice())).toBe(true);
  });
});
