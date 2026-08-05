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
import { bestCrossChainQuote, makeLifiProvider, makeDebridgeProvider, type CrossChainSwapQuote, type RankedCrossChainQuote } from '@intent-wallet/providers';
import { executeCrossChainSwapEvm, executeCrossChainSwapSolana } from './broadcast';
import { MAINNET_SPEND_CAP_USD } from '@intent-wallet/chains';
import type { EvmSendResult } from './broadcast';
import { getNetworkMode } from './settings';
import { spotUsd } from './balances';
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
  const [ranked, setRanked] = useState<readonly RankedCrossChainQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  // A SEPARATE high-value acknowledgement for a swap over the $1,000 mainnet cap (or an unpriced route).
  // Previously the guard was handed `acknowledgeHighValue: true` unconditionally, which defeated the
  // deterministic tier-2 spend-cap gate on this — the wallet's highest-value surface. This ack is the real
  // signal, mirroring the App.tsx chat-send confirm dialog.
  const [hvAck, setHvAck] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<EvmSendResult | null>(null);

  // LI.FI needs no per-quote config; deBridge is built per-quote below with fresh native prices (to value
  // its fixFee exactly). The meta-aggregator quotes EVERY provider and the core picks the best net deal.
  // Quote through the BACKEND proxy (/v1/lifi) — the LI.FI key stays server-side (never in the browser).
  const lifi = useMemo(() => makeLifiProvider({ baseUrl: '/v1/lifi' }), []);
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
    setRanked([]);
    setResult(null);
    setErr(null);
    setAck(false);
    setHvAck(false);
  }, [netMode]);

  const getQuote = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    setQuote(null);
    setRanked([]);
    setResult(null);
    setAck(false);
    setHvAck(false);
    try {
      const dec = decimalsFor(fromToken);
      const req = {
        fromChainId: fromChain.canonical,
        toChainId: toChain.canonical,
        fromToken,
        toToken,
        amountInBase: toBase(amount, dec),
        fromDecimals: dec,
        fromAddress: addressFor(fromChain.kind),
        // The receiver on the DEST chain is this same wallet, but its address form differs by ecosystem
        // (base58 for Solana, 0x… for EVM) — pass it explicitly so a SOL→EVM route pays out to the EVM
        // address, not the (wrong-ecosystem) source address a provider would otherwise default to.
        toAddress: addressFor(toChain.kind),
        slippageBps: 50,
      };
      // deBridge's flat fixFee is charged in the SOURCE chain's native token; feed its USD spot so the
      // provider prices it exactly (ETH covers our ETH-native chains, SOL the home chain; a null just
      // makes deBridge fall back to its conservative floor). The feed is cached (60s) + fail-soft.
      const [ethUsd, solUsd] = await Promise.all([spotUsd('ETH'), spotUsd('SOL')]);
      const toMicros = (n: number | null): bigint | null => (n != null && Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) : null);
      const nativeUsdMicros = (chainId: string): bigint | null => {
        if (chainId.startsWith('solana:')) return toMicros(solUsd);
        // every EVM chain we offer except BNB/Polygon is ETH-native
        if (chainId === 'eip155:1' || chainId === 'eip155:10' || chainId === 'eip155:8453' || chainId === 'eip155:42161') return toMicros(ethUsd);
        return null; // BNB/Polygon native isn't in the ETH/SOL feed → deBridge uses its conservative floor
      };
      const providers = [lifi, makeDebridgeProvider({ nativeUsdMicros })];
      // Fan out to ALL providers; a provider that can't serve the route throws and is simply dropped
      // (fail-closed per provider). The deterministic core ranks the survivors by NET value and picks best.
      const settled = await Promise.allSettled(providers.map((p) => p.quote(req)));
      const quotes = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
      if (quotes.length === 0) {
        const firstErr = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
        throw firstErr?.reason instanceof Error ? firstErr.reason : new Error('No route from any provider');
      }
      const picked = bestCrossChainQuote(quotes);
      setQuote(picked.best);
      setRanked(picked.ranked);
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
      // acknowledgeHighValue is the USER's over-cap tick — NOT a hardcoded true. Over the $1,000 cap (or an
      // unpriced route) the deterministic guard blocks unless this is set, exactly like a chat mainnet send.
      const guard = { acknowledgeMainnet: true, acknowledgeHighValue: hvAck, ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}) };
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
  // Over the mainnet spend cap (or an unpriced route) a distinct high-value ack is required — the same tier-2
  // gate the deterministic guard enforces. The button stays disabled until it's ticked, and even if it
  // weren't, executeCrossChainSwap* would throw (guard fail-closed) — belt and suspenders.
  const valueUsdView = quote && quote.toValueMicros !== null ? Number(quote.toValueMicros) / 1e6 : undefined;
  const overCap = valueUsdView === undefined || valueUsdView > MAINNET_SPEND_CAP_USD;
  const canExecute = (eco === 'evm' || eco === 'solana') && ack && (!overCap || hvAck) && !executing && !result;

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
            {ranked.length > 1 && (
              <span className="muted" style={{ borderTop: '1px solid var(--border, rgba(0,0,0,.08))', paddingTop: 6 }}>
                compared {ranked.length} aggregators:{' '}
                {ranked.map((r, i) => (
                  <span key={r.quote.providerId}>
                    {i > 0 ? ' · ' : ''}
                    {r.quote.providerId === quote.providerId ? '🏆 ' : ''}
                    <b>{r.quote.providerId}</b> {fmtBase(r.quote.toAmountBase, r.quote.toDecimals)} {r.quote.toTokenSymbol}
                    {r.rejected ? ` (${r.rejected})` : ''}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        {quote && !result && (
          <>
            <label className="brg-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                ⚠️ This moves <b>REAL mainnet funds</b> across chains and is <b>irreversible</b>. The route transaction is built by <b>{quote?.providerId ?? 'the aggregator'}</b> and signed on your device (non-custodial); the guard enforces the spend cap but can't inspect the full route. I've reviewed the quote above and trust this route.
              </span>
            </label>
            {overCap && (
              <label className="brg-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={hvAck} onChange={(e) => setHvAck(e.target.checked)} />
                <span>
                  {valueUsdView === undefined
                    ? `This route is unpriced — I confirm swapping anyway, treated as a high-value transaction over the $${MAINNET_SPEND_CAP_USD.toLocaleString('en-US')} cap.`
                    : `This swap is ≈ $${valueUsdView.toLocaleString('en-US', { maximumFractionDigits: 2 })}, over the $${MAINNET_SPEND_CAP_USD.toLocaleString('en-US')} mainnet spend cap — I understand and want to proceed.`}
                </span>
              </label>
            )}
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
