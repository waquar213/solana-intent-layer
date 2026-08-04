/**
 * Regression: the chain a user NAMES must never be silently substituted.
 *
 * Found in the wild. "SWAP 1 USDC TO SEPOLIA ETH" executed a real swap on GIWA — and in AUTO mode
 * it signed before the card could even be read. Root cause was two leaks working together:
 *   • `stripChainSuffix` removed a trailing "on <chain>" and threw it away, so nothing downstream
 *     could ever know a chain had been requested; and
 *   • a chain named INLINE ("TO SEPOLIA ETH") never matched that regex at all, so `detectAsset`
 *     read "SEPOLIA ETH" as ETH and dropped "SEPOLIA".
 *
 * This is the same class as a dropped recipient: the wallet did something materially different from
 * what was asked and reported success. Three layers are pinned here — capture, intent field, and
 * the planner's refusal.
 */
import { describe, expect, it } from 'vitest';
import type { RecipientResolution } from '@intent-wallet/identity';
import { parseChainHint, parseDeterministic } from '../src/parse/deterministic.js';
import { planIntent } from '../src/plan/planner.js';
import { MapHoldings, type EngineContext, type Route } from '../src/plan/context.js';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

/** A context whose router settles conversions on GIWA — matching the live service. */
function ctx(): EngineContext {
  return {
    holdings: new MapHoldings([
      { symbol: 'ETH', decimals: 18, totalBase: 2_000_000_000_000_000_000n, chains: [{ chainId: 'eip155:91342', base: 2_000_000_000_000_000_000n }] },
      { symbol: 'USDC', decimals: 6, totalBase: 500_000_000n, chains: [{ chainId: 'eip155:91342', base: 500_000_000n }] },
    ]),
    prices: { getUsd: (s: string): string | undefined => ({ ETH: '2000', USDC: '1' } as Record<string, string>)[s] },
    routes: {
      async findRoute(): Promise<Route> {
        return {
          legs: [{ kind: 'swap', chainId: 'eip155:91342', venue: 'GIWA SimpleAMM', description: 'Swap on GIWA' }],
          outMinBase: 1_000_000_000_000_000n,
          outDecimals: 18,
          feeMicros: 20_000n,
          slippageBps: 50,
          etaSeconds: 30,
        };
      },
    },
    risk: { async scan() { return { level: 'low', reasons: [] }; } },
    async resolveRecipient(query: string): Promise<RecipientResolution> {
      return query === EVM ? { kind: 'address', ecosystem: 'evm', address: EVM } : { kind: 'not_found', query };
    },
    defaultChainFor: () => 'eip155:1',
    estimateFeeMicros: async () => 300_000n,
    ids: { plan: () => 'plan-1', intent: () => 'intent-1' },
  } as unknown as EngineContext;
}

describe('layer 1 — the named chain is captured, from both leak shapes', () => {
  const cases: [string, string | null][] = [
    ['swap 1 usdc for eth on sepolia', 'sepolia'], // trailing hint (leak A)
    ['SWAP 1 USDC TO SEPOLIA ETH', 'sepolia'], // inline, no preposition (leak B) — the reported bug
    ['SWAP 1 USDC FOR ETH SEPOLIA', 'sepolia'], // inline, trailing
    ['swap 1 usdc for eth on giwa sepolia', 'giwa sepolia'], // multi-word must not split
    ['swap 1 usdc for eth on arbitrum one', 'arbitrum one'],
    ['swap 0.001 eth for usdc on ethereum mainnet', 'ethereum mainnet'],
    ['swap 1 usdc for eth', null], // no chain named
    ['convert ethereum to usdc', null], // "ethereum" is the ASSET here, not the chain
  ];
  for (const [q, want] of cases) {
    it(`${JSON.stringify(q)} → ${want}`, () => {
      expect(parseChainHint(q)).toBe(want);
    });
  }
});

describe('layer 2 — the chain reaches the intent (and only where it means something)', () => {
  it('a swap carries it', () => {
    expect(parseDeterministic('swap 1 usdc for eth on sepolia')).toMatchObject({ kind: 'swap', chain: 'sepolia' });
  });
  it('a transfer carries it', () => {
    expect(parseDeterministic(`send 0.5 eth to ${EVM} on arbitrum`)).toMatchObject({ kind: 'transfer', chain: 'arbitrum' });
  });
  it('a stake does not (its chain is not user-selectable)', () => {
    expect(parseDeterministic('stake 5 eth on sepolia')).not.toHaveProperty('chain');
  });
  it('no chain named ⇒ no field, so nothing is invented', () => {
    expect(parseDeterministic('swap 1 usdc for eth')).not.toHaveProperty('chain');
  });
});

describe('layer 3 — the planner refuses to settle somewhere else', () => {
  it('CLARIFIES a swap whose named chain is not where it settles', async () => {
    const out = await planIntent(parseDeterministic('swap 1 usdc for eth on sepolia')!, ctx());
    expect(out.kind).toBe('clarify');
    expect((out as { question: string }).question).toMatch(/sepolia/iu);
    expect((out as { question: string }).question).toMatch(/GIWA Sepolia/u);
    expect((out as { question: string }).question).toMatch(/nothing has been signed/iu);
  });

  it('CLARIFIES the exact reported utterance', async () => {
    const out = await planIntent(parseDeterministic('SWAP 1 USDC TO SEPOLIA ETH')!, ctx());
    expect(out.kind).toBe('clarify');
  });

  it('CLARIFIES a chain the wallet has no route to at all', async () => {
    const out = await planIntent(parseDeterministic('swap 1 usdc for eth on arbitrum one')!, ctx());
    expect(out.kind).toBe('clarify');
    expect((out as { question: string }).question).toMatch(/no route to/iu);
  });

  it('PROCEEDS when the named chain IS where it settles', async () => {
    const out = await planIntent(parseDeterministic('swap 1 usdc for eth on giwa')!, ctx());
    expect(out.kind).toBe('plan');
  });

  it('PROCEEDS unchanged when no chain is named', async () => {
    const out = await planIntent(parseDeterministic('swap 1 usdc for eth')!, ctx());
    expect(out.kind).toBe('plan');
  });

  it('REJECTS a transfer on a chain the wallet has no route to', async () => {
    const out = await planIntent(parseDeterministic(`send 0.5 eth to ${EVM} on arbitrum`)!, ctx());
    expect(out.kind).toBe('rejected');
    expect((out as { reason: string }).reason).toMatch(/no route to/iu);
    // Says WHY it matters, because a wrong-network send can be unrecoverable.
    expect((out as { reason: string }).reason).toMatch(/unrecoverable/iu);
  });

  it('CLARIFIES a transfer named on a supported chain that is not where it settles', async () => {
    // The narrow hole this closed: Sepolia IS a chain the wallet uses, so the old check let it
    // through — and the client then settled ETH on GIWA anyway. Financially safe (both are the
    // wallet's testnets, same address) but still a silent substitution, so it now asks.
    const out = await planIntent(parseDeterministic(`send 0.5 eth to ${EVM} on sepolia`)!, ctx());
    expect(out.kind).toBe('clarify');
    expect((out as { question: string }).question).toMatch(/GIWA Sepolia/u);
    expect((out as { question: string }).question).toMatch(/nothing has been signed/iu);
  });

  it('PROCEEDS on a transfer named on the chain it really settles on', async () => {
    const out = await planIntent(parseDeterministic(`send 0.5 eth to ${EVM} on giwa`)!, ctx());
    expect(out.kind).toBe('plan');
  });

  it('PROCEEDS on a transfer with no chain named', async () => {
    const out = await planIntent(parseDeterministic(`send 0.5 eth to ${EVM}`)!, ctx());
    expect(out.kind).toBe('plan');
  });
});

describe('AUTO mode is closed by construction, not by a second check', () => {
  it('a mismatch never produces a plan — and only a plan can be auto-signed', async () => {
    // The web app's auto-sign effect lives INSIDE PlanFlow, and OutcomeView mounts PlanFlow only
    // for `kind === 'plan'` (App.tsx). So a clarify/rejected outcome cannot be auto-signed at all.
    // That is why no separate AUTO-path guard exists: this assertion IS the AUTO guarantee.
    for (const q of ['swap 1 usdc for eth on sepolia', 'SWAP 1 USDC TO SEPOLIA ETH', `send 0.5 eth to ${EVM} on arbitrum`]) {
      const out = await planIntent(parseDeterministic(q)!, ctx());
      expect(out.kind, q).not.toBe('plan');
    }
  });
});
