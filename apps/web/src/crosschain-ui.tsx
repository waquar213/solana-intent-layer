/**
 * Cross-chain swap (mainnet aggregator) view. Fetches a REAL best quote from the provider registry
 * (LI.FI today; deBridge/etc. plug in behind the same seam) and shows which venue won, the output, fee,
 * ETA, and the underlying route. Execution is NON-CUSTODIAL and gated behind an explicit mainnet, real-
 * funds acknowledgment — the device signs; the aggregator only proposes; the guard verifies.
 *
 * ⚠️ This is the wallet's highest-stakes surface: REAL mainnet funds, cross-chain. Quoting is read-only
 * and safe; executing requires the acknowledgment below AND a funded wallet + the user's signature.
 */
import { useMemo, useState } from 'react';
import { bestCrossChainQuote, makeLifiProvider, type CrossChainSwapQuote } from '@intent-wallet/providers';
import { executeCrossChainSwapEvm } from './broadcast';
import type { EvmSendResult } from './broadcast';
import type { WalletIdentity } from './wallet';

// The SOURCE chain is where the wallet signs, so it MUST be a chain the wallet's registry knows (else
// executeCrossChainSwapEvm fail-closes on chainByEvmChainId). These are exactly the mainnet EVM chains
// in packages/chains registry — keep them in sync (Avalanche etc. were removed: not in the registry, so
// unsignable — offering them produced a quote that then threw on execute).
const MAINNET_CHAINS: ReadonlyArray<{ id: number; label: string }> = [
  { id: 1, label: 'Ethereum' },
  { id: 42161, label: 'Arbitrum' },
  { id: 10, label: 'Optimism' },
  { id: 8453, label: 'Base' },
  { id: 137, label: 'Polygon' },
  { id: 56, label: 'BNB Chain' },
];
const TOKENS = ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC'] as const;
const TOKEN_DECIMALS: Record<string, number> = { USDC: 6, USDT: 6, ETH: 18, WETH: 18, DAI: 18, WBTC: 8 };
const decimalsFor = (sym: string): number => TOKEN_DECIMALS[sym.toUpperCase()] ?? 18;
const canonical = (evmId: number): string => `eip155:${evmId}`;
const labelFor = (id: number): string => MAINNET_CHAINS.find((c) => c.id === id)?.label ?? String(id);

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

export function CrossChainSwapView({ me }: { me: WalletIdentity }): JSX.Element {
  const [fromChain, setFromChain] = useState(42161);
  const [toChain, setToChain] = useState(10);
  const [fromToken, setFromToken] = useState('USDC');
  const [toToken, setToToken] = useState('ETH');
  const [amount, setAmount] = useState('100');
  const [quote, setQuote] = useState<CrossChainSwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<EvmSendResult | null>(null);

  const lifi = useMemo(() => makeLifiProvider(), []);

  const getQuote = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    setQuote(null);
    setResult(null);
    try {
      const dec = decimalsFor(fromToken);
      const q = await lifi.quote({
        fromChainId: canonical(fromChain),
        toChainId: canonical(toChain),
        fromToken,
        toToken,
        amountInBase: toBase(amount, dec),
        fromDecimals: dec,
        fromAddress: me.evm.address,
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
    if (!ex || ex.ecosystem !== 'evm') {
      setErr('This route has no executable EVM transaction (Solana source execution is a later step).');
      return;
    }
    const raw = ex.raw as RawEvmTx;
    if (!raw.to || !raw.data || raw.chainId === undefined) {
      setErr('Malformed route transaction from the provider.');
      return;
    }
    setExecuting(true);
    setErr(null);
    try {
      const dec = decimalsFor(fromToken);
      const valueUsd = quote && quote.toValueMicros !== null ? Number(quote.toValueMicros) / 1e6 : undefined;
      const r = await executeCrossChainSwapEvm({
        evmChainId: raw.chainId,
        to: raw.to,
        data: raw.data,
        value: raw.value ?? '0x0',
        ...(raw.gasLimit ? { gasLimit: raw.gasLimit } : {}),
        ...(ex.fromTokenAddress ? { fromTokenAddress: ex.fromTokenAddress } : {}),
        ...(ex.approvalSpender ? { approvalSpender: ex.approvalSpender } : {}),
        approvalAmountBase: toBase(amount, dec).toString(),
        ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}),
        // Explicit real-funds acknowledgment — the guard blocks a mainnet broadcast without it.
        guard: { acknowledgeMainnet: true, acknowledgeHighValue: true, ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}) },
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setExecuting(false);
    }
  };

  const canExecute = quote?.execution?.ecosystem === 'evm' && ack && !executing && !result;

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
            <select className="brg-select" value={fromChain} onChange={(e) => setFromChain(Number(e.target.value))}>
              {MAINNET_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="brg-amt">
            <input className="brg-amt-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
            <select className="brg-select" value={fromToken} onChange={(e) => setFromToken(e.target.value)}>
              {TOKENS.map((t) => (
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
            <select className="brg-select" value={toChain} onChange={(e) => setToChain(Number(e.target.value))}>
              {MAINNET_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="brg-amt receive">
            <span className="brg-recv">{quote ? fmtBase(quote.toAmountBase, quote.toDecimals) : '—'}</span>
            <select className="brg-select" value={toToken} onChange={(e) => setToToken(e.target.value)}>
              {TOKENS.map((t) => (
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
              {executing ? 'Signing on device…' : `Swap ${fromToken} on ${labelFor(fromChain)} → ${toToken} on ${labelFor(toChain)}`}
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
