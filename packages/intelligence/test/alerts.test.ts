import { describe, expect, it } from 'vitest';
import { emptyAlertState, evaluateAlerts } from '../src/alerts.js';
import type { AlertContext } from '../src/alerts.js';

const NOW = '2026-07-05T00:00:00Z';

describe('alert engine', () => {
  it('fires on a large portfolio movement', () => {
    const ctx: AlertContext = { netWorthMicros: 1_200_000_000n, previousNetWorthMicros: 1_000_000_000n };
    const { alerts } = evaluateAlerts(emptyAlertState(), ctx, NOW);
    expect(alerts.map((a) => a.code)).toContain('LARGE_PORTFOLIO_MOVEMENT');
    expect(alerts[0]!.evidence.length).toBeGreaterThan(0);
  });

  it('suppresses a re-fire inside the cooldown window', () => {
    const ctx: AlertContext = { netWorthMicros: 1_200_000_000n, previousNetWorthMicros: 1_000_000_000n };
    const first = evaluateAlerts(emptyAlertState(), ctx, NOW);
    expect(first.alerts).toHaveLength(1);
    const soon = '2026-07-05T01:00:00Z'; // +1h, inside the 24h cooldown
    const second = evaluateAlerts(first.state, ctx, soon);
    expect(second.alerts).toHaveLength(0);
    // …but after the cooldown it can re-fire
    const later = '2026-07-07T00:00:00Z';
    expect(evaluateAlerts(first.state, ctx, later).alerts).toHaveLength(1);
  });

  it('raises a critical alert when health drops below the floor', () => {
    const { alerts } = evaluateAlerts(emptyAlertState(), { netWorthMicros: 1_000_000_000n, healthScore: 30 }, NOW);
    const health = alerts.find((a) => a.code === 'RISK_THRESHOLD_EXCEEDED');
    expect(health?.severity).toBe('critical');
  });

  it('filters market events to entities the user actually owns', () => {
    const owned = evaluateAlerts(
      emptyAlertState(),
      {
        netWorthMicros: 1_000_000_000n,
        events: [{ kind: 'protocol_hack', subject: 'aave-v3', detail: 'exploit', asOf: '2026-07-04' }],
        ownedProtocols: ['aave-v3'],
      },
      NOW,
    );
    expect(owned.alerts.map((a) => a.code)).toContain('PROTOCOL_HACKED');

    const notOwned = evaluateAlerts(
      emptyAlertState(),
      {
        netWorthMicros: 1_000_000_000n,
        events: [{ kind: 'protocol_hack', subject: 'aave-v3', detail: 'exploit', asOf: '2026-07-04' }],
        ownedProtocols: ['compound'],
      },
      NOW,
    );
    expect(notOwned.alerts).toHaveLength(0);
  });

  it('flags wallet inactivity past the threshold', () => {
    const { alerts } = evaluateAlerts(
      emptyAlertState(),
      { netWorthMicros: 1_000_000_000n, lastActivityAt: '2026-01-01' },
      NOW,
    );
    expect(alerts.map((a) => a.code)).toContain('WALLET_INACTIVITY');
  });
});
