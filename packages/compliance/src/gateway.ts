/**
 * The Compliance Gateway — the deterministic front door every value-bearing action
 * passes through. Given a request + the ACTIVE jurisdiction profile, it returns a
 * `ComplianceDecision`: a most-restrictive verdict plus the obligations (report,
 * screen, disclose, retain, audit) the action triggers. Two invariants:
 *
 *  - FAIL CLOSED — no active profile for a jurisdiction ⇒ `block`. We never let an
 *    action through under an unknown regulatory posture.
 *  - It GATES, it does not execute. A `block` stops an action before signing; the
 *    wallet stays non-custodial — the gateway can say "no", never move funds.
 *
 * Pure and fast (<200ms is trivial — it's field comparisons over one profile), so
 * it sits in the request path without meaningful latency. Screening is performed by
 * the risk engine and passed IN; the gateway decides the OBLIGATION, not the hit.
 */
import { evaluateConsents } from './consent.js';
import { isFeatureEnabled } from './governance.js';
import { ProfileRegistry } from './profiles.js';
import type {
  ComplianceDecision,
  ComplianceObligation,
  ComplianceRequest,
  ComplianceVerdict,
  FeatureFlagSet,
  JurisdictionProfile,
  ReportTrigger,
} from './types.js';
import { VERDICT_RANK } from './types.js';

function reportingFor(
  profile: JurisdictionProfile,
  trigger: ReportTrigger,
): { key: string; withinHours: number } | undefined {
  const req = profile.reporting.find((r) => r.trigger === trigger);
  return req ? { key: req.key, withinHours: req.withinHours } : undefined;
}

export interface GatewayOptions {
  featureFlags?: FeatureFlagSet;
}

export class ComplianceGateway {
  constructor(
    private readonly registry: ProfileRegistry,
    private readonly options: GatewayOptions = {},
  ) {}

  evaluate(request: ComplianceRequest, nowIso: string): ComplianceDecision {
    const profile = this.registry.getActive(request.jurisdictionId);

    // FAIL CLOSED: unknown/inactive jurisdiction posture → block.
    if (!profile) {
      return {
        verdict: 'block',
        jurisdiction: request.jurisdictionId,
        profileVersion: 0,
        reasons: [`no active compliance profile for jurisdiction '${request.jurisdictionId}' — failing closed`],
        missingConsents: [],
        requiredDisclosures: [],
        obligations: [{ kind: 'audit', detail: 'blocked: missing jurisdiction profile' }],
        riskThreshold: 0,
      };
    }

    const { action, context } = request;
    const reasons: string[] = [];
    const requiredDisclosures: string[] = [];
    const obligations: ComplianceObligation[] = [{ kind: 'audit', detail: 'compliance evaluation recorded' }];
    let verdict: ComplianceVerdict = 'allow';
    const worsen = (v: ComplianceVerdict): void => {
      if (VERDICT_RANK[v] > VERDICT_RANK[verdict]) verdict = v;
    };

    // 1. Feature availability — the profile's list is authoritative; flags/emergency freeze layer on top.
    if (profile.disabledFeatures.includes(action.feature)) {
      reasons.push(`feature '${action.feature}' is not available in '${profile.id}'`);
      worsen('block');
    }
    if (this.options.featureFlags && !isFeatureEnabled(action.feature, profile.id, this.options.featureFlags)) {
      reasons.push(`feature '${action.feature}' is disabled by feature flag / emergency freeze`);
      worsen('block');
    }

    // 2. Screening. Two independent concerns:
    const s = context.screening;
    //  (a) Mandatory-screening obligation — a required screen must have been performed.
    if (profile.screeningRequired) {
      obligations.push({ kind: 'screen', detail: 'counterparty screening required before proceeding' });
      if (!s || !s.screened) {
        reasons.push('required counterparty screening was not performed');
        worsen('block'); // must screen first — fail closed
      }
    }
    //  (b) Honour a screening RESULT whenever one is present, INDEPENDENT of whether
    //      screening was mandated — a sanctions/PEP hit reported by the risk engine is
    //      never ignored just because this jurisdiction didn't require screening. And
    //      sanctions and PEP are independent flags: a counterparty can be both.
    if (s && s.screened) {
      if (s.sanctioned) {
        const rep = reportingFor(profile, 'sanctions_hit');
        if (rep) {
          obligations.push({
            kind: 'report',
            detail: 'sanctions hit must be reported',
            reportKey: rep.key,
            dueWithinHours: rep.withinHours,
          });
        }
        if (profile.blockOnSanctions) {
          reasons.push('sanctioned counterparty — blocked');
          worsen('block');
        } else {
          reasons.push('sanctioned counterparty — report and disclose');
          requiredDisclosures.push('sanctions_exposure');
          worsen('require_disclosure');
        }
      }
      if (s.pep) {
        reasons.push('politically-exposed counterparty — disclosure required');
        requiredDisclosures.push('pep_exposure');
        worsen('require_disclosure');
      }
    }

    // 3. Consent.
    const consent = evaluateConsents(profile.consents, context.consents, nowIso);
    const missingConsents = consent.missing;
    if (!consent.satisfied) {
      obligations.push({ kind: 'consent', detail: `missing/expired consent: ${missingConsents.join(', ')}` });
      reasons.push('required consent is missing or expired');
      worsen('require_consent');
    }

    // 4. High-value transfer → reporting + disclosure obligations.
    if (action.amountMicroUsd !== undefined && action.amountMicroUsd >= profile.highValueThresholdMicroUsd) {
      const rep = reportingFor(profile, 'high_value_transfer');
      if (rep) {
        obligations.push({
          kind: 'report',
          detail: 'high-value transfer report',
          reportKey: rep.key,
          dueWithinHours: rep.withinHours,
        });
      }
      reasons.push('high-value transfer — disclosure required');
      requiredDisclosures.push('high_value_notice');
      worsen('require_disclosure');
    }

    if (reasons.length === 0) reasons.push('within jurisdiction policy');

    return {
      verdict,
      jurisdiction: profile.id,
      profileVersion: profile.version,
      reasons,
      missingConsents,
      requiredDisclosures,
      obligations,
      riskThreshold: profile.riskThreshold,
    };
  }
}
