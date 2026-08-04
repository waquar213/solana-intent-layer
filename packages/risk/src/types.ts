/**
 * Security & Risk types — the shared vocabulary of the immune system.
 *
 * A `RiskSignal` is one detected concern with a severity (its independent
 * probability of harm, 0..1). Signals combine into a `RiskReport` (a composite
 * score + a level). A `SecurityDecision` is the report PLUS the policy verdict
 * (allow / block / require confirmation). The engine EVALUATES and AUTHORIZES;
 * it never signs and never holds funds.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'block';

export type RiskCategory =
  'intel' | 'contract' | 'token' | 'address' | 'liquidity' | 'approval' | 'provider' | 'execution';

/** A single detected risk. `severity` is its standalone probability of harm, [0,1]; ≥0.99 is a hard block. */
export interface RiskSignal {
  code: string;
  category: RiskCategory;
  severity: number;
  reason: string;
}

export interface RiskReport {
  level: RiskLevel;
  /** Composite risk in [0,1]; higher is worse. */
  score: number;
  signals: RiskSignal[];
}

// --- Subjects the engine can evaluate ---

export interface TokenSubject {
  kind: 'token';
  symbol: string;
  address: string;
  chainId: string;
  meta?: {
    ageDays?: number;
    liquidityUsd?: number;
    /** Largest holder's share, in basis points (10000 = 100%). */
    ownershipConcentrationBps?: number;
    hasAdminKey?: boolean;
    upgradeable?: boolean;
    /** Transfer/sell tax in bps (fee-on-transfer / honeypot signal). */
    feeOnTransferBps?: number;
    audited?: boolean;
  };
}

export interface AddressSubject {
  kind: 'address';
  address: string;
  /** Known-good addresses (e.g. the user's contacts) — used for address-poisoning detection. */
  knownAddresses?: string[];
}

export interface ApprovalSubject {
  kind: 'approval';
  token: string;
  spender: string;
  /** Approval amount in base units. */
  amount: bigint;
  decimals: number;
}

export interface ProviderSubject {
  kind: 'provider';
  providerId: string;
  /** Provider health score from the framework, [0,1]. */
  healthScore: number;
  /** Bridge/DEX kind, for bridge-health policies. */
  role?: 'swap' | 'bridge';
}

export type SecuritySubject = TokenSubject | AddressSubject | ApprovalSubject | ProviderSubject;

// --- Decision ---

export type SecurityVerdict = 'allow' | 'require_confirmation' | 'block';

export interface SecurityDecision {
  verdict: SecurityVerdict;
  report: RiskReport;
  /** Human-readable policy violations that drove the verdict. */
  policyViolations: string[];
}
