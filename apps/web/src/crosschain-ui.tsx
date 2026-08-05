/**
 * Cross-chain swap (mainnet aggregator) view. Fetches a REAL best quote from the provider registry
 * (LI.FI today; deBridge/etc. plug in behind the same seam) and shows which venue won, the output, fee,
 * ETA, and the underlying route. Execution is NON-CUSTODIAL and gated behind an explicit mainnet, real-
 * funds acknowledgment — the device signs; the aggregator only proposes; the guard verifies.
 *
 * Home-chain first: SOLANA is offered as a source AND destination (LI.FI routes SOL/SPL ⇄ EVM via Mayan
 * etc.). Whichever chain is the SOURCE decides which key signs — a Solana source signs with the ed25519
 * key (executeCrossChainSwapSolana); an EVM source signs an EIP-1559 tx (executeCrossChainSwapEvm).
 *
 * ⚠️ This is the wallet's highest-stakes surface: REAL mainnet funds, cross-chain. Quoting is read-only
 * and safe; executing requires the acknowledgment below AND a funded wallet + the user's signature.
 */
import { useEffect, useMemo, useState } from 'react';
import { bestCrossChainQuote, makeLifiProvider, type CrossChainSwapQuote } from '@intent-wallet/providers';
import { executeCrossChainSwapEvm, executeCrossChainSwapSolana } from './broadcast';
import type { EvmSendResult } from './broadcast';
import { getNetworkMode } from './settings';
import type { WalletIdentity } from './wallet';

type ChainKind = 'evm' | 'solana';
interface SwapChain {
  key: string;
  label: string;
  canonical: string;
  kind: ChainKind;
}

// The SOURCE chain is where the wallet signs, so it MUST be a chain the wallet's registry knows (else the
// executor fail-closes). Solana is the home chain and leads the list; the rest are exactly the mainnet EVM
// chains in packages/chains registry — keep them in sync (Avalanche etc. were removed: not in the registry,
// so unsignable — offering them produced a quote that then threw on execute).
const CHAINS: ReadonlyArray<SwapChain> = [
  { key: 'solana', label: '◎ Solana', canonical: 'solana:mainnet', kind: 'solana' },
  { key: '1', label: 'Ethereum', canonical: 'eip155:1', kind: 'evm' },
  { key: '42161', label: 'Arbitrum', canonical: 'eip155:42161', kind: 'evm' },
  { key: '10', label: 'Optimism', canonical: 'eip155:10', kind: 'evm' },
  { key: '8453', label: 'Base', canonical: 'eip155:8453', kind: 'evm' },
  { key: '137', label: 'Polygon', canonical: 'eip155:137', kind: 'evm' },
  { key: '56', label: 'BNB Chain', canonical: 'eip155:56', kind: 'evm' },
];
// Token menus differ by ecosystem — SOL is native only on Solana; ETH/WBTC/DAI only on EVM. USDC/USDT
// bridge either way. (Symbols map to real mainnet tokens inside LI.FI.)
const TOKENS_BY_KIND: Record<ChainKind, readonly string[]> = {
  solana: ['SOL', 'USDC', 'USDT'],
  evm: ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC'],
};
const TOKEN_DECIMALS: Record<string, number> = { USDC: 6, USDT: 6, ETH: 18, WETH: 18, DAI: 18, WBTC: 8, SOL: 9 };
const decimalsFor = (sym: string): number => TOKEN_DECIMALS[sym.toUpperCase()] ?? 18;
const chainByKey = (key: string): SwapChain => CHAINS.find((c) => c.key === key) ?? CHAINS[0]!;

function toBase(amount: string, decimals: number): bigint {
  const [w = '0', f = ''] = amount.trim().split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0');
}
function fmtBase(base: bigint, decimals: number): string {
  const s = base.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/u, '');
  return frac ? `${whole}.${frac.slice(0, 6)}` : whole;
}
const usd = (micros: bigint | null): string => (micros === null ? '—' : `$${(Number(micros) / 1e6).toFixed(2)}`);

type RawEvmTx = { chainId?: number; to?: string; data?: string; value?: string; gasLimit?: string };
type RawSolTx = { data?: string };

export function CrossChainSwapView({ me }: { me: WalletIdentity }): JSX.Element {
  const [fromKey, setFromKey] = useState('solana'); // home chain leads
  const [toKey, setToKey] = useState('42161'); // Arbitrum
  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('ETH');
  const [amount, setAmount] = useState('1');
  const [quote, setQuote] = useState<CrossChainSwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<EvmSendResult | null>(null);

  const lifi = useMemo(() => makeLifiProvider(), []);
  const fromChain = chainByKey(fromKey);
  const toChain = chainByKey(toKey);
  const addressFor = (kind: ChainKind): string => (kind === 'solana' ? me.sol.address : me.evm.address);

  // Switching a chain's ecosystem can invalidate the selected token (SOL on an EVM chain, ETH on Solana) —
  // coerce to the first valid token for the new ecosystem at change time.
  const onFromChain = (key: string): void => {
    setFromKey(key);
    const toks = TOKENS_BY_KIND[chainByKey(key).kind];
    if (!toks.includes(fromToken)) setFromToken(toks[0]!);
  };
  const onToChain = (key: string): void => {
    setToKey(key);
    const toks = TOKENS_BY_KIND[chainByKey(key).kind];
    if (!toks.includes(toToken)) setToToken(toks[0]!);
  };

  // Clear the fetched route/quote whenever the network mode is toggled, so a testnet↔mainnet switch never
  // leaves a stale quote (or a checked "real funds" acknowledgment) from the other network on screen.
  const [netMode, setNetMode] = useState(getNetworkMode());
  useEffect(() => {
    const t = setInterval(() => setNetMode(getNetworkMode()), 400);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setQuote(null);
    setResult(null);
    setErr(null);
    setAck(false);
  }, [netMode]);

  const getQuote = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    setQuote(null);
    setResult(null);
    setAck(false);
    try {
      const dec = decimalsFor(fromToken);
      const q = await lifi.quote({
        fromChainId: fromChain.canonical,
        toChainId: toChain.canonical,
        fromToken,
        toToken,
        amountInBase: toBase(amount, dec),
        fromDecimals: dec,
        fromAddress: addressFor(fromChain.kind),
        // The receiver on the DEST chain is this same wallet, but its address form differs by ecosystem
        // (base58 for Solana, 0x… for EVM) — pass it explicitly so a SOL→EVM route pays out to the EVM
        // address, not the (wrong-ecosystem) source address LI.FI would otherwise default to.
        toAddress: addressFor(toChain.kind),
        slippageBps: 50,
      });
      // One provider today; the registry + bestCrossChainQuote compare N once deBridge/etc. are added.
      setQuote(bestCrossChainQuote([q]).best);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Quote failed');
    } finally {
      setLoading(false);
    }
  };

  const execute = async (): Promise<void> => {
    const ex = quote?.execution;
    if (!ex) {
      setErr('This route has no executable transaction.');
      return;
    }
    setExecuting(true);
    setErr(null);
    try {
      const valueUsd = quote && quote.toValueMicros !== null ? Number(quote.toValueMicros) / 1e6 : undefined;
      const guard = { acknowledgeMainnet: true, acknowledgeHighValue: true, ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}) };
      let r: EvmSendResult;
      if (ex.ecosystem === 'solana') {
        const data = (ex.raw as RawSolTx).data;
        if (!data) throw new Error('Malformed Solana route transaction from the provider.');
        r = await executeCrossChainSwapSolana({ data, ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}), guard });
      } else {
        const raw = ex.raw as RawEvmTx;
        if (!raw.to || !raw.data || raw.chainId === undefined) throw new Error('Malformed route transaction from the provider.');
        const dec = decimalsFor(fromToken);
        r = await executeCrossChainSwapEvm({
          evmChainId: raw.chainId,
          to: raw.to,
          data: raw.data,
          value: raw.value ?? '0x0',
          ...(raw.gasLimit ? { gasLimit: raw.gasLimit } : {}),
          ...(ex.fromTokenAddress ? { fromTokenAddress: ex.fromTokenAddress } : {}),
          ...(ex.approvalSpender ? { approvalSpender: ex.approvalSpender } : {}),
          approvalAmountBase: toBase(amount, dec).toString(),
          ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}),
          guard,
        });
      }
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setExecuting(false);
    }
  };

  const eco = quote?.execution?.ecosystem;
  const canExecute = (eco === 'evm' || eco === 'solana') && ack && !executing && !result;

  return (
    <section className="hv">
      <div className="sect-head">
        <h2 className="sect-title">Cross-chain swap</h2>
        <span className="brg-sub">
          Best route across aggregators (LI.FI now; deBridge next) · <b>mainnet · real funds</b> · non-custodial (your device signs)
        </span>
      </div>

      <div className="card brg-card">
        <div className="brg-leg">
          <div className="brg-leg-top">
            <span className="brg-label">From</span>
            <select className="brg-select" value={fromKey} onChange={(e) => onFromChain(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="brg-amt">
            <input className="brg-amt-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
            <select className="brg-select" value={fromToken} onChange={(e) => setFromToken(e.target.value)}>
              {TOKENS_BY_KIND[fromChain.kind].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="brg-leg">
          <div className="brg-leg-top">
            <span className="brg-label">To</span>
            <select className="brg-select" value={toKey} onChange={(e) => onToChain(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="brg-amt receive">
            <span className="brg-recv">{quote ? fmtBase(quote.toAmountBase, quote.toDecimals) : '—'}</span>
            <select className="brg-select" value={toToken} onChange={(e) => setToToken(e.target.value)}>
              {TOKENS_BY_KIND[toChain.kind].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn primary brg-go" onClick={() => void getQuote()} disabled={loading || !amount.trim()} type="button">
          {loading ? 'Finding best route…' : 'Get best quote'}
        </button>

        {quote && (
          <div className="brg-route" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <span>
              🏆 <b>{quote.providerId}</b> via <b>{quote.tool}</b> — you receive ≈ <b>{fmtBase(quote.toAmountBase, quote.toDecimals)} {quote.toTokenSymbol}</b> ({usd(quote.toValueMicros)})
            </span>
            <span className="muted">
              route: {quote.steps.length ? quote.steps.join(' → ') : quote.tool} · fee {usd(quote.feeMicros)} · gas {usd(quote.gasMicros)} · ~{quote.etaSeconds}s
            </span>
          </div>
        )}

        {quote && !result && (
          <>
            <label className="brg-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                ⚠️ This moves <b>REAL mainnet funds</b> across chains and is <b>irreversible</b>. I've reviewed the route above and want to sign it on my device.
              </span>
            </label>
            <button className="btn primary brg-go" onClick={() => void execute()} disabled={!canExecute} type="button">
              {executing ? 'Signing on device…' : `Swap ${fromToken} on ${fromChain.label} → ${toToken} on ${toChain.label}`}
            </button>
          </>
        )}

        {result && (
          <p className="brg-note">
            ✅ Broadcast:{' '}
            <a href={result.explorerUrl} target="_blank" rel="noreferrer">
              {result.txid.slice(0, 16)}… →
            </a>
          </p>
        )}
        {err && <p className="authz-deny err-line">🛑 {err}</p>}
      </div>
    </section>
  );
}
