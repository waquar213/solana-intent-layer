import { describe, expect, it } from 'vitest';
import { assessSimulatedSourceOutflow, SIM_NATIVE_SENTINEL, type SimCall } from '../src/index.js';

const TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USER = '0x1111111111111111111111111111111111111111';
const ROUTER = '0x2222222222222222222222222222222222222222';
const ATTACKER = '0x3333333333333333333333333333333333333333';
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';

const topic = (addr: string): string => `0x${addr.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
const hex = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;
const transfer = (token: string, from: string, to: string, amt: bigint): { address: string; topics: string[]; data: string } => ({
  address: token,
  topics: [TOPIC0, topic(from), topic(to)],
  data: hex(amt),
});
const call = (status: string, logs: ReturnType<typeof transfer>[]): SimCall => ({ status, logs });

const NATIVE = { from: USER, sourceAsset: SIM_NATIVE_SENTINEL, maxSourceOutBase: 60_000_000_000_000_000n }; // ≤ 0.06 ETH
const ERC20 = { from: USER, sourceAsset: USDC, maxSourceOutBase: 20_000_000n }; // ≤ 20 USDC

describe('assessSimulatedSourceOutflow', () => {
  it('accepts a native source that sends only native, within the bound', () => {
    const v = assessSimulatedSourceOutflow([call('0x1', [transfer(SIM_NATIVE_SENTINEL, USER, ROUTER, 50_000_000_000_000_000n)])], NATIVE);
    expect(v.ok).toBe(true);
    expect(v.outflows).toEqual([{ token: SIM_NATIVE_SENTINEL, amountBase: 50_000_000_000_000_000n }]);
  });

  it('accepts an ERC-20 source that sends only the source token, within the bound', () => {
    const v = assessSimulatedSourceOutflow([call('0x1', [transfer(USDC, USER, ROUTER, 20_000_000n)])], ERC20);
    expect(v.ok).toBe(true);
  });

  it('REFUSES a reverting route (any call status ≠ 0x1)', () => {
    const v = assessSimulatedSourceOutflow([call('0x0', [])], NATIVE);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/reverts/iu);
  });

  it('REFUSES when the user ALSO sends a different asset (approval-drain shape)', () => {
    const v = assessSimulatedSourceOutflow(
      [call('0x1', [transfer(SIM_NATIVE_SENTINEL, USER, ROUTER, 50_000_000_000_000_000n), transfer(USDC, USER, ATTACKER, 5_000_000n)])],
      NATIVE,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/different asset/iu);
  });

  it('REFUSES when the user sends MORE of the source asset than authorized', () => {
    const v = assessSimulatedSourceOutflow([call('0x1', [transfer(SIM_NATIVE_SENTINEL, USER, ROUTER, 500_000_000_000_000_000n)])], NATIVE);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/more than/iu);
  });

  it('aggregates the user outflow across multiple calls (approve + swap)', () => {
    const v = assessSimulatedSourceOutflow(
      [call('0x1', []), call('0x1', [transfer(USDC, USER, ROUTER, 12_000_000n), transfer(USDC, USER, ROUTER, 8_000_000n)])],
      ERC20,
    );
    expect(v.ok).toBe(true); // 12 + 8 = 20, exactly the bound
  });

  it('over-aggregates to a refusal when the split outflows exceed the bound', () => {
    const v = assessSimulatedSourceOutflow(
      [call('0x1', [transfer(USDC, USER, ROUTER, 12_000_000n)]), call('0x1', [transfer(USDC, USER, ROUTER, 9_000_000n)])],
      ERC20,
    );
    expect(v.ok).toBe(false); // 12 + 9 = 21 > 20
  });

  it('ignores transfers NOT sent by the user (the router\'s onward legs)', () => {
    const v = assessSimulatedSourceOutflow(
      [call('0x1', [transfer(SIM_NATIVE_SENTINEL, USER, ROUTER, 50_000_000_000_000_000n), transfer(USDC, ROUTER, ATTACKER, 999_000_000n)])],
      NATIVE,
    );
    expect(v.ok).toBe(true); // the USDC move is FROM the router, not the user
  });
});
