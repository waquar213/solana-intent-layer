import { describe, expect, it } from 'vitest';
import {
  CapabilityError,
  ChainCapabilityRegistry,
  PLAN_STEP_KINDS,
  ProviderRouteRegistry,
  createCapabilityService,
  createChainCapabilityRegistry,
  createDefaultCapabilityService,
  createProviderRouteRegistry,
  validateChainProfile,
  type ChainCapabilityProfile,
  type ProviderRouteDeclaration,
} from '../src/index.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const chainProfile = (over: Partial<ChainCapabilityProfile> = {}): ChainCapabilityProfile => ({
  id: 'eip155:1',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'Ethereum',
  ecosystem: 'evm',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  feeModel: 'eip1559',
  finality: { kind: 'evm_finalized_tag' },
  tokenStandard: 'erc20',
  capabilities: ['transfer', 'swap', 'bridge', 'approve', 'stake', 'smart_account'],
  smartAccount: { supported: true, standard: 'erc4337' },
  staking: { supported: true, consensus: 'pos' },
  addressing: { memoRequired: false, destTagRequired: false },
  ...over,
});

// ── Profile validation (fail-closed on malformed data) ───────────────────────
describe('validateChainProfile', () => {
  it('accepts a well-formed profile', () => {
    expect(() => validateChainProfile(chainProfile())).not.toThrow();
  });

  it('rejects a non-CAIP-2 id', () => {
    expect(() => validateChainProfile(chainProfile({ id: 'ethereum' }))).toThrow(/CAIP-2/i);
  });

  it('rejects an unknown capability, feeModel, and non-integer decimals', () => {
    expect(() =>
      validateChainProfile(chainProfile({ capabilities: ['transfer', 'teleport' as never] })),
    ).toThrow(/unknown capability/i);
    expect(() => validateChainProfile(chainProfile({ feeModel: 'quantum' as never }))).toThrow(/feeModel/i);
    expect(() =>
      validateChainProfile(chainProfile({ nativeAsset: { symbol: 'ETH', name: 'Ether', decimals: -1 } })),
    ).toThrow(/decimals/i);
  });

  it('rejects a capability/sub-fact mismatch (claims stake but staking.supported false)', () => {
    expect(() =>
      validateChainProfile(chainProfile({ staking: { supported: false, consensus: 'pos' } })),
    ).toThrow(/staking\.supported/i);
    expect(() => validateChainProfile(chainProfile({ smartAccount: { supported: false } }))).toThrow(
      /smartAccount\.supported/i,
    );
  });

  it('rejects a duplicate capability and a bad version', () => {
    expect(() =>
      validateChainProfile(chainProfile({ capabilities: ['transfer', 'transfer'] })),
    ).toThrow(/duplicate/i);
    expect(() => validateChainProfile(chainProfile({ version: 0 }))).toThrow(/version/i);
  });

  // Regression (adversarial review): required string fields + nested shapes were unvalidated.
  it('rejects missing/empty required string fields (label, effectiveFromIso, nativeAsset.name)', () => {
    expect(() => validateChainProfile(chainProfile({ label: '' }))).toThrow(/label/i);
    expect(() =>
      validateChainProfile(chainProfile({ label: { en: 'x' } as unknown as string })),
    ).toThrow(/label/i);
    expect(() => validateChainProfile(chainProfile({ effectiveFromIso: '' }))).toThrow(/effectiveFromIso/i);
    expect(() =>
      validateChainProfile(chainProfile({ nativeAsset: { symbol: 'ETH', name: 12345 as unknown as string, decimals: 18 } })),
    ).toThrow(/nativeAsset\.name/i);
    expect(() =>
      validateChainProfile(chainProfile({ notes: 42 as unknown as string })),
    ).toThrow(/notes/i);
  });

  it('rejects incomplete finality (missing confirmations / bad solana commitment)', () => {
    expect(() =>
      validateChainProfile(chainProfile({ finality: { kind: 'confirmations' } })),
    ).toThrow(/confirmations is required/i);
    expect(() =>
      validateChainProfile(
        chainProfile({
          finality: { kind: 'solana_commitment', commitment: 'whenever' as unknown as 'confirmed' },
        }),
      ),
    ).toThrow(/commitment/i);
  });

  it('turns a null nested sub-object into a CapabilityError, not a raw TypeError', () => {
    expect(() =>
      validateChainProfile(chainProfile({ staking: null as unknown as { supported: boolean } })),
    ).toThrow(CapabilityError);
    expect(() =>
      validateChainProfile(chainProfile({ smartAccount: null as unknown as { supported: boolean } })),
    ).toThrow(/smartAccount/i);
  });
});

// ── Versioned registry (monotonic, single-active, deep-copy) ─────────────────
describe('ChainCapabilityRegistry', () => {
  it('publishing a new active version retires the previous one', () => {
    const reg = new ChainCapabilityRegistry();
    reg.register(chainProfile({ version: 1 }));
    reg.register(chainProfile({ version: 2, label: 'Ethereum v2' }));
    expect(reg.getActive('eip155:1')?.version).toBe(2);
    expect(reg.getVersion('eip155:1', 1)?.status).toBe('retired');
    expect(reg.getVersion('eip155:1', 2)?.status).toBe('active');
    expect(reg.list('eip155:1').map((p) => p.version)).toEqual([1, 2]);
  });

  it('rejects a duplicate or non-monotonic version', () => {
    const reg = createChainCapabilityRegistry([chainProfile({ version: 2 })]);
    expect(() => reg.register(chainProfile({ version: 2 }))).toThrow(CapabilityError);
    expect(() => reg.register(chainProfile({ version: 1 }))).toThrow(/not greater/i);
  });

  it('deep-copies on the way in AND out — a caller cannot corrupt a published version', () => {
    const reg = new ChainCapabilityRegistry();
    const input = chainProfile();
    reg.register(input);
    (input.capabilities as string[]).push('gas_sponsorship'); // mutate the caller's array post-register
    expect(reg.getActive('eip155:1')?.capabilities).not.toContain('gas_sponsorship');

    const out = reg.getActive('eip155:1')!;
    (out.capabilities as string[]).push('nft'); // mutate the returned clone
    expect(reg.getActive('eip155:1')?.capabilities).not.toContain('nft');
  });

  it('getActive is undefined for an unknown chain (⇒ callers fail closed)', () => {
    expect(new ChainCapabilityRegistry().getActive('eip155:999')).toBeUndefined();
  });

  // Regression: retiring a version must not corrupt it, and reads of a RETIRED version
  // must still be deep-cloned (the retire path once used a shallow spread).
  it('retiring a version preserves it intact and reads of it stay isolated', () => {
    const reg = new ChainCapabilityRegistry();
    reg.register(chainProfile({ version: 1 }));
    reg.register(chainProfile({ version: 2 })); // retires v1
    const retired = reg.getVersion('eip155:1', 1)!;
    expect(retired.status).toBe('retired');
    expect(retired.capabilities).toContain('stake'); // data intact after retire
    (retired.capabilities as string[]).push('nft'); // mutate the returned clone
    expect(reg.getVersion('eip155:1', 1)?.capabilities).not.toContain('nft'); // store unaffected
  });
});

// ── Route registry (static, health-free) ─────────────────────────────────────
describe('ProviderRouteRegistry', () => {
  const bridge = (over: Partial<ProviderRouteDeclaration> = {}): ProviderRouteDeclaration => ({
    providerId: 'stargate',
    kind: 'bridge',
    action: 'bridge_cross_chain',
    fromChainId: 'eip155:1',
    toChainId: 'eip155:137',
    symbol: 'USDC',
    enabled: true,
    ...over,
  });

  it('matches routes case-insensitively by symbol; empty ⇒ no such route class', () => {
    const reg = createProviderRouteRegistry([bridge()]);
    expect(reg.routesFor('bridge_cross_chain', 'eip155:1', 'eip155:137', 'usdc')).toHaveLength(1);
    expect(reg.routesFor('bridge_cross_chain', 'eip155:1', 'eip155:137', 'DAI')).toHaveLength(0);
  });

  it('excludes disabled route classes (integration toggle, not liveness)', () => {
    const reg = createProviderRouteRegistry([bridge({ enabled: false })]);
    expect(reg.routesFor('bridge_cross_chain', 'eip155:1', 'eip155:137', 'USDC')).toHaveLength(0);
    expect(reg.bridgeConnectivity().get('eip155:1')?.has('eip155:137')).not.toBe(true);
  });

  it('rejects a self-loop bridge and a cross-chain swap', () => {
    const reg = new ProviderRouteRegistry();
    expect(() => reg.registerRoute(bridge({ toChainId: 'eip155:1' }))).toThrow(/distinct/i);
    expect(() =>
      reg.registerRoute(bridge({ action: 'swap_same_chain', kind: 'swap', toChainId: 'eip155:137' })),
    ).toThrow(/same-chain/i);
  });

  it('exposes a static adjacency graph of enabled bridge edges', () => {
    const reg = createProviderRouteRegistry([bridge(), bridge({ toChainId: 'eip155:10', symbol: 'ETH' })]);
    expect([...(reg.bridgeConnectivity().get('eip155:1') ?? [])].sort()).toEqual(['eip155:10', 'eip155:137']);
  });
});

// ── The consulted facade (fail-closed everywhere) ────────────────────────────
describe('CapabilityService (the consulted facade)', () => {
  const svc = createDefaultCapabilityService();

  it('supportsChain / supportsCapability fail closed on unknown or absent', () => {
    expect(svc.supportsChain('eip155:1')).toBe(true);
    expect(svc.supportsChain('eip155:999')).toBe(false); // unknown
    expect(svc.supportsCapability('eip155:1', 'stake')).toBe(true);
    expect(svc.supportsCapability('bip122:bitcoin', 'stake')).toBe(false); // BTC can't stake
    expect(svc.supportsCapability('eip155:999', 'transfer')).toBe(false); // unknown chain
  });

  it('feeModelFor is the source of truth per ecosystem (replaces an eip155: prefix test)', () => {
    expect(svc.feeModelFor('eip155:1')).toBe('eip1559');
    expect(svc.feeModelFor('bip122:bitcoin')).toBe('utxo');
    expect(svc.feeModelFor('solana:mainnet')).toBe('spl');
    expect(svc.feeModelFor('eip155:999')).toBeUndefined();
  });

  it('canTransfer requires a network-ecosystem match', () => {
    expect(svc.canTransfer('eip155:1', 'evm')).toBe(true);
    expect(svc.canTransfer('eip155:1', 'btc')).toBe(false); // wrong ecosystem for this chain
    expect(svc.canTransfer('bip122:bitcoin', 'btc')).toBe(true);
  });

  it('canBridge is true only with a declared route AND both chains supported + bridge-capable', () => {
    expect(svc.canBridge('eip155:1', 'eip155:137', 'USDC')).toBe(true);
    expect(svc.canBridge('eip155:1', 'eip155:137')).toBe(true); // symbol-agnostic edge exists
    expect(svc.canBridge('eip155:1', 'bip122:bitcoin', 'BTC')).toBe(false); // BTC has no bridge capability
    expect(svc.canBridge('eip155:1', 'solana:mainnet')).toBe(false); // no declared route
    expect(svc.canBridge('eip155:1', 'eip155:1')).toBe(false); // same chain isn't a bridge
  });

  it('checkStep rejects a bridge with no destination network (the guard is reachable)', () => {
    const r = svc.checkStep({ kind: 'bridge', chainId: 'eip155:1' }); // no toChainId supplied
    expect(r.supported).toBe(false);
    expect(r.reason).toMatch(/missing a destination network/i);
  });

  it('checkStep maps each kind → its capability; the map is exhaustive over PlanStepKind', () => {
    for (const kind of PLAN_STEP_KINDS) {
      const step =
        kind === 'bridge'
          ? { kind, chainId: 'eip155:1', toChainId: 'eip155:137', symbol: 'USDC' }
          : { kind, chainId: 'eip155:1' };
      expect(svc.checkStep(step).supported).toBe(true); // eip155:1 supports all five
    }
  });

  it('checkPlan rejects a stake on a non-staking chain and a bridge to an unknown network', () => {
    const stakeBtc = svc.checkPlan({ steps: [{ seq: 0, kind: 'stake', chainId: 'bip122:bitcoin' }] });
    expect(stakeBtc.feasible).toBe(false);
    expect(stakeBtc.unsupported[0]?.reason).toMatch(/does not support 'stake'/i);

    const bridgeUnknown = svc.checkPlan({
      steps: [{ seq: 0, kind: 'bridge', chainId: 'eip155:1', toChainId: 'eip155:424242', symbol: 'USDC' }],
    });
    expect(bridgeUnknown.feasible).toBe(false);
    expect(bridgeUnknown.unsupported[0]?.reason).toMatch(/not supported|no bridge route/i);
  });

  it('a feasible single-step transfer plan passes', () => {
    expect(svc.checkPlan({ steps: [{ seq: 0, kind: 'transfer', chainId: 'eip155:1' }] }).feasible).toBe(true);
  });

  it('a deprecated / maintenance chain fails closed even though a profile exists', () => {
    const svc2 = createCapabilityService({
      chains: createChainCapabilityRegistry([chainProfile({ id: 'eip155:5', availability: 'deprecated' })]),
      routes: new ProviderRouteRegistry(),
    });
    expect(svc2.supportsChain('eip155:5')).toBe(false); // profile exists, but not 'supported'
    expect(svc2.feeModelFor('eip155:5')).toBeUndefined(); // fail-closed: NO capability data for a non-supported chain
    expect(svc2.checkPlan({ steps: [{ seq: 0, kind: 'transfer', chainId: 'eip155:5' }] }).feasible).toBe(false);
  });
});
