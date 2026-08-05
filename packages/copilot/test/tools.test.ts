import { describe, expect, it } from 'vitest';
import { assertNoExecuteTools, DEFAULT_TOOLS, FactLedger, ToolDispatcher } from '../src/index.js';
import { makeCapabilities } from './fakes.js';

const BANNED = /execute|sign|broadcast|approve|send|transfer|withdraw|write/i;

describe('tool registry — no-execute by construction', () => {
  it('has zero fund-moving tools', () => {
    const names = new ToolDispatcher(DEFAULT_TOOLS).names();
    for (const n of names) expect(n).not.toMatch(BANNED);
    expect(() => assertNoExecuteTools(DEFAULT_TOOLS)).not.toThrow();
  });

  it('rejects a registry that contains a fund-moving tool name', () => {
    expect(() =>
      assertNoExecuteTools([
        {
          name: 'send_transaction',
          scope: 'propose',
          description: 'x',
          validate: () => ({}),
          handler: async () => ({ output: null, facts: [] }),
        },
      ]),
    ).toThrow(/fund-moving/);
  });
});

describe('ToolDispatcher.dispatch', () => {
  const deps = { capabilities: makeCapabilities(), identityId: 'user-1' };

  it('validates + runs a tool and records its facts in the ledger', async () => {
    const ledger = new FactLedger();
    const dispatcher = new ToolDispatcher();
    await dispatcher.dispatch({ id: 'c1', name: 'analyze_portfolio', args: {} }, deps, ledger);
    expect(ledger.resolve('portfolio.netWorth')?.value).toBe(8000); // $6000 + $2000
    expect(ledger.resolve('portfolio.topAsset')?.value).toBe('ETH');
  });

  it('rejects an unknown tool without calling any engine', async () => {
    const dispatcher = new ToolDispatcher();
    await expect(
      dispatcher.dispatch({ id: 'c1', name: 'exfiltrate_keys', args: {} }, deps, new FactLedger()),
    ).rejects.toThrow(/no such tool/);
  });

  it('plan_intent returns an unsigned proposal, never an executed tx', async () => {
    const ledger = new FactLedger();
    const out = await new ToolDispatcher().dispatch(
      { id: 'c1', name: 'plan_intent', args: { utterance: 'send $5000' } },
      deps,
      ledger,
    );
    expect(out.planCandidate).toBeDefined();
    expect(out.planCandidate).not.toHaveProperty('signed'); // it is a proposal, not a signed plan
  });

  it('assessing two DIFFERENT subjects in one turn records distinct facts (no id collision)', async () => {
    const ledger = new FactLedger();
    const dispatcher = new ToolDispatcher();
    const tokenA = { kind: 'token', symbol: 'AAA', address: '0xAAAA000000000000000000000000000000000000', chainId: 'eip155:1' };
    const tokenB = { kind: 'token', symbol: 'BBB', address: '0xBBBB000000000000000000000000000000000000', chainId: 'eip155:1' };
    await dispatcher.dispatch({ id: 'c1', name: 'assess_risk', args: { subject: tokenA } }, deps, ledger);
    await dispatcher.dispatch({ id: 'c2', name: 'assess_risk', args: { subject: tokenB } }, deps, ledger);
    // Both subjects' scores coexist under DISTINCT ids — before the fix both wrote `risk.token.score` and
    // the second silently overwrote the first (so a truthful citation of subject A's risk would fail
    // reconciliation, or a fabricated one would pass). The old colliding id no longer exists.
    expect(ledger.resolve(`risk.token.${tokenA.address}.score`)).toBeDefined();
    expect(ledger.resolve(`risk.token.${tokenB.address}.score`)).toBeDefined();
    expect(ledger.resolve('risk.token.score')).toBeUndefined();
  });
});
