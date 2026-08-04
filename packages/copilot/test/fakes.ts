import { PortfolioIntelligenceEngine } from '@intent-wallet/intelligence';
import type { PortfolioIntelligence, Position } from '@intent-wallet/intelligence';
import { createInMemorySources, createPolicyEngine } from '@intent-wallet/policy';
import { InMemoryThreatIntel, RiskEngine } from '@intent-wallet/risk';
import type { CopilotCapabilities } from '../src/index.js';

export const intelEngine = new PortfolioIntelligenceEngine();

const defaultPositions: Position[] = [
  {
    id: 'eth',
    kind: 'token',
    chainId: 'ethereum',
    symbol: 'ETH',
    amount: 0n,
    decimals: 18,
    valueMicros: 6_000_000_000n,
  },
  {
    id: 'usdc',
    kind: 'token',
    chainId: 'ethereum',
    symbol: 'USDC',
    amount: 0n,
    decimals: 18,
    valueMicros: 2_000_000_000n,
  },
];

export function makeIntel(positions: Position[] = defaultPositions): PortfolioIntelligence {
  return intelEngine.analyze({ identityId: 'user-1', asOf: '2026-01-01T00:00:00.000Z', positions });
}

export interface CapabilityOverrides {
  intel?: PortfolioIntelligence;
  risk?: RiskEngine;
  withPolicy?: boolean;
  planProposal?: Awaited<ReturnType<NonNullable<CopilotCapabilities['planIntent']>>>;
  route?: Awaited<ReturnType<NonNullable<CopilotCapabilities['findRoute']>>>;
}

/** Capabilities wired to the REAL intelligence/risk/policy engines behind the interface. */
export function makeCapabilities(over: CapabilityOverrides = {}): CopilotCapabilities {
  const intel = over.intel ?? makeIntel();
  const risk = over.risk ?? new RiskEngine();
  const policy = over.withPolicy === false ? null : createPolicyEngine({ sources: createInMemorySources(risk) });
  const caps: CopilotCapabilities = {
    analyze: () => Promise.resolve(intel),
    narrate: (i, k) => intelEngine.narrate(i, k),
    assessRisk: (subject) => risk.evaluate(subject),
    findRoute: () =>
      Promise.resolve(
        over.route ?? { summary: 'via aggregator', confidence: 0.9, costMicros: 500_000n, alternatives: [] },
      ),
    planIntent: () =>
      Promise.resolve(
        over.planProposal ?? {
          policyType: 'transaction',
          intentKind: 'transfer',
          amountMicros: 5_000_000_000n,
          summary: 'Send $5,000 to 0xabc',
          recipient: { address: '0xabc', chainId: 'ethereum' },
        },
      ),
    ...(policy ? { evaluatePolicy: (r) => policy.evaluate(r) } : {}),
  };
  return caps;
}

export const sanctionedRisk = (address: string): RiskEngine =>
  new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [address] }) });
