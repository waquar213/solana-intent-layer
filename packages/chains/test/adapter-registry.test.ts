import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/adapter-registry.js';
import { EvmAdapter } from '../src/evm/adapter.js';
import { SolanaAdapter } from '../src/solana/adapter.js';
import { BitcoinAdapter } from '../src/bitcoin/adapter.js';

/** A fetch stub that records the URL it was called with and returns a canned body.
 *  A string body is returned as plain text (for esplora text endpoints); anything
 *  else is JSON-encoded. */
function fetchStub(onUrl: (url: string) => void, body: unknown): typeof fetch {
  return (async (url: unknown) => {
    onUrl(String(url));
    const isText = typeof body === 'string';
    return new Response(isText ? (body as string) : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json' },
    });
  }) as typeof fetch;
}

describe('AdapterRegistry (the gateway)', () => {
  it('returns the correct adapter type per ecosystem', () => {
    const registry = new AdapterRegistry({ fetchFn: fetchStub(() => {}, {}) });
    expect(registry.get('ethereum')).toBeInstanceOf(EvmAdapter);
    expect(registry.get('base')).toBeInstanceOf(EvmAdapter);
    expect(registry.get('solana')).toBeInstanceOf(SolanaAdapter);
    expect(registry.get('bitcoin')).toBeInstanceOf(BitcoinAdapter);
  });

  it('memoizes adapters (same instance per chain)', () => {
    const registry = new AdapterRegistry({ fetchFn: fetchStub(() => {}, {}) });
    expect(registry.get('arbitrum')).toBe(registry.get('arbitrum'));
  });

  it('prefers injected keyed RPC URLs over public defaults', async () => {
    const seen: string[] = [];
    const registry = new AdapterRegistry({
      rpcUrls: { ethereum: ['https://keyed.example/v2/KEY'] },
      fetchFn: fetchStub((u) => seen.push(u), { jsonrpc: '2.0', id: 1, result: '0x10' }),
    });
    await registry.get('ethereum').getBlockHeight();
    expect(seen[0]).toContain('keyed.example'); // keyed endpoint tried first
  });

  it('wires a working EVM adapter end-to-end through the registry', async () => {
    const registry = new AdapterRegistry({
      fetchFn: fetchStub(() => {}, { jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' }),
    });
    expect(await registry.get('ethereum').getNativeBalance('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(
      10n ** 18n,
    );
  });

  it('wires a working Bitcoin adapter (REST) through the registry', async () => {
    const registry = new AdapterRegistry({ fetchFn: fetchStub(() => {}, '905000') });
    // getBlockHeight hits /blocks/tip/height (text) — the stub returns the same body.
    expect(await registry.get('bitcoin').getBlockHeight()).toBe(905_000n);
  });
});
