import { describe, expect, it } from 'vitest';
import { parseDeterministic } from '../src/parse/deterministic.js';
import { CompositeParser, type LlmClient } from '../src/parse/parser.js';
import { baseToDecimal, decimalToBase, extractAmountAndAsset } from '../src/amount.js';

describe('amount parsing', () => {
  it('parses fiat, asset, all, half, percent', () => {
    expect(extractAmountAndAsset('$100 USDT')).toMatchObject({
      amount: { kind: 'fiat', currency: 'USD', value: '100' },
      asset: 'USDT',
    });
    expect(extractAmountAndAsset('₹50,000 of SOL')).toMatchObject({
      amount: { kind: 'fiat', currency: 'INR', value: '50000' },
    });
    expect(extractAmountAndAsset('0.021 BTC')).toMatchObject({
      amount: { kind: 'asset', symbol: 'BTC', value: '0.021' },
    });
    expect(extractAmountAndAsset('everything')).toMatchObject({ amount: { kind: 'all' } });
    expect(extractAmountAndAsset('half my ETH')).toMatchObject({
      amount: { kind: 'fraction', numerator: 1, denominator: 2 },
      asset: 'ETH',
    });
    expect(extractAmountAndAsset('50% of BTC')).toMatchObject({ amount: { kind: 'percent', bps: 5000 } });
    expect(extractAmountAndAsset('gibberish')).toBeNull();
  });

  it('converts decimals to base units and back exactly', () => {
    expect(decimalToBase('1.5', 18)).toBe(1_500_000_000_000_000_000n);
    expect(decimalToBase('0.021', 8)).toBe(2_100_000n);
    expect(baseToDecimal(2_100_000n, 8)).toBe('0.021');
    expect(baseToDecimal(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(decimalToBase('1.23456789', 6)).toBe(1_234_567n); // truncates extra precision
  });

  it('reads thousands separators as one grouped amount, and refuses ambiguous commas', () => {
    // Regression: "1,234 USDC" used to truncate to the last group ("234") — a silent
    // 5.3x under-transfer. A grouped amount must survive intact.
    expect(extractAmountAndAsset('send 1,234 USDC')).toMatchObject({
      amount: { kind: 'asset', symbol: 'USDC', value: '1234' },
    });
    expect(extractAmountAndAsset('swap 1,000 USDC for ETH')).toMatchObject({
      amount: { kind: 'asset', symbol: 'USDC', value: '1000' },
    });
    expect(extractAmountAndAsset('1,234,567.89 USDC')).toMatchObject({
      amount: { kind: 'asset', symbol: 'USDC', value: '1234567.89' },
    });
    // Bare grouped number tied to a detected asset keeps its full value.
    expect(extractAmountAndAsset('buy 2,500 ethereum')).toMatchObject({
      amount: { kind: 'asset', symbol: 'ETH', value: '2500' },
    });
    // Ambiguous comma-as-decimal ("0,5" EU style) must NOT be guessed as 5 — a 10x
    // over-transfer. Refuse it so the caller asks the user instead of signing a wrong tx.
    expect(extractAmountAndAsset('0,5 ETH')).toBeNull();
  });

  it('reads leading-dot decimals as 0.x, never as a whole number', () => {
    // Regression: ".5 ETH" dropped the dot and read as 5 ETH — a 10x over-transfer;
    // ".021 BTC" read as 21 BTC — a 1000x over-transfer. A leading-dot decimal is
    // unambiguous (".5" == 0.5), so it must parse exactly, never balloon.
    expect(extractAmountAndAsset('.5 ETH')).toMatchObject({
      amount: { kind: 'asset', symbol: 'ETH', value: '0.5' },
    });
    expect(extractAmountAndAsset('.021 BTC')).toMatchObject({
      amount: { kind: 'asset', symbol: 'BTC', value: '0.021' },
    });
    // The bare-number path (a detected asset by name) must handle it too.
    expect(extractAmountAndAsset('buy .5 ethereum')).toMatchObject({
      amount: { kind: 'asset', symbol: 'ETH', value: '0.5' },
    });
  });
});

describe('deterministic parser — flagship utterances', () => {
  it('parses "Convert my BTC to ETH"', () => {
    expect(parseDeterministic('Convert my BTC to ETH')).toEqual({
      kind: 'swap',
      fromAsset: 'BTC',
      toAsset: 'ETH',
      amount: { kind: 'all' },
    });
  });

  it('parses "swap 500 USDT for ETH"', () => {
    expect(parseDeterministic('swap 500 USDT for ETH')).toEqual({
      kind: 'swap',
      fromAsset: 'USDT',
      toAsset: 'ETH',
      amount: { kind: 'asset', symbol: 'USDT', value: '500' },
    });
  });

  it('parses a compound "convert X to Y and send to Z" without dropping the send', () => {
    expect(parseDeterministic('CONVERT 5 USDC TO SOL AND SEND 4d9dyddpj6a44A1uMhDRBYWNQWVWnNLHNbj65UVpVjzZ')).toMatchObject({
      kind: 'swap_and_send',
      fromAsset: 'USDC',
      toAsset: 'SOL',
      recipient: '4d9dyddpj6a44A1uMhDRBYWNQWVWnNLHNbj65UVpVjzZ',
    });
    expect(parseDeterministic('swap 1 ETH for USDC then send to 0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toMatchObject({
      kind: 'swap_and_send',
      fromAsset: 'ETH',
      toAsset: 'USDC',
      recipient: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    });
    // A plain swap (no "and send") must still be a plain swap — not a compound.
    expect(parseDeterministic('swap 500 USDT for ETH')).toMatchObject({ kind: 'swap' });
  });

  it('parses "Send $100 USDT to Rahul" preserving recipient casing', () => {
    expect(parseDeterministic('Send $100 USDT to Rahul')).toEqual({
      kind: 'transfer',
      asset: 'USDT',
      amount: { kind: 'fiat', currency: 'USD', value: '100' },
      recipient: 'Rahul',
    });
  });

  it('parses a raw-address recipient without lowercasing it', () => {
    const intent = parseDeterministic('send 0.5 ETH to 0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    expect(intent).toMatchObject({
      kind: 'transfer',
      asset: 'ETH',
      recipient: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    });
  });

  it('parses a send with NO "to" when the tail is a bare address (SEND 1 USDC 0x…)', () => {
    expect(parseDeterministic('SEND 1 USDC 0x0000000000000000000000000000000000000000')).toMatchObject({
      kind: 'transfer',
      asset: 'USDC',
      recipient: '0x0000000000000000000000000000000000000000',
    });
    expect(parseDeterministic('send 0.001 eth 0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toMatchObject({
      kind: 'transfer',
      asset: 'ETH',
      recipient: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    });
    // A bare NAME (no address, no "to") stays ambiguous — must not be claimed as a transfer.
    expect(parseDeterministic('send 5 ETH bob')).not.toMatchObject({ kind: 'transfer' });
  });

  it('parses "buy $50 of SOL" and "buy 2 ETH"', () => {
    expect(parseDeterministic('buy $50 of SOL')).toEqual({
      kind: 'buy',
      asset: 'SOL',
      amount: { kind: 'fiat', currency: 'USD', value: '50' },
    });
    expect(parseDeterministic('buy 2 ETH')).toEqual({
      kind: 'buy',
      asset: 'ETH',
      amount: { kind: 'asset', symbol: 'ETH', value: '2' },
    });
  });

  it('parses "move everything to stables"', () => {
    expect(parseDeterministic('move everything to stables')).toEqual({ kind: 'rebalance', target: 'stables' });
    expect(parseDeterministic('convert all my assets into USDC')).toEqual({ kind: 'rebalance', target: 'stables' });
  });

  it('parses "stake 5 SOL" and clarifies vague staking', () => {
    expect(parseDeterministic('stake 5 SOL')).toEqual({
      kind: 'stake',
      asset: 'SOL',
      amount: { kind: 'asset', symbol: 'SOL', value: '5' },
    });
    expect(parseDeterministic('stake my idle assets safely')).toMatchObject({ kind: 'clarify' });
  });

  it('parses "buy $50 of ETH every Monday" as a weekly recurring buy', () => {
    const intent = parseDeterministic('buy $50 of ETH every Monday');
    expect(intent).toMatchObject({ kind: 'recurring', schedule: { every: 'week', on: 1 } });
    if (intent?.kind === 'recurring') expect(intent.inner).toMatchObject({ kind: 'buy', asset: 'ETH' });
  });

  it('parses "exit everything if bitcoin drops 15%"', () => {
    expect(parseDeterministic('exit everything if bitcoin drops 15%')).toEqual({
      kind: 'emergency_exit',
      trigger: { asset: 'BTC', direction: 'drops', percent: 15 },
      target: 'stables',
    });
  });

  it('CLARIFIES a named single-asset conditional — never blows it up to a whole-portfolio exit', () => {
    // "sell my ETH if BTC drops 10%" is a SINGLE-asset price-triggered order (which the wallet can't arm
    // yet), NOT "liquidate everything". It must clarify, not silently emergency_exit the whole portfolio.
    expect(parseDeterministic('sell my ETH if BTC drops 10%')).toMatchObject({ kind: 'clarify' });
    expect(parseDeterministic('convert my SOL if ETH drops 20%')).toMatchObject({ kind: 'clarify' });
    expect(parseDeterministic('sell all my ETH if BTC drops 10%')).toMatchObject({ kind: 'clarify' }); // "all my ETH" = one asset
    // …but a genuinely portfolio-wide exit still arms (no specific sold asset named before the trigger).
    expect(parseDeterministic('exit if bitcoin drops 15%')).toMatchObject({ kind: 'emergency_exit' });
    expect(parseDeterministic('move everything to stables if eth drops 30%')).toMatchObject({ kind: 'emergency_exit' });
  });

  it('parses read-only questions as queries', () => {
    expect(parseDeterministic("what's my biggest holding?")).toMatchObject({ kind: 'query' });
  });

  it('clarifies when the shape is known but a field is missing', () => {
    expect(parseDeterministic('send 5 to Rahul')).toMatchObject({ kind: 'clarify' }); // asset missing
    expect(parseDeterministic('buy more coins')).toMatchObject({ kind: 'clarify' }); // asset missing
    expect(parseDeterministic('convert my BTC')).toMatchObject({ kind: 'clarify' }); // no destination → ASK
  });

  it('returns null for out-of-vocabulary input (defers to LLM)', () => {
    expect(parseDeterministic('what is the meaning of life')).toBeNull(); // question but not wallet-related
    expect(parseDeterministic('yolo moon lambo')).toBeNull();
  });
});

describe('CompositeParser (deterministic → LLM fallback, schema-validated)', () => {
  it('uses the deterministic result without calling the LLM', async () => {
    let called = false;
    const llm: LlmClient = {
      async parseIntent() {
        called = true;
        return {};
      },
    };
    const parser = new CompositeParser({ llm });
    expect(await parser.parse('convert my BTC to ETH')).toMatchObject({ kind: 'swap' });
    expect(called).toBe(false);
  });

  it('falls back to the LLM and validates its output against the schema', async () => {
    const llm: LlmClient = {
      async parseIntent() {
        return { kind: 'swap', fromAsset: 'BTC', toAsset: 'SOL', amount: { kind: 'all' } };
      },
    };
    const parser = new CompositeParser({ llm });
    expect(await parser.parse('turn my bitcoin into some solana please')).toMatchObject({
      kind: 'swap',
      toAsset: 'SOL',
    });
  });

  it('rejects LLM output that fails schema validation, then clarifies (never guesses)', async () => {
    let attempts = 0;
    const llm: LlmClient = {
      async parseIntent() {
        attempts++;
        return { kind: 'swap', fromAsset: 'BTC' }; // invalid — missing fields
      },
    };
    const parser = new CompositeParser({ llm, llmRetries: 1 });
    expect(await parser.parse('do something weird')).toMatchObject({ kind: 'clarify' });
    expect(attempts).toBe(2); // initial + 1 retry
  });

  it('degrades to a forms-fallback clarify when no LLM is configured', async () => {
    const parser = new CompositeParser();
    expect(await parser.parse('an utterance the rules do not cover')).toMatchObject({ kind: 'clarify' });
  });

  it('treats an LLM error as a clarify, never a throw', async () => {
    const llm: LlmClient = {
      async parseIntent() {
        throw new Error('vendor 500');
      },
    };
    const parser = new CompositeParser({ llm });
    expect(await parser.parse('unhandled phrasing here')).toMatchObject({ kind: 'clarify' });
  });

  it('empty input clarifies', async () => {
    expect(await new CompositeParser().parse('   ')).toMatchObject({ kind: 'clarify' });
  });
});
