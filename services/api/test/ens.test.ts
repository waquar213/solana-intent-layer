import { describe, expect, it } from 'vitest';
import { makeEnsResolver, namehash } from '../src/ens.js';

/** A 20-byte address left-padded into a 32-byte ABI return word. */
const pad32 = (addr: string): string => `0x${'0'.repeat(24)}${addr.replace(/^0x/u, '').toLowerCase()}`;

function fakeRpc(handler: (to: string, data: string) => string): {
  fetchFn: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  calls: { to: string; data: string }[];
} {
  const calls: { to: string; data: string }[] = [];
  const fetchFn = (_url: string, init: { body: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    const req = JSON.parse(init.body) as { id: number; params: [{ to: string; data: string }, string] };
    const { to, data } = req.params[0];
    calls.push({ to, data });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: req.id, jsonrpc: '2.0', result: handler(to, data) }) });
  };
  return { fetchFn, calls };
}

const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e';
const RESOLVER = '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63';
const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('namehash (ENSIP-1 known answers)', () => {
  it('matches the spec vectors', () => {
    expect(namehash('')).toBe(`0x${'0'.repeat(64)}`);
    expect(namehash('eth')).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
    expect(namehash('vitalik.eth')).toBe('0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835');
  });
});

describe('makeEnsResolver', () => {
  it('resolves a name via registry.resolver → resolver.addr', async () => {
    const { fetchFn, calls } = fakeRpc((to) => {
      if (to.toLowerCase() === REGISTRY) return pad32(RESOLVER); // resolver(node)
      if (to.toLowerCase() === RESOLVER) return pad32(VITALIK); // addr(node)
      return '0x';
    });

    const addr = await makeEnsResolver('http://rpc', fetchFn)('vitalik.eth');

    expect(addr).toBe(VITALIK);
    expect(calls).toHaveLength(2);
  });

  it('returns null when no resolver is set (skips the addr call)', async () => {
    const { fetchFn, calls } = fakeRpc(() => pad32('0x0000000000000000000000000000000000000000'));

    expect(await makeEnsResolver('http://rpc', fetchFn)('nope.eth')).toBeNull();
    expect(calls).toHaveLength(1); // only the registry lookup
  });

  it('rejects a malformed name without any RPC call', async () => {
    const { fetchFn, calls } = fakeRpc(() => '0x');
    const resolve = makeEnsResolver('http://rpc', fetchFn);

    expect(await resolve('not-ens')).toBeNull(); // no .eth suffix
    expect(await resolve('foo_bar.eth')).toBeNull(); // underscore not allowed
    expect(await resolve('')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
