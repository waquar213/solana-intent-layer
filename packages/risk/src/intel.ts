/**
 * Threat Intelligence — the continuously-updated knowledge of known-bad
 * entities. The engine consults it FIRST; a hit is a hard-block signal. In
 * production the feeds (sanctions lists, scam-token registries, malicious
 * contracts, compromised addresses, phishing domains) are synced from multiple
 * sources and distributed as SIGNED snapshots (integrity-verified before load,
 * so a poisoned feed can't unblock a scam or block a safe asset). The interface
 * is what the engine depends on; the in-memory impl serves tests and is the
 * shape a Redis/DB-backed impl fills.
 */
export interface ThreatIntel {
  isSanctioned(address: string): boolean;
  isBlacklisted(address: string): boolean;
  isKnownScamToken(chainId: string, address: string): boolean;
  isMaliciousContract(chainId: string, address: string): boolean;
  isPhishingDomain(domain: string): boolean;
}

export interface ThreatIntelSeed {
  sanctioned?: string[];
  blacklisted?: string[];
  scamTokens?: Array<{ chainId: string; address: string }>;
  maliciousContracts?: Array<{ chainId: string; address: string }>;
  phishingDomains?: string[];
}

const norm = (s: string) => s.trim().toLowerCase();
const tokenKey = (chainId: string, address: string) => `${norm(chainId)}:${norm(address)}`;

export class InMemoryThreatIntel implements ThreatIntel {
  readonly #sanctioned = new Set<string>();
  readonly #blacklisted = new Set<string>();
  readonly #scamTokens = new Set<string>();
  readonly #maliciousContracts = new Set<string>();
  readonly #phishingDomains = new Set<string>();

  constructor(seed: ThreatIntelSeed = {}) {
    seed.sanctioned?.forEach((a) => this.#sanctioned.add(norm(a)));
    seed.blacklisted?.forEach((a) => this.#blacklisted.add(norm(a)));
    seed.scamTokens?.forEach((t) => this.#scamTokens.add(tokenKey(t.chainId, t.address)));
    seed.maliciousContracts?.forEach((c) => this.#maliciousContracts.add(tokenKey(c.chainId, c.address)));
    seed.phishingDomains?.forEach((d) => this.#phishingDomains.add(norm(d)));
  }

  isSanctioned(address: string): boolean {
    return this.#sanctioned.has(norm(address));
  }
  isBlacklisted(address: string): boolean {
    return this.#blacklisted.has(norm(address));
  }
  isKnownScamToken(chainId: string, address: string): boolean {
    return this.#scamTokens.has(tokenKey(chainId, address));
  }
  isMaliciousContract(chainId: string, address: string): boolean {
    return this.#maliciousContracts.has(tokenKey(chainId, address));
  }
  isPhishingDomain(domain: string): boolean {
    return this.#phishingDomains.has(norm(domain));
  }

  /** Feed update (a real impl applies a verified signed snapshot). */
  addSanctioned(address: string): void {
    this.#sanctioned.add(norm(address));
  }
  addScamToken(chainId: string, address: string): void {
    this.#scamTokens.add(tokenKey(chainId, address));
  }
}

/** An intel that knows nothing — for tests that isolate the heuristic detectors. */
export const emptyThreatIntel: ThreatIntel = {
  isSanctioned: () => false,
  isBlacklisted: () => false,
  isKnownScamToken: () => false,
  isMaliciousContract: () => false,
  isPhishingDomain: () => false,
};
