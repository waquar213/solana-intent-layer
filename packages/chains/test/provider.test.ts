import { describe, expect, it } from 'vitest';
import { ChainError, JsonRpcError } from '../src/errors.js';
import { HttpJsonRpcTransport, ProviderPool, redactRpcUrl, type JsonRpcTransport } from '../src/provider.js';

/** Scriptable fake transport: each call consumes the next behavior. */
function fakeTransport(url: string, behaviors: Array<'ok' | 'transport-error' | 'rpc-error' | 'hang'>) {
  const calls: string[] = [];
  const transport: JsonRpcTransport = {
    url,
    async request(method, _params, signal) {
      calls.push(method);
      const behavior = behaviors.length > 1 ? behaviors.shift() : behaviors[0];
      switch (behavior) {
        case 'ok':
          return `${url}:${method}`;
        case 'transport-error':
          throw new ChainError('TRANSPORT_FAILED', `boom from ${url}`);
        case 'rpc-error':
          throw new JsonRpcError(3, 'execution reverted', '0xdeadbeef');
        case 'hang':
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new ChainError('TIMEOUT', `aborted ${url}`)));
          });
        default:
          throw new Error('unscripted call');
      }
    },
  };
  return { transport, calls };
}

describe('ProviderPool', () => {
  it('serves from the first (highest-priority) endpoint when healthy', async () => {
    const a = fakeTransport('https://a', ['ok']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport]);
    expect(await pool.request('eth_blockNumber')).toBe('https://a:eth_blockNumber');
    expect(b.calls).toHaveLength(0);
  });

  it('fails over to the next endpoint on transport errors', async () => {
    const a = fakeTransport('https://a', ['transport-error']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport]);
    expect(await pool.request('eth_blockNumber')).toBe('https://b:eth_blockNumber');
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });

  it('propagates JSON-RPC error responses WITHOUT failover (reverts are deterministic)', async () => {
    const a = fakeTransport('https://a', ['rpc-error']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport]);
    await expect(pool.request('eth_call')).rejects.toThrowError(JsonRpcError);
    expect(b.calls).toHaveLength(0);
    // ...and the endpoint stays healthy: it answered correctly.
    expect(pool.stats()[0]?.healthy).toBe(true);
  });

  it('puts a failed endpoint in cooldown, then retries it after the cooldown expires', async () => {
    let clock = 1_000_000;
    const a = fakeTransport('https://a', ['transport-error', 'ok', 'ok']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport], { cooldownMs: 30_000, now: () => clock });

    await pool.request('m1'); // a fails → cooldown; served by b
    expect(pool.stats()[0]?.healthy).toBe(false);

    await pool.request('m2'); // a still cooling → straight to b
    expect(a.calls).toHaveLength(1);

    clock += 30_001; // cooldown elapsed
    expect(await pool.request('m3')).toBe('https://a:m3'); // a restored to priority
    expect(pool.stats()[0]?.healthy).toBe(true);
    expect(pool.stats()[0]?.consecutiveFailures).toBe(0);
  });

  it('escalates cooldown linearly with consecutive failures (capped)', async () => {
    let clock = 0;
    const a = fakeTransport('https://a', ['transport-error']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport], { cooldownMs: 10_000, now: () => clock });

    await pool.request('m1'); // failure #1 → cooldown 10s
    expect(pool.stats()[0]?.cooldownUntil).toBe(10_000);

    clock = 10_001; // a healthy again, fails again → failure #2 → 20s
    await pool.request('m2');
    expect(pool.stats()[0]?.cooldownUntil).toBe(clock + 20_000);
  });

  it('tries cooling endpoints anyway when ALL endpoints are cooling (degrade, never brick)', async () => {
    const clock = 0;
    const a = fakeTransport('https://a', ['transport-error', 'ok']);
    const pool = new ProviderPool([a.transport], { cooldownMs: 60_000, now: () => clock });
    await expect(pool.request('m1')).rejects.toThrowError(expect.objectContaining({ code: 'ALL_PROVIDERS_FAILED' }));
    // Still cooling, but it is the only endpoint — must be attempted.
    expect(await pool.request('m2')).toBe('https://a:m2');
  });

  it('throws ALL_PROVIDERS_FAILED listing every attempted endpoint', async () => {
    const a = fakeTransport('https://a', ['transport-error']);
    const b = fakeTransport('https://b', ['transport-error']);
    const pool = new ProviderPool([a.transport, b.transport]);
    await expect(pool.request('eth_blockNumber')).rejects.toThrowError(/https:\/\/a.*https:\/\/b/u);
  });

  it('aborts hung requests via the per-attempt timeout and fails over', async () => {
    const a = fakeTransport('https://a', ['hang']);
    const b = fakeTransport('https://b', ['ok']);
    const pool = new ProviderPool([a.transport, b.transport], { timeoutMs: 25 });
    expect(await pool.request('eth_blockNumber')).toBe('https://b:eth_blockNumber');
  });

  it('rejects an empty transport list', () => {
    expect(() => new ProviderPool([])).toThrowError(ChainError);
  });

  it('tracks latency EWMA in stats', async () => {
    const a = fakeTransport('https://a', ['ok']);
    const pool = new ProviderPool([a.transport]);
    await pool.request('m');
    expect(pool.stats()[0]?.ewmaLatencyMs).not.toBeNull();
  });
});

describe('redactRpcUrl', () => {
  it('strips API keys from paths and query strings', () => {
    expect(redactRpcUrl('https://eth-mainnet.g.alchemy.com/v2/SECRET-KEY')).toBe('https://eth-mainnet.g.alchemy.com');
    expect(redactRpcUrl('https://rpc.example.com/?apikey=SECRET')).toBe('https://rpc.example.com');
    expect(redactRpcUrl('not a url')).toBe('<invalid-url>');
  });
});

describe('HttpJsonRpcTransport', () => {
  function fetchStub(handler: (body: Record<string, unknown>) => Response | Promise<Response>): typeof fetch {
    return (async (_url: unknown, init?: RequestInit) =>
      handler(JSON.parse(String(init?.body)) as Record<string, unknown>)) as typeof fetch;
  }

  const signal = new AbortController().signal;

  it('sends a JSON-RPC 2.0 envelope and returns result', async () => {
    const transport = new HttpJsonRpcTransport(
      'https://rpc.example.com/v2/KEY',
      fetchStub((body) => {
        expect(body['jsonrpc']).toBe('2.0');
        expect(body['method']).toBe('eth_chainId');
        return Response.json({ jsonrpc: '2.0', id: body['id'], result: '0x1' });
      }),
    );
    expect(await transport.request('eth_chainId', [], signal)).toBe('0x1');
    expect(transport.url).toBe('https://rpc.example.com'); // key never exposed
  });

  it('maps JSON-RPC error responses to JsonRpcError', async () => {
    const transport = new HttpJsonRpcTransport(
      'https://rpc.example.com',
      fetchStub((body) =>
        Response.json({
          jsonrpc: '2.0',
          id: body['id'],
          error: { code: 3, message: 'execution reverted', data: '0x08c379a0' },
        }),
      ),
    );
    try {
      await transport.request('eth_call', [], signal);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(JsonRpcError);
      expect((error as JsonRpcError).code).toBe(3);
      expect((error as JsonRpcError).data).toBe('0x08c379a0');
    }
  });

  it('maps HTTP 429 to RATE_LIMITED and other non-2xx to TRANSPORT_FAILED', async () => {
    const limited = new HttpJsonRpcTransport(
      'https://rpc.example.com',
      fetchStub(() => new Response('slow down', { status: 429 })),
    );
    await expect(limited.request('m', [], signal)).rejects.toThrowError(
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
    const broken = new HttpJsonRpcTransport(
      'https://rpc.example.com',
      fetchStub(() => new Response('oops', { status: 502 })),
    );
    await expect(broken.request('m', [], signal)).rejects.toThrowError(
      expect.objectContaining({ code: 'TRANSPORT_FAILED' }),
    );
  });

  it('maps malformed bodies to INVALID_RESPONSE', async () => {
    const notJson = new HttpJsonRpcTransport(
      'https://rpc.example.com',
      fetchStub(() => new Response('<html>gateway</html>', { status: 200 })),
    );
    await expect(notJson.request('m', [], signal)).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_RESPONSE' }),
    );
    const empty = new HttpJsonRpcTransport(
      'https://rpc.example.com',
      fetchStub(() => Response.json({ jsonrpc: '2.0', id: 1 })),
    );
    await expect(empty.request('m', [], signal)).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_RESPONSE' }),
    );
  });

  it('maps network-level fetch rejection to TRANSPORT_FAILED', async () => {
    const transport = new HttpJsonRpcTransport('https://rpc.example.com', (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    await expect(transport.request('m', [], signal)).rejects.toThrowError(
      expect.objectContaining({ code: 'TRANSPORT_FAILED' }),
    );
  });
});
