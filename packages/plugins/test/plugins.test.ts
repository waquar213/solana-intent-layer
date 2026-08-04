import { describe, expect, it } from 'vitest';
import {
  aggregateRating,
  authorizeHostCall,
  authorizeSubscription,
  canonicalManifest,
  checkUsage,
  compare,
  createPluginRegistry,
  createTestEnv,
  decideHealthAction,
  emptyHealth,
  evaluateTrust,
  fakeSignatureVerifier,
  isCompatible,
  listingSignals,
  maxSatisfying,
  resolveDependencies,
  resolveLimits,
  sandboxPolicyFor,
  satisfies,
  transition,
  validateManifest,
  verifyPlugin,
  type AuthorizedSigner,
  type EventName,
  type PluginManifest,
  type RegisterInput,
} from '../src/index.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const { sign, verify } = fakeSignatureVerifier();
const env = createTestEnv({ verify });

const SIGNERS: AuthorizedSigner[] = [
  { signer: 'platform', publicKey: 'pk-official', maxTrust: 'official' },
  { signer: 'partner', publicKey: 'pk-partner', maxTrust: 'verified' },
];

const manifest = (over: Partial<PluginManifest> = {}): PluginManifest => ({
  id: 'com.acme.tax',
  name: 'Tax Helper',
  version: '1.0.0',
  type: 'tax',
  publisher: 'acme',
  apiVersion: '1.0.0',
  permissions: ['portfolio.read', 'analytics.read'],
  events: ['portfolio.updated'],
  entry: 'index.js',
  codeHash: 'CODEHASH',
  trustLevel: 'community',
  resources: {},
  dependencies: {},
  ...over,
});

const signedInput = (
  m: PluginManifest,
  opts: {
    signer?: string;
    publicKey?: string;
    signedTrustLevel?: PluginManifest['trustLevel'];
    deliveredCodeHash?: string;
    signature?: string;
  } = {},
): RegisterInput => {
  const publicKey = opts.publicKey ?? 'pk-official';
  const signer = opts.signer ?? 'platform';
  const signedTrustLevel = opts.signedTrustLevel ?? m.trustLevel;
  const signature = opts.signature ?? sign(publicKey, canonicalManifest(m));
  return {
    manifest: m,
    signature: { signer, publicKey, signature, signedTrustLevel },
    deliveredCodeHash: opts.deliveredCodeHash ?? m.codeHash,
  };
};

// ── Semver ───────────────────────────────────────────────────────────────────
describe('semver', () => {
  it('orders versions incl. prerelease', () => {
    expect(compare('1.0.0', '2.0.0')).toBe(-1);
    expect(compare('1.0.0-beta', '1.0.0')).toBe(-1); // prerelease < release
    expect(compare('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('satisfies caret / tilde / comparators / exact / star', () => {
    expect(satisfies('1.4.2', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfies('0.2.9', '^0.2.3')).toBe(true); // 0.x caret locks minor
    expect(satisfies('0.3.0', '^0.2.3')).toBe(false);
    expect(satisfies('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfies('1.5.0', '>=1.2.0')).toBe(true);
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('9.9.9', '*')).toBe(true);
  });

  it('resolves dependencies to the highest satisfying version, and reports the unresolved', () => {
    const r = resolveDependencies(
      { 'plug.a': '^1.0.0', 'plug.b': '^3.0.0' },
      { 'plug.a': ['1.0.0', '1.2.0', '2.0.0'], 'plug.b': ['2.0.0'] },
    );
    expect(r.resolved['plug.a']).toBe('1.2.0');
    expect(r.unresolved).toEqual([{ id: 'plug.b', range: '^3.0.0' }]);
    expect(maxSatisfying(['1.0.0', '1.9.0', '2.1.0'], '^1.0.0')).toBe('1.9.0');
  });

  // Regression: a prerelease must NOT slip into a stable range. An attacker who could
  // publish 2.0.0-evil should not have it selected for a dependency on ^1.0.0 or '*'.
  it('excludes prereleases from stable ranges (node-semver rule)', () => {
    expect(satisfies('1.0.1-beta', '^1.0.0')).toBe(false);
    expect(satisfies('1.3.0-rc.1', '~1.3.0')).toBe(false);
    expect(satisfies('2.0.0-evil', '>=1.0.0')).toBe(false);
    expect(satisfies('9.9.9-rc', '*')).toBe(false); // '*' does not match prereleases
    expect(satisfies('1.0.0-beta', '1.0.0')).toBe(false); // exact stable ≠ prerelease
    // ...but a prerelease IS allowed when the range base is a prerelease at the same core.
    expect(satisfies('1.0.0-beta.2', '^1.0.0-beta.1')).toBe(true);
    expect(satisfies('1.0.0-beta', '>=1.0.0-alpha')).toBe(true);
    // A prerelease on a DIFFERENT core than the base is still excluded.
    expect(satisfies('2.0.0-beta', '^1.0.0-beta')).toBe(false);
    // maxSatisfying prefers the stable release and never returns the prerelease.
    expect(maxSatisfying(['1.0.0', '2.0.0-evil'], '^1.0.0')).toBe('1.0.0');
  });

  // Regression: an unsupported / malformed range must fail CLOSED (no match), never
  // throw — otherwise a single bad dependency range crashes resolveDependencies.
  it('fails closed on malformed ranges instead of throwing', () => {
    expect(satisfies('1.2.3', 'garbage!!')).toBe(false);
    expect(satisfies('1.2.3', '^not-a-version')).toBe(false);
    expect(satisfies('1.2.3', '>=oops')).toBe(false);
    expect(() => maxSatisfying(['1.0.0', 'also-not-a-version'], '^1.0.0')).not.toThrow();
    expect(maxSatisfying(['1.0.0', 'also-not-a-version'], '^1.0.0')).toBe('1.0.0');
    expect(() =>
      resolveDependencies({ 'plug.a': 'garbage!!' }, { 'plug.a': ['1.0.0'] }),
    ).not.toThrow();
    expect(resolveDependencies({ 'plug.a': 'garbage!!' }, { 'plug.a': ['1.0.0'] }).unresolved).toEqual([
      { id: 'plug.a', range: 'garbage!!' },
    ]);
  });
});

// ── Manifest ─────────────────────────────────────────────────────────────────
describe('manifest', () => {
  it('validates and rejects malformed manifests', () => {
    expect(() => validateManifest(manifest())).not.toThrow();
    expect(() => validateManifest(manifest({ version: 'not-semver' }))).toThrow(/semver/i);
    expect(() =>
      validateManifest(manifest({ permissions: ['portfolio.god' as PluginManifest['permissions'][number]] })),
    ).toThrow(/unknown permission/i);
    expect(() => validateManifest(manifest({ codeHash: '' }))).toThrow(/codeHash/i);
  });

  it('canonical form is order-independent over permissions', () => {
    const a = canonicalManifest(manifest({ permissions: ['analytics.read', 'portfolio.read'] }));
    const b = canonicalManifest(manifest({ permissions: ['portfolio.read', 'analytics.read'] }));
    expect(a).toBe(b);
  });

  // Regression: the executable entrypoint and resources are security-relevant and MUST
  // be covered by the signature. Otherwise an attacker co-ships a dormant evil module
  // and flips `entry` to it after signing, and the signature still verifies.
  it('signs the entrypoint and resources (canonical form changes when they change)', () => {
    const base = canonicalManifest(manifest({ entry: 'index.js' }));
    expect(canonicalManifest(manifest({ entry: 'evil.js' }))).not.toBe(base);
    const res = canonicalManifest(manifest({ resources: {} }));
    expect(canonicalManifest(manifest({ resources: { memoryMb: 4096 } }))).not.toBe(res);
  });
});

// ── Capability gate ──────────────────────────────────────────────────────────
describe('capability gate — the security core', () => {
  it('allows a granted method and denies a missing permission', () => {
    expect(authorizeHostCall('portfolio.get', ['portfolio.read']).allowed).toBe(true);
    expect(authorizeHostCall('portfolio.annotate', ['portfolio.read']).allowed).toBe(false); // needs portfolio.write
  });

  it('NEVER allows a forbidden method — even with every permission', () => {
    const all = [
      'portfolio.read',
      'portfolio.write',
      'intent.read',
      'intent.create',
      'notifications.send',
      'analytics.read',
      'blockchain.read',
      'provider.access',
      'automation.access',
      'background.execute',
    ] as const;
    for (const m of ['signTransaction', 'exportPrivateKey', 'getSigner', 'queryDatabase', 'getSecurityInternals']) {
      expect(authorizeHostCall(m, all).allowed).toBe(false);
    }
  });

  it('denies an unknown/ungated method by default', () => {
    expect(authorizeHostCall('some.new.method', ['portfolio.read']).allowed).toBe(false);
  });

  it('denies inherited object keys — no prototype-lookup bypass', () => {
    for (const m of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(authorizeHostCall(m, ['portfolio.read']).allowed).toBe(false);
    }
  });
});

// ── Trust levels ─────────────────────────────────────────────────────────────
describe('trust levels — escalating permission ceilings', () => {
  it('experimental cannot hold background/write; official can hold everything', () => {
    const exp = evaluateTrust('experimental', ['portfolio.read', 'portfolio.write', 'background.execute']);
    expect(exp.grantable).toEqual(['portfolio.read']);
    expect(exp.rejected).toEqual(['portfolio.write', 'background.execute']);

    const off = evaluateTrust('official', ['portfolio.write', 'background.execute']);
    expect(off.rejected).toEqual([]);
    expect(off.autoApprovable).toBe(true);
  });

  it('clamps resource limits to the trust ceiling', () => {
    expect(resolveLimits('experimental', { memoryMb: 4096 }).memoryMb).toBe(64);
    expect(resolveLimits('official', { memoryMb: 128 }).memoryMb).toBe(128);
  });
});

// ── Signing / supply chain ───────────────────────────────────────────────────
describe('signing gauntlet — supply chain', () => {
  it('verifies a correctly signed, intact, authorized plugin', () => {
    const r = verifyPlugin({ ...signedInput(manifest()), signers: SIGNERS }, env);
    expect(r.verified).toBe(true);
  });

  it('rejects an integrity mismatch (delivered code != signed code)', () => {
    const r = verifyPlugin({ ...signedInput(manifest(), { deliveredCodeHash: 'TAMPERED' }), signers: SIGNERS }, env);
    expect(r.verified).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/integrity/i);
  });

  it('rejects a trust-claim mismatch (signed level != claimed level)', () => {
    const m = manifest({ trustLevel: 'official' });
    const r = verifyPlugin({ ...signedInput(m, { signedTrustLevel: 'community' }), signers: SIGNERS }, env);
    expect(r.verified).toBe(false);
  });

  it('rejects a signer that may not attest that trust level (community signer minting official)', () => {
    const weak: AuthorizedSigner[] = [{ signer: 'weak', publicKey: 'pk-weak', maxTrust: 'community' }];
    const m = manifest({ trustLevel: 'official' });
    const r = verifyPlugin(
      { ...signedInput(m, { signer: 'weak', publicKey: 'pk-weak', signedTrustLevel: 'official' }), signers: weak },
      env,
    );
    expect(r.verified).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/may not attest/i);
  });

  it('rejects a bad signature and a revoked plugin', () => {
    const bad = verifyPlugin({ ...signedInput(manifest(), { signature: 'forged' }), signers: SIGNERS }, env);
    expect(bad.verified).toBe(false);

    const revoked = verifyPlugin(
      {
        ...signedInput(manifest()),
        signers: SIGNERS,
        revocations: [{ pluginId: 'com.acme.tax', versionRange: '*', reason: 'malware' }],
      },
      env,
    );
    expect(revoked.verified).toBe(false);
  });

  it('the default env fails closed — an unsigned plugin does not verify', () => {
    const strict = createTestEnv(); // default verify → false
    expect(verifyPlugin({ ...signedInput(manifest()), signers: SIGNERS }, strict).verified).toBe(false);
  });
});

// ── Sandbox / events / lifecycle / marketplace ───────────────────────────────
describe('sandbox + events + lifecycle', () => {
  it('sandbox policy exposes only granted methods and flags usage violations', () => {
    const policy = sandboxPolicyFor('community', ['portfolio.read'], { memoryMb: 999 });
    expect(policy.allowedMethods).toContain('portfolio.get');
    expect(policy.allowedMethods).not.toContain('portfolio.annotate');
    expect(policy.limits.memoryMb).toBe(128); // clamped to community ceiling
    const usage = checkUsage({ memoryMb: 200, cpuMs: 10, storageMb: 1, elapsedMs: 10 }, policy.limits);
    expect(usage.withinLimits).toBe(false);
  });

  it('authorizes event subscriptions by permission; public events need none', () => {
    expect(authorizeSubscription('portfolio.updated', ['portfolio.read']).allowed).toBe(true);
    expect(authorizeSubscription('portfolio.updated', []).allowed).toBe(false);
    expect(authorizeSubscription('plugin.installed', []).allowed).toBe(true); // public
  });

  // Regression: an inherited object key must NOT resolve to a truthy prototype value
  // that slips past the deny-by-default gate. '__proto__'/'constructor' are unknown events.
  it('denies prototype-pollution event names by default', () => {
    for (const probe of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const d = authorizeSubscription(probe as EventName, ['portfolio.read', 'analytics.read']);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/unknown event/i);
    }
  });

  it('lifecycle transitions are total; illegal ones throw; health suspends', () => {
    expect(transition('registered', 'install')).toBe('installed');
    expect(() => transition('removed', 'enable')).toThrow(/cannot/i);
    expect(decideHealthAction({ ...emptyHealth(), crashes: 5 }).action).toBe('suspend');
    expect(decideHealthAction({ ...emptyHealth(), permissionViolations: 1 }).action).toBe('suspend');
    expect(decideHealthAction(emptyHealth()).action).toBe('none');
  });

  it('marketplace surfaces a badge + warnings and aggregates ratings', () => {
    const signals = listingSignals('experimental', ['background.execute']);
    expect(signals.badge).toBe('Experimental');
    expect(signals.warnings.length).toBeGreaterThan(0);
    expect(aggregateRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]).average).toBe(4.3);
  });

  it('host API compatibility is caret-based', () => {
    expect(isCompatible('1.5.0', '1.2.0')).toBe(true);
    expect(isCompatible('2.0.0', '1.2.0')).toBe(false);
  });
});

// ── Registry integration ─────────────────────────────────────────────────────
describe('PluginRegistry — the full pipeline', () => {
  const fresh = () => createPluginRegistry({ env, hostApiVersion: '1.3.0', signers: SIGNERS });

  it('registers → installs (within trust + approval) → enables → gates calls', () => {
    const reg = fresh();
    const m = manifest({ permissions: ['portfolio.read', 'intent.create', 'portfolio.write'] }); // community
    expect(reg.register(signedInput(m)).ok).toBe(true);

    const install = reg.install(m.id, ['portfolio.read', 'intent.create']);
    expect(install.granted).toEqual(['portfolio.read', 'intent.create']);
    expect(install.rejected).toContain('portfolio.write'); // above community ceiling

    reg.transition(m.id, 'enable');
    expect(reg.authorizeCall(m.id, 'portfolio.get').allowed).toBe(true);
    expect(reg.authorizeCall(m.id, 'intent.propose').allowed).toBe(true);
  });

  it('an enabled plugin with granted permissions STILL cannot reach a forbidden method', () => {
    const reg = fresh();
    const m = manifest({ trustLevel: 'official', permissions: ['portfolio.read'] });
    reg.register(signedInput(m));
    reg.install(m.id, []); // official auto-approves
    reg.transition(m.id, 'enable');
    expect(reg.authorizeCall(m.id, 'signTransaction').allowed).toBe(false);
  });

  it('auto-suspends after a permission violation, and cannot call while suspended', () => {
    const reg = fresh();
    const m = manifest({ permissions: ['portfolio.read'] });
    reg.register(signedInput(m));
    reg.install(m.id, ['portfolio.read']);
    reg.transition(m.id, 'enable');
    reg.authorizeCall(m.id, 'portfolio.annotate'); // denied → 1 violation
    expect(reg.healthTick(m.id).suspended).toBe(true);
    expect(reg.get(m.id)?.state).toBe('suspended');
  });

  // Regression: the event side channel must count violations too, or a plugin can probe
  // for permissions it lacks via authorizeEvent without ever tripping auto-suspend.
  it('counts a denied event subscription as a violation and auto-suspends', () => {
    const reg = fresh();
    const m = manifest({ permissions: ['portfolio.read'] });
    reg.register(signedInput(m));
    reg.install(m.id, ['portfolio.read']);
    reg.transition(m.id, 'enable');
    expect(reg.authorizeEvent(m.id, 'automation.triggered').allowed).toBe(false); // needs automation.access
    expect(reg.health(m.id)?.permissionViolations).toBe(1);
    expect(reg.healthTick(m.id).suspended).toBe(true);
    expect(reg.get(m.id)?.state).toBe('suspended');
  });

  // Regression: an entry-swap after signing must fail verification. The delivered code
  // is the SAME dormant bundle (codeHash unchanged), but `entry` now points at the evil
  // module — the canonical form differs, so the signature no longer matches.
  it('rejects an entrypoint swap performed after signing (supply-chain)', () => {
    const reg = fresh();
    const honest = manifest({ entry: 'index.js' });
    const signed = signedInput(honest); // signature computed over entry='index.js'
    const tampered: RegisterInput = {
      ...signed,
      manifest: { ...honest, entry: 'evil.js' }, // flip the entrypoint, keep the old signature
    };
    expect(reg.register(tampered).ok).toBe(false);
  });

  it('deep-copies the manifest on register — a caller cannot escalate permissions post-registration', () => {
    const reg = fresh();
    const m = manifest({ trustLevel: 'community', permissions: ['portfolio.read'] });
    reg.register(signedInput(m));
    (m as unknown as { permissions: string[] }).permissions = ['portfolio.read', 'portfolio.write']; // mutate caller copy
    const install = reg.install(m.id, ['portfolio.read', 'portfolio.write']);
    expect(install.granted).toEqual(['portfolio.read']); // the injected write is NOT granted
  });

  it('rejects an incompatible plugin and an unsigned one', () => {
    const reg = fresh();
    expect(reg.register(signedInput(manifest({ apiVersion: '2.0.0' }))).ok).toBe(false); // host is 1.3.0
    const unsigned = createPluginRegistry({ env: createTestEnv(), hostApiVersion: '1.3.0', signers: SIGNERS });
    expect(unsigned.register(signedInput(manifest())).ok).toBe(false);
  });

  it('automatic revocation suspends a running plugin and blocks re-running it', () => {
    const reg = fresh();
    const m = manifest();
    reg.register(signedInput(m));
    reg.install(m.id, ['portfolio.read', 'analytics.read']);
    reg.transition(m.id, 'enable');
    expect(reg.revoke({ pluginId: m.id, versionRange: '*', reason: 'malware' })).toEqual([m.id]);
    expect(reg.get(m.id)?.state).toBe('suspended');
    expect(() => reg.transition(m.id, 'resume')).toThrow(/revoked/i); // resume path also blocked
  });
});
