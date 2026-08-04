/**
 * A focused semantic-versioning implementation — enough for plugin compatibility and
 * dependency resolution without a dependency. Supports exact, `*`, comparators
 * (`>= > <= < =`), caret (`^`) and tilde (`~`) ranges, with correct precedence
 * including prerelease ordering (1.0.0-beta < 1.0.0). Pure and deterministic.
 */
import { PluginError } from './errors.js';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (string | number)[];
}

const RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

export function parse(v: string): SemVer {
  const m = RE.exec(v.trim());
  if (!m) throw new PluginError('INVALID_SEMVER', `not a semantic version: '${v}'`);
  const prerelease = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };
}

export function tryParse(v: string): SemVer | null {
  try {
    return parse(v);
  } catch {
    return null;
  }
}

const cmpNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

/** Full semver precedence, prerelease included. */
export function compare(a: SemVer | string, b: SemVer | string): number {
  const x = typeof a === 'string' ? parse(a) : a;
  const y = typeof b === 'string' ? parse(b) : b;
  const core = cmpNum(x.major, y.major) || cmpNum(x.minor, y.minor) || cmpNum(x.patch, y.patch);
  if (core !== 0) return core;
  // A version WITH a prerelease has lower precedence than one without.
  if (x.prerelease.length === 0 && y.prerelease.length === 0) return 0;
  if (x.prerelease.length === 0) return 1;
  if (y.prerelease.length === 0) return -1;
  const len = Math.max(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < len; i++) {
    const xi = x.prerelease[i];
    const yi = y.prerelease[i];
    if (xi === undefined) return -1; // shorter set of identifiers = lower precedence
    if (yi === undefined) return 1;
    if (xi === yi) continue;
    const xn = typeof xi === 'number';
    const yn = typeof yi === 'number';
    if (xn && yn) return cmpNum(xi as number, yi as number);
    if (xn) return -1; // numeric identifiers are lower than alphanumeric
    if (yn) return 1;
    return String(xi) < String(yi) ? -1 : 1;
  }
  return 0;
}

const eq = (a: SemVer, b: SemVer): boolean => compare(a, b) === 0;

/** Does `version` satisfy `range`? */
export function satisfies(version: string, range: string): boolean {
  const v = tryParse(version);
  if (!v) return false;
  const r = range.trim();
  if (r === '' || r === '*' || r === 'x') return v.prerelease.length === 0; // '*' does NOT match prereleases

  let base: SemVer;
  let ok: boolean;
  try {
    if (r.startsWith('^')) {
      base = parse(r.slice(1));
      ok = caret(v, base);
    } else if (r.startsWith('~')) {
      base = parse(r.slice(1));
      ok = tilde(v, base);
    } else {
      const m = /^(>=|<=|>|<|=)\s*(.+)$/.exec(r);
      if (m) {
        base = parse(m[2]!);
        const c = compare(v, base);
        ok = m[1] === '>=' ? c >= 0 : m[1] === '<=' ? c <= 0 : m[1] === '>' ? c > 0 : m[1] === '<' ? c < 0 : c === 0;
      } else {
        base = parse(r); // bare version → exact match
        ok = eq(v, base);
      }
    }
  } catch {
    return false; // a range syntax we don't support fails CLOSED (no match) — never throws
  }

  // Prerelease rule (node-semver): a prerelease version satisfies a range ONLY if the
  // range's base is itself a prerelease at the SAME major.minor.patch. So 1.0.1-beta
  // never sneaks into ^1.0.0, and a stable release is always preferred.
  if (v.prerelease.length > 0) {
    const sameCore = v.major === base.major && v.minor === base.minor && v.patch === base.patch;
    if (!(base.prerelease.length > 0 && sameCore)) return false;
  }
  return ok;
}

function caret(v: SemVer, base: SemVer): boolean {
  if (compare(v, base) < 0) return false;
  if (base.major > 0) return v.major === base.major;
  if (base.minor > 0) return v.major === 0 && v.minor === base.minor;
  return v.major === 0 && v.minor === 0 && v.patch === base.patch;
}

function tilde(v: SemVer, base: SemVer): boolean {
  if (compare(v, base) < 0) return false;
  return v.major === base.major && v.minor === base.minor;
}

/** Highest version in `versions` that satisfies `range`, or null. */
export function maxSatisfying(versions: readonly string[], range: string): string | null {
  const ok = versions.filter((v) => satisfies(v, range)).sort((a, b) => compare(a, b));
  return ok.length > 0 ? ok[ok.length - 1]! : null;
}

export interface ResolveResult {
  resolved: Record<string, string>;
  unresolved: Array<{ id: string; range: string }>;
}

/** Resolve each direct dependency to the highest available version satisfying its range. */
export function resolveDependencies(
  deps: Record<string, string>,
  available: Record<string, readonly string[]>,
): ResolveResult {
  const resolved: Record<string, string> = {};
  const unresolved: Array<{ id: string; range: string }> = [];
  for (const [id, range] of Object.entries(deps)) {
    const pick = maxSatisfying(available[id] ?? [], range);
    if (pick) resolved[id] = pick;
    else unresolved.push({ id, range });
  }
  return { resolved, unresolved };
}
