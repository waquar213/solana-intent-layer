/**
 * SelfHealingController — the tick loop that ties it together:
 *   SLIs → health → alerts (page/ticket) → bounded recovery decisions →
 *   actuator dispatch → escalation + incidents.
 *
 * It decides and dispatches; the injected actuator performs. It tracks healing
 * state across ticks (rate limit, cooldown, consecutive failures) so it can't
 * loop, and escalates to a human when a bound is hit. Deterministic: `now` is
 * injected, so the same inputs replay identically.
 */
import { DEFAULT_ALERT_CONFIG, emptyAlertState, evaluateAlerts, type AlertConfig } from './alerts.js';
import type { ReliabilityEnv } from './env.js';
import { computeHealth, DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from './health.js';
import { DEFAULT_HEALING_CONFIG, decideRecovery, emptyHealingState, type HealingConfig } from './healing.js';
import type { Actuator, IncidentSink, Pager } from './sources.js';
import type {
  Alert,
  AlertState,
  FailureSignal,
  HealingState,
  Incident,
  RecoveryDecision,
  ServiceHealth,
  Sli,
  Slo,
} from './types.js';

export interface ControllerDeps {
  actuator: Actuator;
  env: ReliabilityEnv;
  pager?: Pager;
  incidents?: IncidentSink;
}

export interface ControllerOptions {
  health?: HealthThresholds;
  alert?: AlertConfig;
  healing?: HealingConfig;
}

export interface TickInput {
  slis: Sli[];
  slos: Slo[];
  signals?: FailureSignal[];
}

export interface TickResult {
  healths: ServiceHealth[];
  alerts: Alert[];
  decisions: RecoveryDecision[];
  incidents: Incident[];
}

const DEFAULT_SLO = (service: string): Slo => ({
  service,
  objective: 0.999,
  p99BudgetMs: 1000,
  budgetWindowSeconds: 2_592_000,
});

export class SelfHealingController {
  private alertState: AlertState = emptyAlertState();
  private readonly healingState: HealingState = emptyHealingState();

  constructor(
    private readonly deps: ControllerDeps,
    private readonly options: ControllerOptions = {},
  ) {}

  async tick(input: TickInput, nowIso?: string): Promise<TickResult> {
    const now = nowIso ?? this.deps.env.now();
    const sloByService = new Map(input.slos.map((s) => [s.service, s]));

    const healths = input.slis.map((sli) =>
      computeHealth(
        sli,
        sloByService.get(sli.service) ?? DEFAULT_SLO(sli.service),
        this.options.health ?? DEFAULT_HEALTH_THRESHOLDS,
      ),
    );

    // Alerts (page the page-severity ones).
    const alertOut = evaluateAlerts(this.alertState, healths, now, this.options.alert ?? DEFAULT_ALERT_CONFIG);
    this.alertState = alertOut.state;
    if (this.deps.pager) {
      for (const a of alertOut.alerts) if (a.severity === 'page') await this.deps.pager.page(a);
    }

    // Recovery decisions.
    const decisions: RecoveryDecision[] = [];
    const incidents: Incident[] = [];
    for (const signal of input.signals ?? []) {
      const svc = signal.service;
      // N3: isolate each signal's recovery. An injected actuator / pager / incident sink is external
      // code that CAN throw (a network dispatch, a paging API); before this, one throw propagated out
      // of tick() and silently dropped every OTHER service's recovery AND the whole tick result
      // (healths + alerts computed above were lost too). Contain the failure to this service — surface
      // it as an escalate decision so it's visible + a human is flagged — and carry on with the rest.
      try {
        // N1: roll the per-service rate-limit WINDOW before deciding. actionsInWindow is a per-WINDOW
        // counter, not a lifetime one — without this reset it climbs monotonically and, once it hits
        // maxActionsPerWindow, EVERY subsequent failure escalates forever (auto-recovery permanently
        // disabled for a busy service over the process lifetime).
        const healCfg = this.options.healing ?? DEFAULT_HEALING_CONFIG;
        const wStart = this.healingState.windowStartIso[svc];
        if (wStart && Date.parse(now) - Date.parse(wStart) >= healCfg.windowSeconds * 1000) {
          this.healingState.actionsInWindow[svc] = 0;
          this.healingState.windowStartIso[svc] = now;
        }
        const decision = decideRecovery(signal, this.healingState, now, healCfg);
        decisions.push(decision);

        // CONTAIN — dispatch a concrete action to the actuator (not 'none'/'escalate').
        // Runs even when a decision ALSO escalates (e.g. a security incident is both
        // circuit-broken AND paged), so containment is never skipped.
        if (decision.action !== 'none' && decision.action !== 'escalate') {
          if (!this.healingState.windowStartIso[svc]) this.healingState.windowStartIso[svc] = now; // window opens on the first action
          this.healingState.actionsInWindow[svc] = (this.healingState.actionsInWindow[svc] ?? 0) + 1;
          this.healingState.lastActionIso[svc] = now;
          const res = await this.deps.actuator.execute(decision);
          this.healingState.consecutiveFailures[svc] = res.ok ? 0 : (this.healingState.consecutiveFailures[svc] ?? 0) + 1;
        }

        // ESCALATE — open an incident + page a human when flagged.
        if (decision.escalate) {
          const incident: Incident = {
            id: this.deps.env.ids.incident(),
            service: svc,
            severity: 'page',
            state: 'escalated',
            alerts: alertOut.alerts.filter((a) => a.service === svc),
            actions: [decision],
            openedAtIso: now,
          };
          incidents.push(incident);
          if (this.deps.incidents) await this.deps.incidents.open(incident);
          if (this.deps.pager) {
            await this.deps.pager.page({
              key: `escalate:${svc}`,
              code: 'ESCALATION',
              severity: 'page',
              service: svc,
              detail: decision.reason,
              firedAtIso: now,
            });
          }
        }
      } catch (err) {
        // A dispatch/sink for THIS service threw — record a bounded escalation (a human should look)
        // and continue the loop. We deliberately do NOT call another injected sink here: the sink is a
        // plausible source of the throw, so touching it again could re-throw and defeat the isolation.
        decisions.push({
          service: svc,
          kind: signal.kind,
          action: 'escalate',
          reason: `recovery dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
          bounded: true,
          escalate: true,
        });
      }
    }

    return { healths, alerts: alertOut.alerts, decisions, incidents };
  }
}

export function createController(deps: ControllerDeps, options?: ControllerOptions): SelfHealingController {
  return new SelfHealingController(deps, options);
}
