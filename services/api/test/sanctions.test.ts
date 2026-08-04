import { describe, expect, it } from 'vitest';
import { fetchSanctionedAddresses, loadOfacRiskEngine } from '../src/sanctions.js';

// A real OFAC-SDN Tornado Cash address (used only as a fixture; the feed is faked below).
const SANCTIONED = '0x8589427373D6D84E98730D7795D8f6f8731FDA16';
const CLEAN = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth

function fakeFeed(
  body: string,
  ok = true,
  status = 200,
): {
  fetchFn: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchFn = (url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }> => {
    calls.push(url);
    return Promise.resolve({ ok, status, text: () => Promise.resolve(body) });
  };
  return { fetchFn, calls };
}

describe('fetchSanctionedAddresses', () => {
  it('parses, lowercases and dedupes address lines (ignoring junk)', async () => {
    const { fetchFn } = fakeFeed(
      [
        '# OFAC SDN digital currency addresses',
        SANCTIONED,
        '  0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  ',
        SANCTIONED.toLowerCase(), // duplicate, different case
        'not-an-address',
        '',
      ].join('\n'),
    );

    const addrs = await fetchSanctionedAddresses({ fetchFn, sources: ['feed'] });

    expect(addrs).toContain(SANCTIONED.toLowerCase());
    expect(addrs).toContain('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(addrs.filter((a) => a === SANCTIONED.toLowerCase())).toHaveLength(1); // deduped
    expect(addrs).not.toContain('not-an-address');
  });

  it('throws when a feed source returns non-OK', async () => {
    const { fetchFn } = fakeFeed('', false, 503);

    await expect(fetchSanctionedAddresses({ fetchFn, sources: ['feed'] })).rejects.toThrow(/HTTP 503/u);
  });
});

describe('loadOfacRiskEngine', () => {
  it('seeds a RiskEngine that BLOCKS a sanctioned recipient and allows a clean one', async () => {
    const { fetchFn } = fakeFeed(`${SANCTIONED}\n`);

    const { riskEngine, count } = await loadOfacRiskEngine({ fetchFn, sources: ['feed'] });
    expect(count).toBe(1);

    const blocked = riskEngine.evaluate({ kind: 'address', address: SANCTIONED, knownAddresses: [] });
    expect(blocked.verdict).toBe('block');
    expect(blocked.report.signals.some((s) => s.code === 'SANCTIONED_ADDRESS')).toBe(true);

    const allowed = riskEngine.evaluate({ kind: 'address', address: CLEAN, knownAddresses: [] });
    expect(allowed.verdict).not.toBe('block');
  });
});
