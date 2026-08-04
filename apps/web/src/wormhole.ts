/**
 * Wormhole Token Bridge (Wrapped Token Transfers) — the real, guardian-verified cross-chain bridge.
 *
 * WHY: it supersedes the trust-based operator relayer for supported routes. The 19-guardian VAA is the
 * deterministic attestation between the source lock/burn and the destination redeem — "AI proposes,
 * deterministic code verifies, the device signature disposes" applied across chains.
 *
 * NON-CUSTODIAL: the SDK builds UNSIGNED transactions; the wallet's ON-DEVICE core key signs them (the
 * key never leaves the browser, never touches a server). See `NonCustodialWormholeSigner`.
 *
 * SCOPE: every Wormhole **Testnet** chain this wallet can actually SIGN for — Solana (ed25519) + every
 * EVM chain (one secp256k1 key covers them all). The list is DERIVED from the SDK, not hardcoded, so it
 * never drifts. Non-EVM / non-Solana Wormhole chains (Aptos, Sui, NEAR, …) need their own keyring first
 * and are intentionally excluded (fail-closed): the picker only offers what we can sign AND redeem.
 *
 * STATUS: config + handle + feasibility self-check are live. The non-custodial signing seam is
 * FAIL-CLOSED (throws) until the SDK↔core transaction conversion is built, tested, and security-
 * reviewed — it never pretends to sign (no-fake-data).
 */
// Granular imports (NOT the meta `@wormhole-foundation/sdk` root, which re-exports every chain's
// address codec — algosdk/sui/near/aptos — and breaks the bundle). Core from sdk-connect/sdk-base;
// only the EVM + Solana platforms are loaded via the `/evm` `/solana` subpaths.
import { Wormhole } from '@wormhole-foundation/sdk-connect';
import { chains, chainToPlatform } from '@wormhole-foundation/sdk-base';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import type { Chain } from '@wormhole-foundation/sdk-connect';
import type { SignOnlySigner, SignedTx, UnsignedTransaction } from '@wormhole-foundation/sdk-definitions';

/**
 * Wormhole chains this wallet can SIGN for, derived from the SDK: Solana + every EVM chain. Because a
 * single secp256k1 key signs for all EVM chains and one ed25519 key for Solana, this is the exact set
 * the wallet can both send from and redeem on — no per-chain hardcoding, no stale list.
 */
export const SIGNABLE_WORMHOLE_CHAINS: Chain[] = chains.filter((c) => c === 'Solana' || chainToPlatform(c) === 'Evm');

/** Is this Wormhole chain one the wallet holds a key for? Fail-closed for everything else. */
export function isSignableWormholeChain(c: Chain): boolean {
  return c === 'Solana' || chainToPlatform(c) === 'Evm';
}

// Lazily construct ONE Testnet handle. This inlines the meta package's `wormhole()` factory (which we
// can't import — it lives in the meta root beside the all-chains address registry): load the EVM +
// Solana platform loaders, then `new Wormhole(network, platforms)`. Reused across calls.
let handle: Promise<Wormhole<'Testnet'>> | null = null;
export function getWormhole(): Promise<Wormhole<'Testnet'>> {
  handle ??= (async (): Promise<Wormhole<'Testnet'>> => {
    const defs = await Promise.all([evm(), solana()]);
    return new Wormhole(
      'Testnet',
      defs.map((d) => d.Platform),
    );
  })();
  return handle;
}

/**
 * Feasibility self-check — constructs the handle and reports which signable chains actually have a
 * Testnet context. Proves the SDK initializes in THIS environment (the real integration unknown:
 * browser polyfills, platform loading). Returns an honest error string instead of throwing.
 */
export async function wormholeSelfCheck(): Promise<{ ok: boolean; total: number; available: string[]; error?: string }> {
  try {
    const wh = await getWormhole();
    const available = SIGNABLE_WORMHOLE_CHAINS.filter((c) => {
      try {
        wh.getChain(c);
        return true;
      } catch {
        return false; // chain has no Testnet deployment — omit
      }
    });
    return { ok: true, total: SIGNABLE_WORMHOLE_CHAINS.length, available };
  } catch (e) {
    return { ok: false, total: SIGNABLE_WORMHOLE_CHAINS.length, available: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The non-custodial signer seam. The SDK hands us `UnsignedTransaction`s (EVM: an ethers
 * `TransactionRequest`; Solana: a web3 `Transaction`). The contract we will implement: sign each with
 * the wallet's on-device core key (EVM secp256k1 / Solana ed25519) — key never leaves the device — and
 * return the signed bytes for the SDK to broadcast.
 *
 * FAIL-CLOSED FOR NOW: building + testing + security-reviewing that conversion is the next milestone.
 * Until then this THROWS rather than sign, so no funds move and the UI can never claim a fake success.
 */
export class NonCustodialWormholeSigner<C extends Chain> implements SignOnlySigner<'Testnet', C> {
  constructor(
    private readonly _chain: C,
    private readonly _address: string,
  ) {}
  chain(): C {
    return this._chain;
  }
  address(): string {
    return this._address;
  }
  async sign(_txs: UnsignedTransaction<'Testnet', C>[]): Promise<SignedTx[]> {
    throw new Error(
      'Wormhole non-custodial signing is not wired yet — the on-device SDK↔core signer seam is the next milestone. No transaction was signed.',
    );
  }
}
