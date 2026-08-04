import { describe, expect, it } from 'vitest';
import {
  annualizeVol,
  beta,
  covariance,
  drawdown,
  hhi,
  mean,
  pearson,
  simpleReturns,
  stdev,
  variance,
} from '../src/stats.js';

describe('stats primitives', () => {
  it('mean, variance (sample), stdev', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(variance([2, 4, 6])).toBe(4); // devs ±2 → 8 / (3−1)
    expect(stdev([2, 4, 6])).toBe(2);
    expect(variance([5])).toBe(0); // < 2 points
  });

  it('simple returns from a level series', () => {
    const r = simpleReturns([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.1, 10);
    expect(simpleReturns([100])).toEqual([]);
    expect(simpleReturns([0, 100])).toEqual([0]); // can't divide by a zero prior
  });

  it('annualizes volatility by √periods', () => {
    expect(annualizeVol(0.02, 365)).toBeCloseTo(0.02 * Math.sqrt(365), 10);
  });

  it('max and current drawdown from a level series', () => {
    const dd = drawdown([100, 120, 90, 130, 110]);
    expect(dd.maxDrawdown).toBeCloseTo(0.25, 10); // 120 → 90
    expect(dd.currentDrawdown).toBeCloseTo((130 - 110) / 130, 10);
    expect(dd.peakIndex).toBe(1);
    expect(dd.troughIndex).toBe(2);
  });

  it('pearson correlation: +1 aligned, −1 inverse, 0 flat', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0); // flat → undefined corr → 0
  });

  it('covariance and beta', () => {
    expect(covariance([2, 4, 6], [1, 2, 3])).toBeCloseTo(2, 10);
    expect(beta([2, 4, 6], [1, 2, 3])).toBeCloseTo(2, 10);
    expect(beta([1, 2, 3], [5, 5, 5])).toBe(0); // flat benchmark
  });

  it('HHI of a weight vector', () => {
    expect(hhi([0.5, 0.5])).toBeCloseTo(0.5, 10);
    expect(hhi([1])).toBe(1);
    expect(hhi([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 10); // 1/N for equal weights
  });
});
