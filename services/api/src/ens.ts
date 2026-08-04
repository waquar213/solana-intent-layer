/**
 * ENS name resolution — turn `vitalik.eth` into an EVM address, so a user can send to a
 * human-readable name instead of a 42-char hex string (in chat: "send 0.1 ETH to
 * vitalik.eth", and in the web send flow).
 *
 * Resolution is LIVE over mainnet via two `eth_call`s (registry → resolver → addr); a name
 * with no resolver or no address set returns `null` — never a guessed/placeholder address
 * (no-fake-data). The registry lives at the same well-known mainnet address; the RPC is the
 * configured Ethereum node (Alchemy or the public default).
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';

/** ENS registry (Ethereum mainnet). */
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const SELECTOR_RESOLVER = '0x0178b8bf'; // resolver(bytes32)
const SELECTOR_ADDR = '0x3b3b57de'; // addr(bytes32)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
/** A well-formed ENS name: dot-separated a-z/0-9/hyphen labels ending in `.eth`. */
const ENS_NAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/u;

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** ENSIP-1 namehash: recursive keccak256 over the reversed dot-separated labels. */
export function namehash(name: string): string {
  let node: Uint8Array = new Uint8Array(32); // namehash('') = 32 zero bytes
  const trimmed = name.trim().toLowerCase();
  if (trimmed) {
    const labels = trimmed.split('.');
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      const labelHash = keccak_256(utf8ToBytes(labels[i] as string));
      node = keccak_256(concatBytes(node, labelHash));
    }
  }
  return `0x${bytesToHex(node)}`;
}

/** Extract a 20-byte address from a 32-byte ABI word, or null if unset/malformed. */
function wordToAddress(word: string): string | null {
  const hex = word.startsWith('0x') ? word.slice(2) : word;
  if (hex.length < 64) return null; // not a full word → nothing set
  const address = `0x${hex.slice(-40)}`.toLowerCase();
  return address === ZERO_ADDRESS ? null : address;
}

/**
 * Build an ENS resolver over the given JSON-RPC endpoint. Returns a function that maps a
 * `name.eth` to a lowercase EVM address, or `null` if the name is malformed / has no
 * resolver / has no address record.
 */
export function makeEnsResolver(rpcUrl: string, fetchFn?: FetchLike): (name: string) => Promise<string | null> {
  const doFetch: FetchLike = fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));
  let requestId = 0;
  const ethCall = async (to: string, data: string): Promise<string> => {
    requestId += 1;
    const res = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id: requestId, jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
    if (!res.ok) throw new Error(`ens eth_call failed (HTTP ${res.status})`);
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) throw new Error(`ens eth_call: ${body.error.message ?? 'rpc error'}`);
    return body.result ?? '0x';
  };

  return async (name: string): Promise<string | null> => {
    const trimmed = name.trim().toLowerCase();
    if (!ENS_NAME.test(trimmed)) return null;
    const node = namehash(trimmed).slice(2);

    const resolver = wordToAddress(await ethCall(ENS_REGISTRY, SELECTOR_RESOLVER + node));
    if (!resolver) return null; // no resolver set for this name

    return wordToAddress(await ethCall(resolver, SELECTOR_ADDR + node));
  };
}
