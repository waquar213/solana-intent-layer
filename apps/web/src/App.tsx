import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { track } from '@vercel/analytics';
import { CrossChainSwapView } from './crosschain-ui';
import { makeLifiProvider, bestCrossChainQuote, type CrossChainSwapQuote } from '@intent-wallet/providers';
import {
  apiHealthy,
  authorizeIntent,
  fetchBalances,
  fetchActivity,
  getInsights,
  isSessionExpired,
  planIntent,
  resolveEnsName,
  type BalancesDto,
  type HistoryItem,
} from './api';
import {
  accountCount,
  accountEvmAddress,
  activeAccountIndex,
  activeImportedKind,
  addAccount,
  importPrivateKey,
  importSolanaKey,
  exportPrivateKey,
  listImportedAccounts,
  createWallet,
  currentIdentity,
  evmAddress,
  hasWallet,
  importWallet,
  isActiveImported,
  isUnlocked,
  lock,
  needsBackup,
  revealMnemonic,
  setNeedsBackup,
  setActiveAccount,
  signEvmTransaction,
  touch,
  unlock,
  verifyPassword,
  wipeWallet,
  type Eip1559Transaction,
  type WalletIdentity,
} from './wallet';
import {
  DEFAULT_BTC_TESTNET_REST,
  DEFAULT_DEVNET_RPC,
  DEFAULT_GIWA_RPC,
  DEFAULT_SEPOLIA_RPC,
  assessSessionDrain,
  balanceForAsset,
  btcTestnetAddress,
  cancelStuckTx,
  checkStuckTx,
  decimalToBase,
  baseToDecimal,
  DEFAULT_ETHEREUM_RPC,
  executeTransferStep,
  getBtcTestnetBalance,
  getErc20Balance,
  getEvmTestnetBalance,
  getSolTestnetBalance,
  isExecutableAsset,
  isSwappablePair,
  isSolammPair,
  quoteSwap,
  executeIntentOnGiwa,
  bridgeEthToGiwa,
  bridgeQuote,
  bridgeDeposit,
  findBridgeRelease,
  findBridgeCredit,
  bridgeChainBalanceBase,
  bridgeRouteDeliverable,
  BRIDGE_CHAINS,
  BRIDGE_FEE_BPS,
  type BridgeQuote,
  swapEthForGusdcOnGiwa,
  swapGusdcForEthOnGiwa,
  swapThenSend,
  swapSendVenue,
  SwapSendPartialError,
  type SwapSendVenue,
  type SwapAndSendResult,
  stakeEvm,
  stakeSol,
  canStakeOn,
  canStakeSol,
  quoteGiwaSwap,
  quoteGiwaSwapTokenForEth,
  swapSolForDusdc,
  swapDusdcForSol,
  solDusdcBalanceBase,
  SOLAMM_DECIMALS,
  executeCrossChainSwapSolana,
  quoteSolammBuy,
  quoteSolammSell,
  GIWA_INTENT_EXECUTOR,
  GIWA_AMM,
  readErc20Allowance,
  sendBtcTransfer,
  sendErc20Transfer,
  sendEvmTransfer,
  sendRevokeApproval,
  sendSolTransfer,
  sendSplTransfer,
  sendSwap,
  splToken,
  tokenInfo,
  type EvmSendResult,
  type SwapQuote,
} from './broadcast';
import { guardBroadcast, isValidBtcAddress, type ChainId } from '@intent-wallet/chains';
import { parseBridgeUtterance, looksLikeInjection, looksNegatedOrDeferred, type BridgeRoute } from '@intent-wallet/intents';
import { fetchLiveBalances, spotUsd, type AssetLive, type LiveBalances } from './balances';
import { addContact, classify, listContacts, removeContact, resolveContact, substituteContacts, type Contact } from './contacts';
import { knownGoodAddresses, recordRecipient, isNewRecipient } from './recents';
import { assessRecipientLive, type RecipientAssessment } from './poison';
import { AUTO_LOCK_OPTIONS, getSettings, setAutoLockMinutes, getTxMode, setTxMode, getAutoCaps, setAutoCaps, autoSpentTodayUsd, autoDecision, recordAutoSpendUsd, getNetworkMode, setNetworkMode, type TxMode, type NetworkMode } from './settings';
import { currentSession, signIn, signOut, signOutEverywhere, type Session } from './auth';

type SendChain = 'sepolia' | 'giwa-sepolia' | 'solana-devnet' | 'bitcoin-testnet';

/** The assets sendable on each testnet — native + known tokens (real send funcs exist). */
type SendAsset = { symbol: string; kind: 'native' | 'erc20' | 'spl'; decimals: number };
const ASSETS_FOR: Record<SendChain, SendAsset[]> = {
  sepolia: [
    { symbol: 'ETH', kind: 'native', decimals: 18 },
    { symbol: 'USDC', kind: 'erc20', decimals: 6 },
  ],
  // GIWA Sepolia (Upbit's OP Stack L2): native ETH is wired via the same generic EVM
  // send path as Sepolia. ERC-20/swap maps are Sepolia-only for now, so ETH only here.
  'giwa-sepolia': [{ symbol: 'ETH', kind: 'native', decimals: 18 }],
  'solana-devnet': [
    { symbol: 'SOL', kind: 'native', decimals: 9 },
    { symbol: 'USDC', kind: 'spl', decimals: 6 },
  ],
  'bitcoin-testnet': [{ symbol: 'tBTC', kind: 'native', decimals: 8 }],
};
const nativeAssetOf = (c: SendChain): SendAsset => ASSETS_FOR[c][0] as SendAsset;
import type {
  AllocationSlice,
  ConfirmationRequirement,
  ExecutionPlan,
  ExecutionStatus,
  Gate,
  InsightItem,
  Outcome,
  Permission,
  PlanResponse,
  PortfolioInsights,
  RiskLevel,
} from './types';

// Natural-language prompts the demo wallet (2 ETH + 5,000 USDC) actually handles.
const EXAMPLES: Array<{ label: string; prompt: string; icon: string }> = [
  // Solana is the HOME chain — lead with Solana intents (all plan: Send SOL, SOL↔USDC swaps via the
  // on-chain DEX). EVM examples follow for the cross-chain/stake flows Solana doesn't cover yet.
  { icon: '💸', label: 'Send 0.05 SOL', prompt: 'Send 0.05 SOL to So11111111111111111111111111111111111111112' },
  { icon: '🔄', label: 'Swap 2 SOL for USDC', prompt: 'Swap 2 SOL for USDC' },
  { icon: '🔄', label: 'Swap 100 USDC for SOL', prompt: 'Swap 100 USDC for SOL' },
  { icon: '🌉', label: 'Bridge 0.01 ETH to GIWA', prompt: 'Bridge 0.01 ETH to GIWA' },
  { icon: '🔒', label: 'Stake 0.001 ETH', prompt: 'Stake 0.001 ETH' },
];

// Every chain the planner can name in a plan MUST be here. The testnets were missing, so the plan
// read "Parsed as a swap on eip155:91342" instead of "on GIWA Sepolia" — it disclosed its
// settlement chain correctly, but in a form nobody reads. That hid a real mismatch: someone who
// asked to swap on Sepolia could not tell, from a raw chain id, that GIWA had been chosen instead.
const CHAIN_NAMES: Record<string, string> = {
  'eip155:1': 'Ethereum',
  'eip155:137': 'Polygon',
  'eip155:10': 'Optimism',
  'eip155:42161': 'Arbitrum',
  'eip155:8453': 'Base',
  'eip155:91342': 'GIWA Sepolia',
  'eip155:11155111': 'Ethereum Sepolia',
  'bip122:bitcoin': 'Bitcoin',
  'bip122:testnet': 'Bitcoin testnet',
  'solana:mainnet': 'Solana',
  'solana:devnet': 'Solana devnet',
};
const chainName = (id: string): string => CHAIN_NAMES[id] ?? id;
// This build SETTLES every step on testnet (see getNetworkMode). The planner's steps still carry
// mainnet chain ids for ETH/SOL/BTC, so name each step by the testnet it ACTUALLY settles on —
// otherwise the route graph and the Stage-0 fallback read "Ethereum"/"Solana"/"Bitcoin" while the
// receipt says "GIWA Sepolia"/"Solana devnet"/"Bitcoin testnet". Mirrors the Stage-0 resolution.
const SETTLED_TESTNET_NAMES: Record<string, string> = {
  'eip155:1': 'GIWA Sepolia',
  'eip155:137': 'GIWA Sepolia',
  'eip155:10': 'GIWA Sepolia',
  'eip155:42161': 'GIWA Sepolia',
  'eip155:8453': 'GIWA Sepolia',
  'solana:mainnet': 'Solana devnet',
  'bip122:bitcoin': 'Bitcoin testnet',
};
const chainNameSettled = (id: string): string =>
  // On MAINNET mode a Solana route settles on Solana MAINNET (the aggregator swap) — not the devnet the
  // testnet build assumes. Every other id keeps the settled-testnet name.
  id === 'solana:mainnet' && getNetworkMode() === 'mainnet' ? 'Solana' : (SETTLED_TESTNET_NAMES[id] ?? CHAIN_NAMES[id] ?? id);
// A native-asset TRANSFER settles PER-ASSET (mirrors executableTransfer), not by the planner's
// blanket eip155:1 home chain: native ETH → GIWA Sepolia (through the IntentExecutor), but an ERC-20
// (USDC/USDT/DAI) stays on Ethereum Sepolia, SOL → devnet, BTC → testnet. chainNameSettled alone
// mislabels a USDC transfer as GIWA — its eip155:1 → GIWA map is only correct for native ETH.
const transferSettlementLabel = (asset: string | undefined): string => {
  const a = (asset ?? '').toUpperCase();
  if (a === 'SOL') return getNetworkMode() === 'mainnet' ? 'Solana' : 'Solana devnet'; // native SOL sends on mainnet in Mainnet mode
  if (a === 'BTC') return 'Bitcoin testnet';
  if (a === 'ETH') return GIWA_INTENT_EXECUTOR ? 'GIWA Sepolia' : 'Ethereum Sepolia';
  return 'Ethereum Sepolia'; // ERC-20 transfers broadcast on Ethereum Sepolia (no GIWA token map yet)
};
// A STAKE settles where the staking contract is configured (mirrors executableStake): ETH prefers
// GIWA, else Sepolia; SOL → devnet. The planner's step carries eip155:1, so the static map alone
// would say "GIWA Sepolia" even in a Sepolia-only staking deploy — disagreeing with the receipt.
const stakeSettlementLabel = (asset: string | undefined): string => {
  const a = (asset ?? '').toUpperCase();
  if (a === 'SOL') return 'Solana devnet';
  if (a === 'ETH') return canStakeOn('giwa-sepolia') ? 'GIWA Sepolia' : canStakeOn('sepolia') ? 'Ethereum Sepolia' : 'GIWA Sepolia';
  return chainNameSettled('eip155:1');
};
const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// The cumulative session-drain ledger — outflow this session keyed by ACCOUNT:chain:asset. MODULE
// scope so the Send sheet AND the AI-chat PlanFlow share ONE total: a drain split across both, or
// run entirely through Auto-mode chat sends, is caught. Cleared on lock (a new session). Keyed by
// active account so one account's sends never count against another's balance.
const SESSION_OUTFLOW = new Map<string, bigint>();
const outflowKey = (chain: string, asset: string): string => {
  // Normalize the Bitcoin display symbol so the Send sheet ('tBTC') and the AI-chat PlanFlow ('BTC',
  // upper-cased in executableTransfer) feed ONE bucket. Otherwise a drain split across the two surfaces
  // keys two distinct entries and evades the cumulative-drain block — the exact cross-surface case this
  // shared ledger exists to catch. Other symbols are already canonical uppercase on both surfaces, so the
  // upper-case is a harmless no-op there that also guards against future casing drift. `chain` keeps
  // same-symbol assets on different chains (USDC on sepolia vs solana-devnet) correctly distinct.
  const a = asset.toUpperCase() === 'TBTC' ? 'BTC' : asset.toUpperCase();
  return `${activeAccountIndex()}:${chain}:${a}`;
};
const priorOutflow = (chain: string, asset: string): bigint => SESSION_OUTFLOW.get(outflowKey(chain, asset)) ?? 0n;
const recordOutflow = (chain: string, asset: string, base: bigint): void => {
  const k = outflowKey(chain, asset);
  SESSION_OUTFLOW.set(k, (SESSION_OUTFLOW.get(k) ?? 0n) + base);
};

// A plan may only AUTO-execute if Auto mode was active when it was CREATED — not merely active now.
// Otherwise switching to Auto (which unmounts+remounts the AI section) would retroactively auto-fire
// EVERY un-authorized plan still in the transcript at once. Recorded at submit, keyed by the stable
// planId (survives remounts), cleared on lock.
const PLAN_AUTO_ARMED = new Set<string>();
// Same arming discipline for chat BRIDGES (keyed by flowKey). A bridge signs its L1 deposit LOCALLY
// (no authorize/session gate to stop it), so without this a Manual-created bridge left un-clicked
// would auto-fire a real, irreversible deposit the moment the user switched to Auto (which remounts
// the AI section). Armed at submit only when Auto is active; cleared on lock.
const BRIDGE_AUTO_ARMED = new Set<string>();

/** Native-token decimals in ONE place. Used as the fallback when a token-entry lookup misses, so the
 *  SOL=9 / BTC=8 / ETH=18 facts aren't re-encoded as drift-prone inline ternaries — a past divergence
 *  of exactly this kind silently no-op'd the chat drain guard for 6-dp tokens. */
const NATIVE_DECIMALS: Record<string, number> = { ETH: 18, SOL: 9, BTC: 8 };

const usd = (micros: string | null | undefined): string => {
  if (micros == null) return '—';
  const v = Number(micros) / 1_000_000;
  // A tiny-but-nonzero cost (e.g. a $0.003 testnet fee) rounds to "$0" and reads as free — surface it as
  // "<$0.01" so a real cost is never indistinguishable from a genuinely-zero one.
  if (v > 0 && v < 0.005) return '<$0.01';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const RISK: Record<RiskLevel, { label: string; cls: string }> = {
  low: { label: 'Low risk', cls: 'risk-low' },
  medium: { label: 'Caution', cls: 'risk-medium' },
  high: { label: 'High risk', cls: 'risk-high' },
  block: { label: 'Blocked', cls: 'risk-block' },
};

function RiskBadge({ level }: { level: RiskLevel }): JSX.Element {
  const r = RISK[level];
  return <span className={`badge ${r.cls}`}>{r.label}</span>;
}

const GATE_LABEL: Record<Gate, string> = {
  allow: 'Authorized',
  require_confirmation: 'Needs step-up',
  defer: 'Deferred',
  escalate: 'Escalated for review',
  block: 'Blocked by policy',
};

function requirementLabel(r: ConfirmationRequirement): string {
  switch (r.kind) {
    case 'biometric':
      return 'Biometric';
    case 'device_pin':
      return 'Device PIN';
    case 'passkey':
      return 'Passkey';
    case 'second_approver':
      return `Second approver${r.role ? ` (${r.role})` : ''}`;
    case 'waiting_period':
      return `Waiting period${r.seconds ? ` (${r.seconds}s)` : ''}`;
    case 'guardian_quorum':
      return `Guardian quorum${r.m && r.n ? ` (${r.m}/${r.n})` : ''}`;
  }
}

// ── Universal identity: one seed, one HOME chain ─────────────────────────────
// `source` = which WalletIdentity field the row READS its address+path from
// ('evm' | 'btc' | 'sol'). `key` = the row's stable React/display id, decoupled
// from `source` so a row can DISPLAY as one chain while READING another's address.
// Solana is the wallet's HOME chain: the home row sets source:'sol' and reads the
// REAL id.sol.address — never a fabricated one. GIWA is an OP-Stack L2 whose address
// IS the user's EVM/L1 keypair, so its row reads id.evm.address; the standalone
// "Ethereum & EVM" row is FOLDED INTO the GIWA row (via `sub`) so the shared address
// is printed exactly once, not duplicated as two identical monospace strings.
type IdSource = 'evm' | 'btc' | 'sol';
type IdChain = {
  key: string; // stable React key + display identity (may differ from source)
  source: IdSource; // WalletIdentity field the address + path are read from
  label: string;
  net: string; // one-line network descriptor rendered under the name
  icon: string; // text glyph / monogram (no asset files)
  home?: boolean; // marks the primary Solana home row -> hero styling + Home badge
  sub?: string; // honest shared-address footnote (home row only)
};
const ID_CHAINS: IdChain[] = [
  {
    key: 'sol',
    source: 'sol', // Solana is the wallet's HOME chain -> reads the real id.sol.address
    label: 'Solana',
    net: 'mainnet', // the row renderer overrides this to 'devnet' in testnet mode
    icon: '◎',
    home: true,
  },
  {
    key: 'giwa',
    source: 'evm', // OP-Stack L2 shares the EVM keypair -> reads id.evm.address
    label: 'GIWA',
    net: 'Sepolia · OP-Stack L2',
    icon: 'G',
    sub: 'Same address as your Ethereum · EVM L1 key',
  },
  { key: 'btc', source: 'btc', label: 'Bitcoin', net: 'native SegWit', icon: '₿' },
];
const shortAddr = (a: string): string => (a.length > 18 ? `${a.slice(0, 9)}…${a.slice(-6)}` : a);

// ── The REAL non-custodial wallet (client-side; keys never leave the browser) ─
type WalletView = 'checking' | 'none' | 'create' | 'backup' | 'import' | 'locked' | 'unlocked';

function IdentityRows({ id, onCopy, copied }: { id: WalletIdentity; onCopy: (a: string) => void; copied: string | null }): JSX.Element {
  const testnet = useNetworkMode() !== 'mainnet';
  return (
    <div className="id-section">
      <p className="id-section-label">Networks</p>
      <div className="id-rows">
        {ID_CHAINS.map((c) => {
          // Address + network label HONOR the testnet/mainnet toggle. GIWA/EVM and Solana share
          // one address across networks (only the label changes); Bitcoin does NOT — testnet is a
          // distinct tb1q… address, so a testnet wallet must not surface the bc1q… mainnet address.
          let address = id[c.source].address;
          let net = c.net;
          if (c.key === 'btc' && testnet) {
            address = btcTestnetAddress() ?? address;
            net = 'testnet SegWit';
          } else if (c.key === 'sol') {
            net = testnet ? 'devnet' : 'mainnet';
          }
          // An imported single-curve account has no address on the other curves (core returns '') —
          // skip those rows rather than render a blank, copyable row that flashes a false "Copied ✓".
          if (!address) return null;
          const isCopied = copied === address;
          return (
            <button
              className={c.home ? 'id-row id-row--home' : 'id-row'}
              key={c.key}
              onClick={() => onCopy(address)}
              title={`${address}\n${id[c.source].path}`}
            >
              <span className={c.home ? 'id-icon id-icon--home' : 'id-icon'} aria-hidden="true">
                {c.icon}
              </span>
              <span className="id-chain">
                <span className="id-chain-head">
                  <span className="id-chain-name">{c.label}</span>
                  {c.home && <span className="id-home-badge">Home</span>}
                </span>
                <span className="id-chain-net">{net}</span>
                {c.sub && <span className="id-chain-sub">{c.sub}</span>}
              </span>
              <span className="id-addr">{isCopied ? 'Copied ✓' : shortAddr(address)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SIWE session control — the client half of non-custodial auth. "Sign in" asks the
 * server for a challenge, signs it in-browser with the wallet's EVM key (no tx, no
 * fee, key never leaves the device), and stores the returned JWT. Once signed in,
 * every SDK request carries that token (see api.ts). This proves the wallet's key is
 * ALSO its identity to the backend.
 */
function SessionBar(): JSX.Element {
  const walletKey = useWalletKey(); // re-render on unlock / HD-account switch
  const [session, setSession] = useState<Session | null>(currentSession());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-read the raw session when the active account changes, and only treat it as valid for the
  // ACTIVE account — a session that signed in as a different account is NOT this account's session
  // (prevents showing "Signed in 0x…other" and authorizing under the wrong principal).
  useEffect(() => setSession(currentSession()), [walletKey]);
  const active = evmAddress();
  const effective = session && active && session.address.toLowerCase() === active.toLowerCase() ? session : null;

  const doSignIn = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      setSession(await signIn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = (): void => {
    void signOut(); // best-effort server revoke; clear locally right away
    setSession(null);
  };
  const doSignOutEverywhere = (): void => {
    void signOutEverywhere();
    setSession(null);
  };

  if (effective) {
    return (
      <div className="wl-session">
        <span className="wl-session-badge">🔓 Signed in</span>
        <code className="wl-session-addr">{shortAddr(effective.address)}</code>
        <button className="wl-link" onClick={doSignOut}>
          Sign out
        </button>
        <button className="wl-link wl-session-hint" onClick={doSignOutEverywhere} title="Invalidate every session for this wallet">
          everywhere
        </button>
      </div>
    );
  }
  return (
    <div className="wl-session">
      <button className="wl-link" onClick={() => void doSignIn()} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in with your wallet →'}
      </button>
      <span className="wl-session-hint">authenticate the backend session (no gas, key stays on device)</span>
      {err && <span className="wl-err" role="alert">{err}</span>}
    </div>
  );
}

/** A QR code for `value`, generated entirely in-browser (no external service). */
function QR({ value }: { value: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Load the QR encoder lazily so its ~tens-of-KB stay OUT of the initial bundle — only the
    // Receive view needs it, and most sessions never open it.
    void (async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        const url = await QRCode.toDataURL(value, { margin: 1, width: 176, errorCorrectionLevel: 'M' });
        if (alive) setSrc(url);
      } catch {
        if (alive) setSrc(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value]);
  return src ? (
    <img className="qr-img" src={src} alt="receive address QR code" width={176} height={176} />
  ) : (
    <div className="qr-img qr-loading" />
  );
}

type ReceiveChain = 'giwa' | 'evm' | 'sol' | 'btc';
const RECEIVE_META: Record<ReceiveChain, { label: string; icon: string; net: string }> = {
  // GIWA is an OP-Stack L2 — the SAME EVM address as Ethereum, so this receives GIWA Sepolia ETH.
  giwa: { label: 'GIWA · Sepolia', icon: '◆', net: 'GIWA Sepolia testnet' },
  evm: { label: 'Ethereum · Sepolia', icon: '⟠', net: 'Sepolia testnet' },
  sol: { label: 'Solana · devnet', icon: '◎', net: 'Solana devnet' },
  btc: { label: 'Bitcoin · testnet', icon: '₿', net: 'Bitcoin testnet' },
};

/**
 * Shared modal-dialog behaviour for every `.rcv-overlay` modal, to WCAG AA: focus
 * moves into the dialog on open, Tab is trapped inside it, Esc closes it, and focus
 * returns to whatever opened it on close. `label` becomes the dialog's accessible
 * name. Attach the returned ref to the `.rcv-modal` element.
 */
function useDialog(onClose: () => void, label: string, enabled = true): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  // Read onClose via a ref so the focus-trap effect does NOT re-run when the parent re-renders and
  // hands us a fresh onClose identity (it does every ~5s via the health poll) — a re-run would steal
  // focus back to the first control and drop the keystroke a user was typing in a modal field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!enabled) return; // embedded (inline, non-overlay) render: no focus trap / Esc / focus-steal
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node && label) node.setAttribute('aria-label', label);
    const focusables = (): HTMLElement[] =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      // If focus has ESCAPED the dialog — e.g. the focused control unmounted after an in-modal
      // transition (Review →, Sign & execute) and the browser moved focus to <body> — pull it back in.
      // Otherwise the next Tab walks into the background shell behind the overlay, defeating the trap on
      // the money path.
      if (!items.some((el) => el === document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [label, enabled]);
  return ref;
}

/** A consistent back control shown top-left of every overlay/sheet so the user can
 *  always step back one level (mirrors Esc / tap-outside, but always visible). */
function ModalBack({ onClick, label = 'Back' }: { onClick: () => void; label?: string }): JSX.Element {
  return (
    <button className="modal-back" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}

/**
 * Receive modal — the addresses you fund the wallet at, one per chain, each with a
 * scannable QR. Addresses are the wallet's own (public, non-sensitive). BTC shows
 * the testnet `tb1q…` address the wallet actually spends from, so a testnet faucet
 * lands where the Send panel can use it.
 */
/** Local wallet settings — currently the idle auto-lock timeout. */
function SettingsModal({ onClose, embedded }: { onClose: () => void; embedded?: boolean }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Settings', !embedded);
  const [minutes, setMinutes] = useState<number>(() => getSettings().autoLockMinutes);
  const [txMode, setTxModeState] = useState<TxMode>(() => getTxMode());
  const caps0 = getAutoCaps();
  const [perTx, setPerTx] = useState(String(caps0.perTxUsd));
  const [daily, setDaily] = useState(String(caps0.dailyUsd));
  const [netMode, setNetModeState] = useState<NetworkMode>(() => getNetworkMode());
  const choose = (m: number): void => {
    setMinutes(m);
    setAutoLockMinutes(m);
  };
  const chooseMode = (m: TxMode): void => {
    setTxModeState(m);
    setTxMode(m);
    // Switching to Manual must not leave a pending armed auto plan/bridge that a later phase change
    // could still fire — disarm them (the run effects also guard live tx-mode; this makes the intent
    // explicit, mirroring switchAccount's disarm).
    if (m === 'manual') {
      PLAN_AUTO_ARMED.clear();
      BRIDGE_AUTO_ARMED.clear();
      PLAN_AUTO_TRIED.clear();
      BRIDGE_AUTO_TRIED.clear();
    }
  };
  const chooseNet = (m: NetworkMode): void => {
    setNetModeState(m);
    setNetworkMode(m);
  };
  // Mainnet is ENABLED (real funds, ADR-0055): the stored mode is honored on load — no forced reset. The
  // per-broadcast guard (mainnet-ack + spend cap) is what protects real funds, not a network-mode lock.
  const saveCaps = (): void => {
    const p = Number(perTx);
    const d = Number(daily);
    if (Number.isFinite(p) && Number.isFinite(d) && p > 0 && d > 0) {
      setAutoCaps(p, d);
      const a = getAutoCaps();
      setPerTx(String(a.perTxUsd));
      setDaily(String(a.dailyUsd));
    }
  };
  const body = (
    <div className="set-rows">
      {/* Network — Testnet (free) vs Mainnet (real funds; every send is guard-confirmed) */}
      <div className="set-row">
        <div className="set-row-text">
          <span className="set-row-title">Network</span>
          <span className="set-row-sub">Testnet uses free coins. <b>Mainnet moves REAL funds</b> — every send is guard-confirmed (mainnet acknowledgment + $1,000 spend cap).</span>
        </div>
        <div className="wl-asset-tabs set-control">
          {(['testnet', 'mainnet'] as NetworkMode[]).map((m) => (
            <button
              key={m}
              className={`wl-asset-tab ${netMode === m ? 'active' : ''}`}
              onClick={() => chooseNet(m)}
              aria-pressed={netMode === m}
              title={m === 'mainnet' ? 'Mainnet moves REAL funds — every transaction is guard-confirmed' : undefined}
            >
              {m === 'testnet' ? 'Testnet' : '🔴 Mainnet'}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction mode — Manual (confirm each) vs Auto (sign within caps, no per-tx confirm) */}
      <div className="set-row">
        <div className="set-row-text">
          <span className="set-row-title">Transaction mode</span>
          <span className="set-row-sub">Manual confirms every tx · Auto signs within your caps (risk-blocked never auto-runs)</span>
        </div>
        <div className="wl-asset-tabs set-control">
          {(['manual', 'auto'] as TxMode[]).map((m) => (
            <button key={m} className={`wl-asset-tab ${txMode === m ? 'active' : ''}`} onClick={() => chooseMode(m)} aria-pressed={txMode === m}>
              {m === 'manual' ? 'Manual' : '⚡ Auto'}
            </button>
          ))}
        </div>
      </div>

      {txMode === 'auto' && (
        <div className="set-row set-row-nested">
          <div className="set-row-text">
            <span className="set-row-title">Auto-mode caps (USD)</span>
            <span className="set-row-sub">Spent today: ${autoSpentTodayUsd().toLocaleString('en-US', { maximumFractionDigits: 2 })} / ${getAutoCaps().dailyUsd}</span>
          </div>
          <div className="set-caps set-control">
            <label className="set-cap">
              Per-tx
              <input className="wl-input" inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} onBlur={saveCaps} />
            </label>
            <label className="set-cap">
              Daily
              <input className="wl-input" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} onBlur={saveCaps} />
            </label>
          </div>
        </div>
      )}

      {/* Auto-lock — idle timeout that wipes keys from memory */}
      <div className="set-row">
        <div className="set-row-text">
          <span className="set-row-title">Auto-lock</span>
          <span className="set-row-sub">Locks after idle · keys wiped from memory (encrypted vault stays on device)</span>
        </div>
        <div className="wl-asset-tabs set-control">
          {AUTO_LOCK_OPTIONS.map((m) => (
            <button key={m} className={`wl-asset-tab ${minutes === m ? 'active' : ''}`} onClick={() => choose(m)} aria-pressed={minutes === m}>
              {m === 0 ? 'Never' : `${m}m`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  // Embedded: rendered inline inside the Settings section as a plain card (no overlay).
  if (embedded) return <div className="card sect-card">{body}</div>;
  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        <p className="wipe-h">Settings</p>
        {body}
        <div className="wl-actions">
          <button
            className="wl-link"
            onClick={() => {
              saveCaps();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** The address book: save named recipients (any chain) to send to by name in the Send panel. */
function ContactsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Address book');
  const [contacts, setContacts] = useState<Contact[]>(() => listContacts());
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const add = (): void => {
    setErr(null);
    try {
      setContacts(addContact(name, address));
      setName('');
      setAddress('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add contact');
    }
  };

  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        <p className="wipe-h">Address book</p>
        <p className="wipe-lead">Save a name for an address, then send to it by name in the Send panel (just type “alice”).</p>
        <label className="wl-flabel">Name</label>
        <input className="wl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="alice" spellCheck={false} aria-label="Contact name" />
        <label className="wl-flabel">Address</label>
        <input
          className="wl-input"
          aria-label="Contact address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… / bc1… / Solana address"
          spellCheck={false}
        />
        {err && <p className="wl-err" role="alert">{err}</p>}
        <div className="wl-actions">
          <button className="btn primary" onClick={add} disabled={!name.trim() || !address.trim()}>
            Save contact
          </button>
        </div>
        {contacts.length > 0 && (
          <ul className="wl-activity">
            {contacts.map((c) => (
              <li className="wl-act-row" key={c.address}>
                <b>{c.name}</b>
                <span className="wl-act-amt">
                  {c.address.slice(0, 10)}…{c.address.slice(-6)}
                </span>
                <span className="wl-act-time">{c.kind}</span>
                <button className="wl-link wl-danger" onClick={() => setContacts(removeContact(c.address))}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="wl-actions">
          <button className="wl-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Un-stick a pending EVM transaction: detect a stuck nonce, then cancel it by replacing
 *  that nonce with a bumped-fee 0-ETH self-send. */
function RecoverTxModal({ onClose }: { onClose: () => void }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Recover a stuck transaction');
  // Default to GIWA — the wallet's DEFAULT send chain, so a stuck GIWA send is what a user most
  // likely came to clear. Sepolia (L1) is one toggle away. (Was Sepolia-locked: a stuck GIWA tx
  // could never be recovered, and a Sepolia-chainId cancel would be invalid on GIWA anyway.)
  const [chain, setChain] = useState<'giwa-sepolia' | 'sepolia'>('giwa-sepolia');
  const [status, setStatus] = useState<{ pending: number; stuckNonce: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<EvmSendResult | null>(null);
  const rpc = chain === 'giwa-sepolia' ? DEFAULT_GIWA_RPC : DEFAULT_SEPOLIA_RPC;
  const chainLabel = chain === 'giwa-sepolia' ? 'GIWA Sepolia' : 'Ethereum Sepolia';
  const cancelInFlightRef = useRef(false); // synchronous latch — `busy` alone can't stop a double-click

  useEffect(() => {
    let live = true;
    setStatus(null); // re-check the newly selected chain from scratch
    setResult(null);
    setErr(null);
    void checkStuckTx({ rpcUrl: rpc })
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch((e: unknown) => {
        if (live) setErr(e instanceof Error ? e.message : 'Could not check pending transactions');
      });
    return () => {
      live = false;
    };
  }, [rpc]);

  const cancel = async (): Promise<void> => {
    if (cancelInFlightRef.current) return; // a cancel is already in flight — ignore the double-click
    cancelInFlightRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      setResult(await cancelStuckTx({ chain, rpcUrl: rpc }));
      setStatus({ pending: 0, stuckNonce: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
      cancelInFlightRef.current = false;
    }
  };

  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        <p className="wipe-h">Recover a stuck transaction</p>
        <p className="wipe-lead">
          If a send is stuck pending (gas too low), Cancel replaces it with a 0-ETH self-transfer at a higher fee — the
          standard un-stick. Pick the testnet your send is stuck on.
        </p>
        <div className="wl-chain-tabs" style={{ marginBottom: 10 }}>
          <button className={`wl-chain-tab${chain === 'giwa-sepolia' ? ' active' : ''}`} onClick={() => setChain('giwa-sepolia')} disabled={busy} aria-pressed={chain === 'giwa-sepolia'}>
            GIWA · Sepolia
          </button>
          <button className={`wl-chain-tab${chain === 'sepolia' ? ' active' : ''}`} onClick={() => setChain('sepolia')} disabled={busy} aria-pressed={chain === 'sepolia'}>
            Ethereum · Sepolia
          </button>
        </div>
        {status && status.stuckNonce === null && !result && (
          <p className="wl-ens-hint ok">✓ No pending transactions on {chainLabel} — nothing stuck</p>
        )}
        {status && status.stuckNonce !== null && (
          <p className="wl-ens-hint bad">
            ⚠️ {status.pending} pending on {chainLabel} — oldest stuck at nonce {status.stuckNonce}
          </p>
        )}
        {status === null && !err && <p className="wipe-lead">Checking pending transactions on {chainLabel}…</p>}
        {err && <p className="wl-err" role="alert">{err}</p>}
        {result && <p className="wl-ens-hint ok">✓ Cancel broadcast on {chainLabel} — tx {result.txid.slice(0, 14)}…</p>}
        <div className="wl-actions">
          <button className="btn primary" onClick={() => void cancel()} disabled={busy || !status || status.stuckNonce === null}>
            {busy ? 'Signing…' : 'Cancel oldest pending →'}
          </button>
          <button className="wl-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const CHAIN_BADGE: Record<HistoryItem['chain'], string> = {
  GIWA: 'GIWA',
  Sepolia: 'Sepolia',
  Solana: 'SOL',
  Bitcoin: 'BTC',
};

/** The wallet's recent activity across ALL its chains — GIWA, Ethereum Sepolia, Solana, Bitcoin. */
function ActivityModal({ address, onClose, embedded }: { address: string; onClose: () => void; embedded?: boolean }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Activity', !embedded);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const me = currentIdentity();
    void fetchActivity({ evm: address, sol: me?.sol.address ?? '', btc: btcTestnetAddress() ?? '' }).then((x) => {
      if (live) setItems(x);
    });
    return () => {
      live = false;
    };
  }, [address]);
  const body = (
    <>
        <p className="wipe-h">Activity — all chains</p>
        {items === null ? (
          <p className="wipe-lead">Loading recent transactions…</p>
        ) : items.length === 0 ? (
          <p className="wipe-lead">No transactions yet across GIWA, Sepolia, Solana or Bitcoin.</p>
        ) : (
          <ul className="wl-activity">
            {items.map((t) => (
              <li key={`${t.chain}-${t.hash}`} className="wl-act-row">
                <span className={`wl-act-chain c-${t.chain.toLowerCase()}`}>{CHAIN_BADGE[t.chain]}</span>
                <span className="wl-act-dir">{t.label}</span>
                <span className="wl-act-amt">{t.amount ?? ''}</span>
                <span className="wl-act-time">{t.timeStamp ? new Date(t.timeStamp * 1000).toLocaleDateString() : ''}</span>
                {t.failed && <span className="wl-act-fail">failed</span>}
                <a className="wl-act-link" href={t.explorerUrl} target="_blank" rel="noreferrer" aria-label="View transaction on block explorer (opens in new tab)">
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </>
  );
  if (embedded) return <div className="card sect-card">{body}</div>;
  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        {body}
        <div className="wl-actions">
          <button className="wl-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const CHAIN_LABEL: Record<string, string> = {
  'eip155:1': 'ethereum',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  polygon: 'polygon',
  'bip122:bitcoin': 'bitcoin',
  'solana:mainnet': 'solana',
};
const fmtUsd = (micros: string | null): string =>
  micros === null ? '—' : `$${(Number(micros) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Universal Portfolio — REAL holdings across Ethereum + L2s, Bitcoin and Solana for any
 *  public addresses, valued live. Pre-filled with the wallet's own EVM + SOL (both mainnet-
 *  valid); a mainnet BTC address can be entered to include Bitcoin. This is the read side of
 *  the "universal" promise — the on-chain truth, no fixture. */
const BTC_ADDR_KEY = 'iw.balances.btc'; // remember a pasted mainnet BTC address across opens

function UniversalBalancesModal({ id, onClose, embedded }: { id: WalletIdentity; onClose: () => void; embedded?: boolean }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Universal Portfolio', !embedded);
  const [evm, setEvm] = useState(id.evm.address);
  const [btc, setBtc] = useState(() => localStorage.getItem(BTC_ADDR_KEY) ?? '');
  const [sol, setSol] = useState(id.sol.address);
  const [data, setData] = useState<BalancesDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const addrs: { evm?: string; btc?: string; sol?: string } = {};
      if (evm.trim()) addrs.evm = evm.trim();
      if (btc.trim()) addrs.btc = btc.trim();
      if (sol.trim()) addrs.sol = sol.trim();
      // Persist the (mainnet) BTC address — the wallet's own BTC is testnet, so a user who
      // pastes one shouldn't have to re-type it next time.
      if (btc.trim()) localStorage.setItem(BTC_ADDR_KEY, btc.trim());
      else localStorage.removeItem(BTC_ADDR_KEY);
      setData(await fetchBalances(addrs));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-discover the wallet's real balances on open (the EVM + SOL addresses are pre-filled),
  // so the panel shows your portfolio at a glance instead of requiring a click. The ref guards
  // against React 18 StrictMode's double-invoke firing two lookups.
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <>
        <p className="wipe-h">Universal Portfolio</p>
        <p className="wipe-lead">
          Real holdings across Ethereum + L2s, Bitcoin, and Solana — valued live. Your addresses are loaded;
          add a mainnet Bitcoin address to include BTC.
        </p>
        <details className="ub-edit">
          <summary>Customize addresses</summary>
          <label className="wl-flabel">EVM address</label>
          <input className="wl-input wl-mono" value={evm} onChange={(e) => setEvm(e.target.value)} placeholder="0x…" spellCheck={false} aria-label="EVM address" />
          <label className="wl-flabel">Bitcoin address (mainnet)</label>
          <input className="wl-input wl-mono" value={btc} onChange={(e) => setBtc(e.target.value)} placeholder="bc1… / 1… / 3…" spellCheck={false} aria-label="Bitcoin address (mainnet)" />
          <label className="wl-flabel">Solana address</label>
          <input className="wl-input wl-mono" value={sol} onChange={(e) => setSol(e.target.value)} placeholder="Solana pubkey" spellCheck={false} aria-label="Solana address" />
        </details>
        <button className="wl-bal-go" disabled={loading} onClick={() => void load()}>
          {loading ? 'Discovering…' : data ? 'Refresh' : 'Discover balances'}
        </button>
        {err && (
          <p className="ub-note" role="alert">
            Couldn’t reach the balance service just now ({err}). Your funds are safe — try Refresh.
          </p>
        )}
        {data && (
          <div className="wl-bal-result">
            <p className="wl-bal-total">
              {/* If NOTHING held could be priced (e.g. a price-feed outage), the total is 0 despite real
                  holdings — show "—", never a misleading "$0.00", mirroring the dashboard's anyPrice guard. */}
              Total <b>{data.holdings.length > 0 && data.holdings.every((h) => h.valueMicros === null) ? '—' : fmtUsd(data.totalValueMicros)}</b>
            </p>
            {data.byEcosystem &&
              (() => {
                const parts = (
                  [
                    ['EVM', data.byEcosystem.evm],
                    ['Bitcoin', data.byEcosystem.bitcoin],
                    ['Solana', data.byEcosystem.solana],
                  ] as const
                )
                  .filter(([, m]) => BigInt(m) > 0n)
                  .map(([label, m]) => `${label} ${fmtUsd(m)}`);
                return parts.length > 1 ? <p className="wl-bal-split">{parts.join('  ·  ')}</p> : null;
              })()}
            {data.unavailable && data.unavailable.length > 0 && (
              <p className="wl-bal-warn">
                ⚠ {data.unavailable.join(' and ')} couldn’t be reached — the total excludes{' '}
                {data.unavailable.length > 1 ? 'them' : 'it'}.
              </p>
            )}
            {data.unpricedSymbols && data.unpricedSymbols.length > 0 && (
              <p className="wl-bal-warn">
                ⚠ {data.unpricedSymbols.join(', ')} couldn’t be priced — {data.unpricedSymbols.length > 1 ? 'they’re' : 'it’s'} excluded from the total.
              </p>
            )}
            {data.holdings.length === 0 ? (
              <p className="wipe-lead">No holdings found for these addresses.</p>
            ) : (
              <ul className="wl-bal-list">
                {data.holdings.map((h) => (
                  <li key={h.symbol} className="wl-bal-row">
                    <span className="wl-bal-sym">{h.symbol}</span>
                    {/* Truncate (never round up) to 6dp so a 0.9999999 holding isn't shown as
                        1.000000; toFixed(9) first normalizes float noise so a clean 0.29 stays 0.29.
                        The source is a lossy number, so this only guarantees the shown amount is
                        never ABOVE what is actually held (matches the round-3 balance-floor fix). */}
                    <span className="wl-bal-amt">
                      {(Math.floor(Number(Number(h.amount).toFixed(9)) * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </span>
                    <span className="wl-bal-val">{fmtUsd(h.valueMicros)}</span>
                    <span className="wl-bal-chains">{h.chains.map((c) => CHAIN_LABEL[c.chainId] ?? c.chainId).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </>
  );
  if (embedded) return <div className="card sect-card">{body}</div>;
  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        {body}
        <div className="wl-actions">
          <button className="wl-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Revoke a stale/over-broad ERC-20 approval: read the live allowance, then sign
 *  approve(spender, 0) in-browser. The high-value "discover all approvals" list needs a
 *  log-indexer (throttled on the free RPC tier); this manual path always works. */
function RevokeApprovalModal({ onClose }: { onClose: () => void }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Revoke a token approval');
  const [token, setToken] = useState('');
  const [spender, setSpender] = useState('');
  const [info, setInfo] = useState<{ allowance: bigint; unlimited: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<EvmSendResult | null>(null);
  const revokeInFlightRef = useRef(false); // synchronous latch — `busy` alone can't stop a double-click

  const isAddr = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/u.test(s.trim());
  const ready = isAddr(token) && isAddr(spender);

  const check = async (): Promise<void> => {
    setErr(null);
    setResult(null);
    setInfo(null);
    setBusy(true);
    try {
      setInfo(await readErc20Allowance({ token, spender }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read allowance');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (): Promise<void> => {
    if (revokeInFlightRef.current) return; // a revoke is already in flight — ignore the double-click
    revokeInFlightRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      setResult(await sendRevokeApproval({ token, spender }));
      // Do NOT optimistically claim the allowance is now 0 — the revoke is only BROADCAST here, not
      // mined, so asserting "✓ No allowance / protected" before it confirms is a false safety signal on
      // the one surface whose whole job is protecting funds (if it reverts or drops, the spender still
      // holds the allowance). Clear the stale reading; the result line says the clear is pending, and
      // the user can re-Check after it mines.
      setInfo(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(false);
      revokeInFlightRef.current = false;
    }
  };

  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        <p className="wipe-h">Revoke a token approval</p>
        <p className="wipe-lead">
          Paste an ERC-20 token contract + the spender you approved. We read the live allowance; Revoke sets it to
          zero so the spender can no longer move your tokens. Sepolia testnet.
        </p>
        <label className="wl-flabel">Token contract</label>
        <input
          className="wl-input"
          aria-label="Token contract address"
          value={token}
          // Editing either field invalidates the checked allowance — clear the verdict so a stale
          // "✓ No allowance" (or a prior "✓ Revoked") can't describe a DIFFERENT token/spender pair.
          onChange={(e) => {
            setToken(e.target.value);
            setInfo(null);
            setResult(null);
            setErr(null);
          }}
          placeholder="0x…"
          spellCheck={false}
        />
        <label className="wl-flabel">Spender</label>
        <input
          className="wl-input"
          value={spender}
          onChange={(e) => {
            setSpender(e.target.value);
            setInfo(null);
            setResult(null);
            setErr(null);
          }}
          placeholder="0x…"
          spellCheck={false}
        />
        {info && (
          <p className={`wl-ens-hint ${info.allowance === 0n ? 'ok' : 'bad'}`}>
            {info.allowance === 0n
              ? '✓ No allowance — nothing to revoke'
              : info.unlimited
                ? '⚠️ Unlimited allowance granted'
                : `Allowance: ${info.allowance.toString()} base units`}
          </p>
        )}
        {err && <p className="wl-err" role="alert">{err}</p>}
        {result && <p className="wl-ens-hint ok">✓ Revoke broadcast — allowance clears once it’s mined · tx {result.txid.slice(0, 14)}…</p>}
        <div className="wl-actions">
          <button className="btn" onClick={() => void check()} disabled={!ready || busy}>
            {busy ? '…' : 'Check allowance'}
          </button>
          <button className="btn primary" onClick={() => void revoke()} disabled={!ready || busy || info?.allowance === 0n || result != null}>
            {busy ? 'Signing…' : 'Revoke →'}
          </button>
          <button className="wl-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({ id, onClose }: { id: WalletIdentity; onClose: () => void }): JSX.Element {
  const dlgRef = useDialog(onClose, 'Receive');
  // An imported single-curve account only HOLDS one curve's address (core returns '' for the others),
  // so show ONLY the tabs it actually has and default to a populated one — otherwise Receive opens on
  // a blank address, a QR that never renders (QRCode.toDataURL('') rejects), and a copy that copies ''.
  const kind = isActiveImported() ? activeImportedKind() : null;
  const availTabs: ReceiveChain[] = kind === 'sol' ? ['sol'] : kind === 'evm' ? ['giwa', 'evm'] : ['giwa', 'evm', 'sol', 'btc'];
  const [tab, setTab] = useState<ReceiveChain>(availTabs[0] ?? 'giwa');
  const [copied, setCopied] = useState(false);
  const address = tab === 'evm' || tab === 'giwa' ? id.evm.address : tab === 'sol' ? id.sol.address : (btcTestnetAddress() ?? '');
  const meta = RECEIVE_META[tab];
  const copy = (): void => {
    if (!address) return; // nothing to copy — never flash "Copied ✓" for an absent address
    // Optional-chain the clipboard (undefined over plain http / non-secure contexts) + catch a reject
    // (document unfocused, permission denied) so a copy failure is silent-safe, not an uncaught throw.
    void navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* insecure context or denied — leave the button un-ticked rather than throw */
      });
  };
  return (
    <div className="rcv-overlay" onClick={onClose}>
      <div ref={dlgRef} className="rcv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ModalBack onClick={onClose} />
        <div className="rcv-head">
          <span className="rcv-title">Receive</span>
        </div>
        <div className="wl-chain-tabs">
          {availTabs.map((c) => (
            <button key={c} className={`wl-chain-tab${tab === c ? ' active' : ''}`} onClick={() => setTab(c)} aria-pressed={tab === c}>
              {RECEIVE_META[c].label}
            </button>
          ))}
        </div>
        <div className="rcv-body">
          {address ? (
            <>
              <QR value={address} />
              <p className="rcv-net">
                {meta.icon} {meta.label}
              </p>
              <code className="rcv-addr">{address}</code>
              <button className="btn primary rcv-copy" onClick={copy} aria-live="polite">
                {copied ? 'Copied ✓' : 'Copy address'}
              </button>
              <p className="rcv-note">Only send {meta.net} assets to this address.</p>
            </>
          ) : (
            <p className="rcv-note">This account has no {meta.label} receive address.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A compact stroke (Lucide-style) icon for the wallet action grid. */
function ActIcon({
  d,
  circle,
  circleAt,
  circleR,
}: {
  d: string[];
  circle?: boolean;
  circleAt?: [number, number];
  circleR?: number;
}): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {circle && <circle cx={12} cy={12} r={9} />}
      {circleAt && <circle cx={circleAt[0]} cy={circleAt[1]} r={circleR ?? 4} />}
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NAVIGATION SHELL — the app is organised into 5 destinations (mirrors the mobile
// app's IA), with profile/identity in a top-right Account menu. AuthGate is the
// pre-login screen; WalletShell is everything after unlock.
// ════════════════════════════════════════════════════════════════════════════
type Section = 'home' | 'ai' | 'bridge' | 'swap' | 'portfolio' | 'activity' | 'settings';

const NAV: Array<{ id: Section; label: string; d: string[] }> = [
  { id: 'home', label: 'Home', d: ['M3 10.5 12 3l9 7.5', 'M5 9.3V21h14V9.3'] },
  { id: 'ai', label: 'AI Chat', d: ['M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z'] },
  // Bridge: canonical Sepolia→GIWA (OP-Stack, always on) + operator-assisted same-realism routes
  // (incl. Solana ⇄ EVM), gated by VITE_BRIDGE_OPERATOR_ENABLED + the same-realism guard. Surfaced
  // now that the routes are honestly enabled (was hidden while only the one canonical route worked).
  { id: 'bridge', label: 'Bridge', d: ['M3 14h18', 'M6 14V8', 'M18 14V8', 'M3 14c0-4 4-6 9-6s9 2 9 6', 'M9 14v3', 'M15 14v3'] },
  // Cross-chain swap (mainnet aggregator): any token on chain A -> any token on chain B, best route.
  { id: 'swap', label: 'Swap', d: ['M7 10 3 6l4-4', 'M3 6h13a4 4 0 0 1 4 4', 'M17 14l4 4-4 4', 'M21 18H8a4 4 0 0 1-4-4'] },
  { id: 'portfolio', label: 'Portfolio', d: ['M12 2 2 7l10 5 10-5-10-5Z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'] },
  { id: 'activity', label: 'Activity', d: ['M22 12h-4l-3 9L9 3l-3 9H2'] },
  { id: 'settings', label: 'Settings', d: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'] },
];

/** Active identity + clipboard, polled from the wallet singleton (mirrors useWalletKey).
 *  `acct` re-derives on HD-account switch so section content can key off it. */
function useIdentity(): { id: WalletIdentity | null; copy: (a: string) => void; copied: string | null; acct: number; refresh: () => void } {
  const [id, setId] = useState<WalletIdentity | null>(() => currentIdentity());
  const [copied, setCopied] = useState<string | null>(null);
  const [acct, setAcct] = useState(() => activeAccountIndex());
  useEffect(() => {
    const t = setInterval(() => {
      setAcct((prev) => (prev === activeAccountIndex() ? prev : activeAccountIndex()));
      setId((prev) => {
        const next = currentIdentity();
        return prev?.evm.address === next?.evm.address ? prev : next;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);
  const copy = (a: string): void => {
    if (!a) return; // nothing to copy — never flash "Copied ✓" for an empty value
    // Only tick "Copied ✓" once the write ACTUALLY resolves. navigator.clipboard is undefined over plain
    // http / a non-secure LAN origin (the normal way you'd open this testnet wallet on a phone pointed at
    // a laptop), and writeText can reject (document unfocused / permission denied) — in either case the
    // old code still flashed success. This copy is bound to the PRIVATE-KEY export button + every receive
    // address, so a false "Copied ✓" makes a user paste an empty/stale value → key loss / funds to nowhere.
    void navigator.clipboard
      ?.writeText(a)
      .then(() => {
        setCopied(a);
        setTimeout(() => setCopied((c) => (c === a ? null : c)), 1200);
      })
      .catch(() => {
        /* insecure context or denied — leave the button un-ticked rather than falsely claim success */
      });
  };
  const refresh = (): void => {
    setId(currentIdentity());
    setAcct(activeAccountIndex());
  };
  return { id, copy, copied, acct, refresh };
}

/** The pre-login screen: create / import / unlock / back-up. Calls onEntered() the
 *  moment the wallet is truly usable — on unlock, import, or after the backup quiz
 *  (NEVER on create, which must show the write-it-down step first). */
function AuthGate({ onEntered, onView }: { onEntered: () => void; onView?: (v: WalletView) => void }): JSX.Element {
  const [view, setView] = useState<WalletView>('checking');
  useEffect(() => {
    onView?.(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [phrase, setPhrase] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Locked-screen "Forgot password?" → reset flow. A self-custodial vault has NO password
  // reset (the password IS the only key); the recovery path is to wipe + restore from phrase.
  const [forgot, setForgot] = useState(false);
  const [verifyIdx, setVerifyIdx] = useState<[number, number]>([2, 8]);
  const [verifyWords, setVerifyWords] = useState<{ a: string; b: string }>({ a: '', b: '' });

  useEffect(() => {
    if (isUnlocked()) {
      onEntered();
      return;
    }
    void hasWallet()
      .then((h) => {
        if (isUnlocked()) onEntered();
        else setView(h ? 'locked' : 'none');
      })
      // If the store read rejects (localStorage blocked/disabled, sandboxed/3rd-party context,
      // SecurityError), don't leave the app stuck forever on the blank "checking" card — fall to
      // onboarding so the user has a recoverable path.
      .catch(() => setView('none'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = (): void => {
    setPw('');
    setPw2('');
    setErr(null);
    setSaved(false);
    setForgot(false);
  };
  // Enter the write-it-down + word-verify backup step for a given phrase. Shared by create and by
  // unlock-with-pending-backup (a reload after create lands in `locked`, and must RESUME backup).
  const startBackup = (mnemonic: string): void => {
    setPhrase(mnemonic);
    const count = mnemonic.trim().split(/\s+/u).length;
    const a = Math.floor(Math.random() * count);
    let b = Math.floor(Math.random() * count);
    if (b === a) b = (b + 1) % count;
    setVerifyIdx([a, b]);
    setVerifyWords({ a: '', b: '' });
    reset();
    setView('backup');
  };
  const doCreate = async (): Promise<void> => {
    setErr(null);
    if (!pw.trim()) return setErr('Enter a password.'); // reject all-whitespace, not just short
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      const { mnemonic } = await createWallet(pw);
      // Anonymous product signal ONLY — a fresh wallet was created (helps gauge whether judges/visitors
      // actually tried the app). Carries NO key material, seed, address, or PII; Vercel Analytics is a
      // no-op off-Vercel (local dev). The device-only, non-custodial guarantee is untouched.
      track('wallet_created');
      startBackup(mnemonic);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create wallet');
    } finally {
      setBusy(false);
    }
  };
  const doImport = async (): Promise<void> => {
    setErr(null);
    if (!pw.trim()) return setErr('Enter a password.');
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await importWallet(importPhrase, pw);
      setImportPhrase('');
      reset();
      onEntered();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid recovery phrase');
    } finally {
      setBusy(false);
    }
  };
  const doUnlock = async (): Promise<void> => {
    if (busy) return; // sync guard — the Enter-key handler bypasses the disabled button (parallel scrypt otherwise)
    setErr(null);
    setBusy(true);
    try {
      await unlock(pw);
      if (needsBackup()) {
        // Created but never backed up (a reload/lock skipped the enforced backup) — resume it now.
        startBackup(revealMnemonic());
      } else {
        reset();
        onEntered();
      }
    } catch {
      // Not necessarily a wrong password — a corrupt/unreadable vault throws here too. Point the user
      // at Forgot-password → restore rather than letting them retype a correct password forever.
      setErr("Couldn't unlock. Check your password — if you're sure it's correct, the vault may be corrupted; use Forgot password to reset and restore from your recovery phrase.");
    } finally {
      setBusy(false);
    }
  };
  // Forgot-password recovery: there is no password reset for a self-custodial vault, so this
  // WIPES the on-device wallet and returns to onboarding, where the user restores from their
  // recovery phrase (same addresses) or creates a fresh one. Destructive — gated by a confirm.
  const doWipe = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      void signOut(); // a session that outlived a reload into the locked screen must not survive the wipe
      await wipeWallet();
      setImportPhrase('');
      reset();
      setView('none');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reset the wallet');
    } finally {
      setBusy(false);
    }
  };

  if (view === 'checking') return <div className="card id wallet-panel" />;

  return (
    <div className={`card id wallet-panel${(['none', 'create', 'backup', 'import'] as string[]).includes(view) ? ' onboard' : ''}`}>
      {view === 'locked' && (
        <div className="id-head">
          <span className="id-title">
            {view === 'locked' ? 'Unlock your wallet' : 'Create a real wallet'} <span className="wl-lock">🔒 non-custodial</span>
          </span>
        </div>
      )}

      {view === 'none' && (
        <div className="wl-actions onboard">
          <button className="btn primary" onClick={() => setView('create')}>
            Create new wallet
          </button>
          <button className="btn secondary" onClick={() => setView('import')}>
            Import recovery phrase
          </button>
        </div>
      )}

      {view === 'create' && (
        <>
          <p className="wl-lead">Set a password to encrypt your wallet on this device.</p>
          <input className="wl-input" type="password" placeholder="Password (min 8 chars)" aria-label="Wallet password (minimum 8 characters)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="wl-input" type="password" placeholder="Confirm password" aria-label="Confirm wallet password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {err && <p className="wl-err" role="alert">{err}</p>}
          <div className="wl-actions">
            <button className="btn primary" onClick={() => void doCreate()} disabled={busy}>
              {busy ? 'Generating…' : 'Generate wallet'}
            </button>
            <button className="wl-link" onClick={() => { reset(); setView('none'); }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {view === 'backup' && (
        <>
          <p className="wl-warn">
            These {phrase.split(' ').length} words are the ONLY way to restore your wallet. Write them down and keep them
            offline — nobody, not even us, can recover them for you.
          </p>
          {/* Hide the phrase once "written it down" is checked, so the verify quiz tests RECALL
              rather than letting the user read the two words straight off a still-visible grid.
              Unchecking brings it back. */}
          {!saved && (
            <div className="wl-phrase">
              {phrase.split(' ').map((w, i) => (
                <span className="wl-word" key={i}>
                  <span className="wl-word-n">{i + 1}</span>
                  {w}
                </span>
              ))}
            </div>
          )}
          <label className="wl-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I've written it down and
            stored it safely{saved ? ' (uncheck to see it again)' : ''}.
          </label>
          {saved &&
            (() => {
              const words = phrase.trim().split(/\s+/u);
              const [ia, ib] = verifyIdx;
              const okA = verifyWords.a.trim().toLowerCase() === (words[ia] ?? '');
              const okB = verifyWords.b.trim().toLowerCase() === (words[ib] ?? '');
              return (
                <div className="wl-verify">
                  <p className="wl-lead">Quick check — enter these two words to confirm:</p>
                  <div className="wl-verify-grid">
                    <div>
                      <label className="wl-flabel">Word #{ia + 1}</label>
                      <input
                        className={`wl-input${verifyWords.a && !okA ? ' wl-input-bad' : ''}`}
                        value={verifyWords.a}
                        onChange={(e) => setVerifyWords((v) => ({ ...v, a: e.target.value }))}
                        spellCheck={false}
                        autoComplete="off"
                        aria-label={`Recovery word number ${ia + 1}`}
                        aria-invalid={verifyWords.a !== '' && !okA}
                        aria-describedby={verifyWords.a && !okA ? 'rw-a-err' : undefined}
                      />
                      {verifyWords.a !== '' && !okA && (
                        <p id="rw-a-err" role="alert" className="wl-ens-hint bad">
                          ✕ Doesn’t match word #{ia + 1}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="wl-flabel">Word #{ib + 1}</label>
                      <input
                        className={`wl-input${verifyWords.b && !okB ? ' wl-input-bad' : ''}`}
                        value={verifyWords.b}
                        onChange={(e) => setVerifyWords((v) => ({ ...v, b: e.target.value }))}
                        spellCheck={false}
                        autoComplete="off"
                        aria-label={`Recovery word number ${ib + 1}`}
                        aria-invalid={verifyWords.b !== '' && !okB}
                        aria-describedby={verifyWords.b && !okB ? 'rw-b-err' : undefined}
                      />
                      {verifyWords.b !== '' && !okB && (
                        <p id="rw-b-err" role="alert" className="wl-ens-hint bad">
                          ✕ Doesn’t match word #{ib + 1}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="wl-actions">
                    <button
                      className="btn primary"
                      onClick={() => {
                        setNeedsBackup(false); // backup confirmed — clear the enforce-backup flag
                        setPhrase('');
                        setSaved(false);
                        setVerifyWords({ a: '', b: '' });
                        onEntered();
                      }}
                      disabled={!okA || !okB}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              );
            })()}
        </>
      )}

      {view === 'import' && (
        <>
          <p className="wl-lead">Restore a wallet from its 12/24-word recovery phrase.</p>
          <textarea className="wl-input wl-area" placeholder="Recovery phrase (space-separated words)" aria-label="Recovery phrase (space-separated words)" value={importPhrase} onChange={(e) => setImportPhrase(e.target.value)} />
          <input className="wl-input" type="password" placeholder="New password for this device" aria-label="New password for this device" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <p className="wl-err" role="alert">{err}</p>}
          <div className="wl-actions">
            <button className="btn primary" onClick={() => void doImport()} disabled={busy || !importPhrase.trim()}>
              {busy ? 'Restoring…' : 'Import wallet'}
            </button>
            <button className="wl-link" onClick={() => { reset(); setImportPhrase(''); setView('none'); }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {view === 'locked' && (
        <>
          <input
            className="wl-input"
            type="password"
            placeholder="Password"
            aria-label="Wallet password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doUnlock()}
            disabled={forgot}
          />
          {err && <p className="wl-err" role="alert">{err}</p>}
          {forgot ? (
            <div className="tx-review" style={{ marginTop: 8 }}>
              <p className="wl-warn">
                There is no password reset — your password is the only key to the encrypted vault on this device.
                Resetting DELETES this wallet; it can only be restored with your 12/24-word recovery phrase. Continue
                only if you have that phrase, or you’re fine starting fresh (testnet funds are refaucetable).
              </p>
              <div className="wl-actions">
                <button className="btn primary wl-danger-btn" onClick={() => void doWipe()} disabled={busy}>
                  {busy ? 'Resetting…' : 'Reset wallet & restore from phrase'}
                </button>
                <button className="wl-link" onClick={() => { setForgot(false); setErr(null); }} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="wl-actions">
              <button className="btn primary" onClick={() => void doUnlock()} disabled={busy || !pw}>
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
              <button className="wl-link" onClick={() => { setForgot(true); setErr(null); }}>
                Forgot password?
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The whole unlocked experience: owns identity, the send flow, the chat, and every
 *  modal, and renders the sidebar / bottom-nav shell with one section visible at a
 *  time. onExit() returns to the AuthGate (called on Lock / Remove). */
function WalletShell({ onExit }: { onExit: () => void }): JSX.Element {
  const [section, setSection] = useState<Section>('home');
  const [accountMenu, setAccountMenu] = useState(false);
  const [accountSwitchBusy, setAccountSwitchBusy] = useState(false); // a switch was refused because a broadcast is in flight
  const { id, copy, copied, acct, refresh } = useIdentity();

  // Import-private-key flow (EVM-only imported accounts)
  const [importOpen, setImportOpen] = useState(false);
  /** Which curve the pasted key is on. An imported key can only ever sign for one chain. */
  const [importChain, setImportChain] = useState<'evm' | 'sol'>('evm');
  const [importKey, setImportKey] = useState('');
  const [importLabel, setImportLabel] = useState('');
  const [importPw, setImportPw] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const doImportKey = async (): Promise<void> => {
    setImportErr(null);
    setImportBusy(true);
    try {
      await (importChain === 'sol' ? importSolanaKey : importPrivateKey)(importKey, importLabel, importPw);
      setImportKey('');
      setImportLabel('');
      setImportPw('');
      setImportOpen(false);
      refresh();
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  // Wallet-management state
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealAsk, setRevealAsk] = useState(false); // password re-auth prompt before showing the seed
  const [revealPw, setRevealPw] = useState('');
  const [revealErr, setRevealErr] = useState<string | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  // Private-key export — the wallet's most dangerous read, so it mirrors the seed-reveal flow:
  // a fresh password check, and the key auto-hides after 45s / on blur / on tab-hide.
  const [exportFor, setExportFor] = useState<number | null>(null); // account index being exported (ask stage)
  const [exportPw, setExportPw] = useState('');
  const [exportKeyVal, setExportKeyVal] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [signed, setSigned] = useState<{ raw: string; hash: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [showReceive, setShowReceive] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Send flow
  const [showSend, setShowSend] = useState(false);
  // These two overlays are inline JSX (not their own components), so — unlike every other modal —
  // they never got useDialog, and their local onKeyDown never fired because focus stays on the
  // opener OUTSIDE the dialog. Attach useDialog (gated on the open flag): it installs a document-
  // level Esc handler + focus trap, so Esc closes them like every other overlay.
  const sendDlgRef = useDialog(() => setShowSend(false), 'Send', showSend);
  const acctDlgRef = useDialog(() => setAccountMenu(false), 'Your accounts', accountMenu);
  // The destructive "Remove this wallet?" confirm needs a real focus trap (its ad-hoc onKeyDown let
  // Tab escape to the page behind it, after which Esc no longer closed it) + opener-focus restore.
  const wipeDlgRef = useDialog(() => setConfirmWipe(false), 'Remove this wallet?', confirmWipe);
  const [sendAsset, setSendAsset] = useState('ETH');
  const [reviewing, setReviewing] = useState(false);
  // GIWA is the DEFAULT settlement chain — every send opens on GIWA and settles through its
  // on-chain IntentExecutor (the user can still switch chains via the tabs). rpcUrl must match.
  const [sendChain, setSendChain] = useState<SendChain>('solana-devnet');
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_GIWA_RPC);
  const [sendTo, setSendTo] = useState('');
  const [sendAmt, setSendAmt] = useState('0.001');
  const [feeRate, setFeeRate] = useState('2');
  const [sending, setSending] = useState(false);
  // Synchronous re-entrancy latch. `disabled={sending || …}` is async React state that may not
  // flush between two fast clicks/taps, so both would pass and each fire a real broadcast — and
  // Solana/BTC have no nonce dedup, so BOTH settle (double-send). Same doctrine as PlanFlow's
  // execInFlightRef. Claimed synchronously in doSend before the first await, released in finally.
  const sendInFlightRef = useRef(false);
  const [sendResult, setSendResult] = useState<EvmSendResult | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [ensAddress, setEnsAddress] = useState<string | null>(null);
  const [ensResolving, setEnsResolving] = useState(false);
  // ON-CHAIN poisoning check: the reference set comes from the chain (this wallet's own paid
  // counterparties + the attacker's planted dust), so a lookalike is caught on a FIRST-EVER send
  // with nothing saved locally. null = not run / still loading; `checked: false` = couldn't verify.
  const [chainCheck, setChainCheck] = useState<RecipientAssessment | null>(null);
  const [chainChecking, setChainChecking] = useState(false);

  // Chat
  const [utterance, setUtterance] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const addActivity = (item: ActivityItem): void => setActivity((a) => [item, ...a]);
  const updateActivity = (id: string, patch: Partial<ActivityItem>): void =>
    setActivity((a) => a.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  useEffect(() => {
    const name = sendTo.trim();
    if (sendChain !== 'sepolia' || !/\.eth$/iu.test(name)) {
      setEnsAddress(null);
      setEnsResolving(false);
      return;
    }
    setEnsResolving(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      void resolveEnsName(name).then((addr) => {
        if (!cancelled) {
          setEnsAddress(addr);
          setEnsResolving(false);
        }
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sendTo, sendChain]);

  useEffect(() => {
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  // The recovery phrase is the keys to everything — never leave it on screen. Clear it the
  // moment you leave Settings, hide/blur the tab, or after a short timeout; and require a
  // fresh password to show it (below), even though the wallet is already unlocked.
  useEffect(() => {
    if (section !== 'settings') {
      setRevealed(null);
      setRevealAsk(false);
    }
  }, [section]);
  // A revealed private key must NEVER survive the account menu closing — otherwise reopening it
  // within the 45s auto-hide window re-shows the key with NO password re-auth (the fresh-password
  // gate bypassed). Mirrors the seed-reveal cleanup on leaving Settings. (switchAccount clears it
  // too, so switching accounts never leaves the prior account's key on screen.)
  useEffect(() => {
    if (!accountMenu) {
      setExportKeyVal(null);
      setExportFor(null);
      setExportPw('');
      setExportErr(null);
    }
  }, [accountMenu]);
  // The per-plan/per-bridge dedup maps are MODULE scope, so they outlive an unlock session — but the
  // turns that own them reset on lock/unlock (WalletShell remounts). BridgeFlow's flowKey is turn-
  // INDEX based (`bridge-0`, …), so a fresh session reusing index 0 would hit the previous session's
  // stored bridge tx: a stale "done" receipt for a bridge that never ran. Clear the maps when the
  // shell unmounts (i.e. on lock) so every unlock session starts clean. (PlanFlow's planId is unique
  // and wouldn't collide, but clearing it too is correct hygiene and frees the memory.)
  useEffect(
    () => () => {
      EXECUTED_BRIDGES.clear();
      INFLIGHT_BRIDGES.clear();
      BRIDGE_WATCH.clear();
      EXECUTED_PLANS.clear();
      INFLIGHT_PLAN_IDS.clear();
      SESSION_OUTFLOW.clear();
      PLAN_AUTO_ARMED.clear();
      BRIDGE_AUTO_ARMED.clear();
      PLAN_AUTO_TRIED.clear();
      BRIDGE_AUTO_TRIED.clear();
    },
    [],
  );
  // Reset the idle auto-lock timer on real user activity. This shell is mounted only while unlocked,
  // so the listeners live exactly for the unlocked session. Without this, "idle" auto-lock was really
  // an ABSOLUTE timeout — an actively-transacting user was hard-locked mid-flow at exactly the
  // configured minutes after unlock. Throttled (touch() only re-arms a timer): once per 20s is ample.
  useEffect(() => {
    let last = 0;
    const onActivity = (): void => {
      const now = Date.now();
      if (now - last < 20_000) return;
      last = now;
      touch();
    };
    document.addEventListener('pointerdown', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onActivity);
      document.removeEventListener('keydown', onActivity);
    };
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const clear = (): void => setRevealed(null);
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') clear();
    };
    const t = setTimeout(clear, 45_000); // auto-hide after 45s
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [revealed]);
  // Same auto-hide discipline as the seed reveal, applied to an exported key.
  useEffect(() => {
    if (!exportKeyVal) return;
    const clear = (): void => setExportKeyVal(null);
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') clear();
    };
    const t = setTimeout(clear, 45_000);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [exportKeyVal]);
  const doExport = async (): Promise<void> => {
    if (exportFor === null) return;
    setExportErr(null);
    setExportBusy(true);
    try {
      const key = await exportPrivateKey(exportFor, exportPw);
      setExportKeyVal(key);
      setExportFor(null);
      setExportPw('');
    } catch (e) {
      setExportErr(e instanceof Error && /password/iu.test(e.message) ? 'Wrong password.' : 'Could not export — try again.');
    } finally {
      setExportBusy(false);
    }
  };

  const openExport = (index: number): void => {
    setExportKeyVal(null);
    setExportErr(null);
    setExportPw('');
    setExportFor(index);
  };

  const doReveal = async (): Promise<void> => {
    setRevealErr(null);
    setRevealBusy(true);
    try {
      if (await verifyPassword(revealPw)) {
        setRevealed(revealMnemonic());
        setRevealAsk(false);
        setRevealPw('');
      } else {
        setRevealErr('Wrong password.');
      }
    } catch {
      setRevealErr('Could not verify — try again.');
    } finally {
      setRevealBusy(false);
    }
  };

  // NEVER change the active account (switch OR add-new) while a broadcast is in flight. The signer
  // re-reads activeAccountIndex() LATE (at sign time), so changing it mid-broadcast would sign the
  // pending tx with the NEW account while carrying the OLD account's nonce — a wrong-account/wrong-nonce
  // tx. Refuse until the in-flight send/plan/bridge settles (all clear their INFLIGHT marker in a
  // finally). Returns true (and flashes the "busy" hint) when the change is BLOCKED.
  const accountChangeBlocked = (): boolean => {
    if (sendInFlightRef.current || INFLIGHT_PLAN_IDS.size > 0 || INFLIGHT_BRIDGES.size > 0) {
      setAccountSwitchBusy(true);
      setTimeout(() => setAccountSwitchBusy(false), 2500);
      return true;
    }
    return false;
  };
  // DISARM any pending auto flows before the active account changes. An armed plan/bridge that hasn't yet
  // claimed its INFLIGHT marker (e.g. mid auto-authorize, or waiting on a live swap quote) survives the
  // acct-key remount via the module-level Sets; without disarming, the remounted flow re-drives and signs
  // from the NEWLY-selected account for an intent created under the previous one. (The in-flight guard
  // above only covers a broadcast already in flight — not the pre-broadcast arm window.)
  const disarmAutoFlows = (): void => {
    PLAN_AUTO_ARMED.clear();
    BRIDGE_AUTO_ARMED.clear();
    PLAN_AUTO_TRIED.clear();
    BRIDGE_AUTO_TRIED.clear();
  };
  // State that belongs to the PRIOR account and must be dropped once the active account changes.
  const afterAccountChange = (): void => {
    refresh();
    // Never carry a revealed private key across an account change (it belongs to the prior account).
    setExportKeyVal(null);
    setExportFor(null);
    setExportPw('');
    setExportErr(null);
    setSigned(null); // the "signed test tx" receipt belongs to the prior account — don't show it under the new one
    // A SIWE session belongs to the account that signed in. Once the active account changes, drop a
    // now-mismatched session so no authorized call ever runs under the wrong principal — re-sign as
    // the new account when needed. An imported SOLANA account has an EMPTY evm address — it can't own an
    // EVM SIWE session at all — so treat a falsy `a` as a mismatch too.
    const s = currentSession();
    const a = evmAddress();
    if (s && (!a || s.address.toLowerCase() !== a.toLowerCase())) void signOut();
  };
  const switchAccount = (i: number): void => {
    if (accountChangeBlocked()) return;
    disarmAutoFlows();
    setActiveAccount(i);
    afterAccountChange();
  };
  // Derive + activate the next HD account. Adding ALSO activates the new account (addAccount writes
  // index = count-1), so it needs the SAME in-flight guard and prior-account cleanup as switchAccount —
  // before this, the "Add account" button called addAccount() raw, so it could repoint the active index
  // mid-broadcast (a wrong-account signing on the fund path, which switchAccount already prevents) and
  // left a stale SIWE session / revealed key / armed auto flow from the previous account in place.
  const addNewAccount = (): void => {
    if (accountChangeBlocked()) return;
    disarmAutoFlows();
    addAccount();
    afterAccountChange();
  };
  const doLock = (): void => {
    void signOut(); // clear + best-effort revoke the SIWE session so a bearer token can't
    // outlive the locked wallet in XSS-readable storage (M3).
    lock();
    setRevealed(null);
    setRevealAsk(false);
    setSigned(null);
    onExit();
  };
  const doRemove = async (): Promise<void> => {
    void signOut(); // drop + best-effort revoke the SIWE session server-side so its bearer token can't
    // outlive the wiped wallet or attach to the NEXT wallet created here (wrong-principal). Same doctrine
    // as doLock; wipeWallet() also clears the session key locally, but signOut() captures the token first
    // to revoke it upstream.
    await wipeWallet();
    setConfirmWipe(false);
    setWipeConfirmText('');
    setRevealed(null);
    setSigned(null);
    onExit();
  };
  const doSignTest = (): void => {
    const me = currentIdentity();
    if (!me) return;
    const tx: Eip1559Transaction = {
      chainId: 11155111,
      nonce: 0n,
      maxPriorityFeePerGas: 1_500_000_000n,
      maxFeePerGas: 30_000_000_000n,
      gasLimit: 21_000n,
      to: me.evm.address,
      value: 0n,
    };
    // A test tx is inherently EVM; a Solana-only imported account throws here. The button is gated
    // on curve below, but catch anyway so an event-handler throw can never silently no-op the button.
    try {
      setSigned(signEvmTransaction(tx));
    } catch {
      /* gated away for non-EVM accounts — nothing to sign */
    }
  };
  const defaultRpc = (c: SendChain): string =>
    c === 'solana-devnet'
      ? DEFAULT_DEVNET_RPC
      : c === 'bitcoin-testnet'
        ? DEFAULT_BTC_TESTNET_REST
        : c === 'giwa-sepolia'
          ? DEFAULT_GIWA_RPC
          : DEFAULT_SEPOLIA_RPC;
  const ownAddr = (me: WalletIdentity | null, c: SendChain): string => {
    if (c === 'bitcoin-testnet') return btcTestnetAddress() ?? '';
    if (c === 'solana-devnet') return me?.sol.address ?? '';
    return me?.evm.address ?? '';
  };
  const assetOf = (c: SendChain, symbol: string): SendAsset =>
    ASSETS_FOR[c].find((a) => a.symbol === symbol) ?? nativeAssetOf(c);
  const balanceFor = (c: SendChain, rpc: string, symbol: string): Promise<string> => {
    const asset = assetOf(c, symbol);
    if (asset.kind === 'erc20') return getErc20Balance(asset.symbol, rpc);
    if (asset.kind === 'spl') return Promise.resolve('—');
    return c === 'solana-devnet'
      ? getSolTestnetBalance(rpc)
      : c === 'bitcoin-testnet'
        ? getBtcTestnetBalance(rpc)
        : getEvmTestnetBalance(c === 'giwa-sepolia' ? 'giwa-sepolia' : 'sepolia', rpc);
  };
  // Latest-wins balance load. Rapid asset/chain switching fires overlapping fetches; without this a
  // SLOWER earlier fetch can resolve last and overwrite the current asset's balance with the wrong
  // one — which then also feeds the drain guard's spend cap. Only the newest request may set state.
  const balanceReqRef = useRef(0);
  const loadBalance = (c: SendChain, rpc: string, symbol: string): void => {
    const reqId = ++balanceReqRef.current;
    setBalance(null);
    void balanceFor(c, rpc, symbol)
      .then((b) => {
        if (reqId === balanceReqRef.current) setBalance(b);
      })
      .catch(() => {
        if (reqId === balanceReqRef.current) setBalance(null);
      });
  };
  const openSend = (): void => {
    const me = currentIdentity();
    // Open on a chain the ACTIVE account can actually sign for, resetting any leftover chain from a
    // prior send. Solana is the HOME chain, so a full HD wallet (and a Solana import) opens on Solana
    // devnet. An imported single-curve account can only sign its own curve — an EVM-only key can't
    // sign SOL, so it opens on the GIWA (EVM) home instead (core returns '' for the non-native curve,
    // which would otherwise prefill a BLANK own-address and fetch balance against '').
    const chain: SendChain = isActiveImported() && activeImportedKind() === 'evm' ? 'giwa-sepolia' : 'solana-devnet';
    const rpc = defaultRpc(chain);
    const asset = nativeAssetOf(chain).symbol;
    setSendChain(chain);
    setRpcUrl(rpc);
    setSendAsset(asset);
    setSendTo(ownAddr(me, chain));
    setSendResult(null);
    setSendErr(null);
    setReviewing(false);
    setShowSend(true);
    loadBalance(chain, rpc, asset);
  };
  const switchSendChain = (c: SendChain): void => {
    if (c === sendChain) return;
    const me = currentIdentity();
    const rpc = defaultRpc(c);
    const asset = nativeAssetOf(c).symbol;
    setSendChain(c);
    setSendAsset(asset);
    setRpcUrl(rpc);
    setSendTo(ownAddr(me, c));
    setSendResult(null);
    setSendErr(null);
    setReviewing(false);
    loadBalance(c, rpc, asset);
  };
  const switchSendAsset = (symbol: string): void => {
    setSendAsset(symbol);
    loadBalance(sendChain, rpcUrl, symbol);
  };
  const refreshBalance = (): void => {
    loadBalance(sendChain, rpcUrl, sendAsset);
  };
  const isEvmSend = sendChain === 'sepolia';
  const contactAddr = resolveContact(sendTo);
  const ensActive = isEvmSend && !contactAddr && /\.eth$/iu.test(sendTo.trim());
  const effectiveTo = contactAddr ?? (ensActive ? (ensAddress ?? '') : sendTo.trim());

  // Run the on-chain poisoning check the moment the review sheet opens — one fetch at exactly the
  // pre-sign moment (not per keystroke). Results are cached per recipient inside `assessRecipientLive`.
  useEffect(() => {
    const evmChain = sendChain === 'giwa-sepolia' || sendChain === 'sepolia' ? sendChain : null;
    if (!reviewing || !evmChain || !id || !/^0x[0-9a-fA-F]{40}$/u.test(effectiveTo)) {
      setChainCheck(null);
      setChainChecking(false);
      return;
    }
    let alive = true;
    setChainCheck(null);
    setChainChecking(true);
    void assessRecipientLive({ chain: evmChain, me: id.evm.address, target: effectiveTo })
      .then((r) => {
        if (alive) setChainCheck(r);
      })
      .catch(() => {
        if (alive) setChainCheck(null); // treated as "couldn't verify", never as "safe"
      })
      .finally(() => {
        if (alive) setChainChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [reviewing, effectiveTo, sendChain, id]);

  const doSend = async (): Promise<void> => {
    setSendErr(null);
    setSendResult(null);
    if (!effectiveTo) {
      setSendErr(ensActive ? 'That ENS name has no address record.' : 'Enter a recipient.');
      return;
    }
    if (sendInFlightRef.current) return; // a broadcast is already in flight — ignore the double-click/tap
    sendInFlightRef.current = true;
    setSending(true);
    try {
      const asset = assetOf(sendChain, sendAsset);
      let r: EvmSendResult;
      if (asset.kind === 'erc20') {
        const token = tokenInfo(asset.symbol);
        if (!token) throw new Error(`unknown token ${asset.symbol}`);
        r = await sendErc20Transfer({ rpcUrl, token, to: effectiveTo, amountBase: decimalToBase(sendAmt, asset.decimals) });
      } else if (asset.kind === 'spl') {
        const spl = splToken(asset.symbol);
        if (!spl) throw new Error(`unknown SPL token ${asset.symbol}`);
        r = await sendSplTransfer({ rpcUrl, mint: spl.mint, decimals: spl.decimals, toOwner: effectiveTo, amountBase: decimalToBase(sendAmt, asset.decimals) });
      } else {
        r =
          sendChain === 'solana-devnet'
            ? await sendSolTransfer({ rpcUrl, to: effectiveTo, solAmount: sendAmt })
            : sendChain === 'bitcoin-testnet'
              ? await sendBtcTransfer({ restUrl: rpcUrl, to: effectiveTo, btcAmount: sendAmt, feeRateSatPerVb: Number(feeRate) })
              : sendChain === 'giwa-sepolia' && GIWA_INTENT_EXECUTOR
                ? await executeIntentOnGiwa({ rpcUrl, to: effectiveTo, ethAmount: sendAmt })
                : await sendEvmTransfer({ chain: sendChain, rpcUrl, to: effectiveTo, ethAmount: sendAmt });
      }
      setSendResult(r);
      // Remember this recipient so a later POISONING lookalike of it is caught — no manual
      // contact-saving needed (this send itself becomes the known-good reference).
      recordRecipient(effectiveTo);
      // Record this outflow so the cumulative-drain guard sees it on the NEXT send this session.
      // Record into the SHARED session-outflow ledger (module-level, account-scoped) so a drain split
      // across the Send sheet AND the AI-chat PlanFlow is caught on whichever send completes it. A
      // SELF-SEND never left the wallet, so it must NOT accrue — otherwise it would later block a real
      // send as a bogus "cumulative drain".
      if (ownAddr(id, sendChain).toLowerCase() !== effectiveTo.toLowerCase()) {
        try {
          recordOutflow(sendChain, sendAsset, BigInt(decimalToBase(sendAmt, asset.decimals)));
        } catch {
          /* amount was already parsed by the send path above; ignore a re-parse failure */
        }
      }
      setReviewing(false);
      refreshBalance();
    } catch (e) {
      setSendErr(e instanceof Error ? humanizeTxError(e.message) : 'Broadcast failed');
    } finally {
      setSending(false);
      sendInFlightRef.current = false;
    }
  };
  const submitInFlightRef = useRef(false); // sync latch — `loading` is async and may not flush between two fast taps
  const submit = async (text: string): Promise<void> => {
    let q = text.trim();
    if (!q || loading) return;
    if (submitInFlightRef.current) return; // a plan is already in flight — a same-tick double-tap must not fire twice
    submitInFlightRef.current = true;
    // SLOT-FILL. A clarify asks for one missing field and offers the choices, but the parser is
    // stateless — so answering "eth" came back as "I couldn't understand that", leaving the
    // conversation in a dead end (and making the offered chips meaningless). If the previous turn
    // was a clarify WITH options and this input is one of them, splice the answer onto the
    // ORIGINAL utterance and plan that instead.
    const prev = turns.at(-1);
    const prevOutcome = prev?.res?.outcome;
    if (prevOutcome?.kind === 'clarify' && prevOutcome.options?.length && prev?.q) {
      const picked = prevOutcome.options.find((o) => o.toLowerCase() === q.toLowerCase());
      if (picked) q = `${prev.q} to ${picked}`;
    }
    setLoading(true);
    setUtterance('');
    setSection('ai');
    // Capture the appended index from INSIDE the updater — `turns.length` from the closure is stale
    // if two turns are ever appended before a render, which would map both to the same slot.
    let idx = turns.length;
    setTurns((t) => {
      idx = t.length;
      return [...t, { q, pending: true }];
    });
    // Bridge isn't a backend intent kind — handle "bridge N ETH to GIWA" client-side. The rules
    // live in @intent-wallet/intents (pure + unit-tested over the full phrasing corpus).
    // A bridge is parsed CLIENT-side and returns before the backend planner, so it would otherwise be
    // the one fund action that SKIPS the negation gate + injection veto every server-planned move gets.
    // Enforce the identical veto here: a negated ("don't bridge…") or injected ("ignore previous
    // instructions and bridge…") utterance is NOT treated as a bridge — it falls through to the backend,
    // which defers/clarifies it, and is never auto-armed into an on-chain deposit.
    const bridge = looksLikeInjection(q) || looksNegatedOrDeferred(q) ? null : parseBridgeUtterance(q);
    if (bridge) {
      // Route understood but no amount given → ask, rather than letting it fall through to the
      // backend parser and come back as "I couldn't understand that". The question names the
      // ROUTE's own asset and chains, so it stays true for SOL/BTC routes too.
      const turn: Turn =
        bridge.amount === null
          ? {
              q,
              res: {
                outcome: {
                  kind: 'clarify',
                  question: `How much ${bridge.asset} do you want to bridge from ${BRIDGE_CHAINS[bridge.fromId]?.label ?? bridge.fromId} to ${BRIDGE_CHAINS[bridge.toId]?.label ?? bridge.toId}? e.g. “bridge 0.01 ${bridge.asset} to ${bridge.toId}”.`,
                },
              } as PlanResponse,
            }
          : { q, bridge };
      // Arm this bridge for Auto ONLY if Auto is active NOW (at creation). Its flowKey when rendered
      // is `bridge-${idx}` — a later switch to Auto must not retroactively auto-DEPOSIT it.
      if (bridge.amount !== null && getTxMode() === 'auto') BRIDGE_AUTO_ARMED.add(`bridge-${idx}`);
      setTurns((t) => t.map((prev, i) => (i === idx ? turn : prev)));
      setLoading(false);
      submitInFlightRef.current = false;
      return;
    }
    try {
      const res = await planIntent(substituteContacts(q));
      // Arm for Auto ONLY if Auto is active NOW (at creation) — a later switch to Auto must not
      // retroactively fire this plan (which would remount + auto-execute the whole transcript).
      if (res.outcome.kind === 'plan' && getTxMode() === 'auto') PLAN_AUTO_ARMED.add(res.outcome.plan.planId);
      setTurns((t) => t.map((turn, i) => (i === idx ? { q, res } : turn)));
    } catch (e) {
      // A 401 → the SIWE session expired/missing: clear the stale token so the SessionBar prompts
      // sign-in, and show the recoverable "Sign in to continue" message (not a generic rejected card).
      if (isSessionExpired(e)) void signOut();
      // Honest error state: a raw fetch/network failure means the backend (services/api) is unreachable,
      // so say exactly that and how to fix it — never a cryptic "Something went wrong" / "Failed to fetch".
      const msg = e instanceof Error ? e.message : '';
      const friendly = isSessionExpired(e)
        ? 'Your session expired — sign in and try again.'
        : !msg || /failed to fetch|load failed|networkerror|network request failed|econnrefused|50[234]/i.test(msg)
          ? 'The backend API is offline — start it (services/api on :8080) and try again.'
          : msg;
      setTurns((t) => t.map((turn, i) => (i === idx ? { q, error: friendly } : turn)));
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
    }
  };

  const started = turns.length > 0;
  // Imported accounts have negative indices and only their own curve's address — so "Account {acct+1}"
  // would read "Account 0" and a Solana-only key's blank evm.address would show nothing. Label + address
  // them from the imported record instead, matching the account menu.
  const importedActive = isActiveImported() ? listImportedAccounts().find((im) => im.index === acct) : undefined;
  const chipName = importedActive ? importedActive.label || (importedActive.kind === 'sol' ? 'Imported Solana' : 'Imported EVM') : `Account ${acct + 1}`;
  const chipAddr = importedActive ? importedActive.address : id?.evm.address;
  const chip = (compact: boolean): JSX.Element => (
    <button className={`account-chip${compact ? ' compact' : ''}`} onClick={() => setAccountMenu(true)} aria-haspopup="dialog" aria-label="Account menu">
      <span className="acct-dot" aria-hidden="true" />
      <span className="acct-meta">
        <span className="acct-name">{chipName}</span>
        {!compact && <span className="acct-addr">{chipAddr ? shortAddr(chipAddr) : '…'}</span>}
      </span>
    </button>
  );

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sections">
        <div className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item${section === n.id ? ' active' : ''}`}
              onClick={() => setSection(n.id)}
              aria-current={section === n.id ? 'page' : undefined}
            >
              <span className="nav-ic">
                <ActIcon d={n.d} />
              </span>
              <span className="nav-lbl">{n.label}</span>
            </button>
          ))}
        </div>
        <div className="nav-footer">
          {chip(false)}
          <button className="wl-link nav-lock" onClick={doLock}>
            Lock
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="view-top">{chip(true)}</div>
        <div className={`view view-${section}`} key={acct}>
          {section === 'home' && (
            <section className="hv">
              <div className="hv-greet">
                <h2 className="hv-title">
                  <span className="wave">👋</span> What would you like to do?
                </h2>
                <p className="hv-sub">Tell your wallet in plain English — it plans the route, checks it for risk, and executes.</p>
              </div>
              <LiveBalancesPanel variant="net" key={`net-${acct}`} />
              <div className="hv-actions">
                <button className="hv-act primary" onClick={openSend}>
                  <span className="hv-act-ic"><ActIcon d={['M7 17 17 7', 'M8 7h9v9']} /></span>Send
                </button>
                <button className="hv-act primary" onClick={() => setShowReceive(true)}>
                  <span className="hv-act-ic"><ActIcon d={['M17 7 7 17', 'M16 17H7V8']} /></span>Receive
                </button>
                <button className="hv-act" onClick={() => setSection('portfolio')}>
                  <span className="hv-act-ic"><ActIcon d={['M12 2 2 7l10 5 10-5-10-5Z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5']} /></span>Portfolio
                </button>
                <button className="hv-act" onClick={() => setSection('activity')}>
                  <span className="hv-act-ic"><ActIcon d={['M22 12h-4l-3 9L9 3l-3 9H2']} /></span>Activity
                </button>
              </div>
              <form
                className="hv-ai"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(utterance);
                }}
              >
                <input value={utterance} onChange={(e) => setUtterance(e.target.value)} placeholder="Ask AI… e.g. Send 2 SOL to alice" aria-label="Ask your wallet" />
                <button className="btn send" type="submit" disabled={loading || !utterance.trim()} aria-label="Ask">
                  {loading ? <span className="spin" /> : '↑'}
                </button>
              </form>
              <div className="hv-examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex.prompt} className="ex" onClick={() => void submit(ex.prompt)} disabled={loading}>
                    <span className="ex-icon">{ex.icon}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
              {activity.length > 0 && <ActivityPanel items={activity} />}
            </section>
          )}

          {section === 'ai' && (
            <section className="hv ai-sec">
              <div className="feed" ref={started ? undefined : feedRef}>
                {started ? (
                  <>
                    <ActivityPanel items={activity} />
                    {turns.map((turn, i) => (
                      <div className="turn" key={i}>
                        <div className="bubble you">{turn.q}</div>
                        {turn.pending && (
                          <div className="bubble ai thinking" role="status" aria-live="polite">
                            <span className="typing" aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                            Planning…
                          </div>
                        )}
                        {turn.error && <div className="card rejected" role="alert">{turn.error}</div>}
                        {turn.bridge && <BridgeFlow route={turn.bridge} flowKey={`bridge-${i}`} onExecuted={addActivity} onUpdate={updateActivity} />}
                        {turn.res && <OutcomeView outcome={turn.res.outcome} onExecuted={addActivity} onPick={(c) => void submit(c)} />}
                      </div>
                    ))}
                    <div ref={feedRef} />
                  </>
                ) : (
                  <div className="ai-empty">
                    <span className="ai-empty-spark" aria-hidden="true">
                      <ActIcon d={['M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z']} />
                    </span>
                    <p className="ai-empty-h">Ask your wallet anything</p>
                    <p className="ai-empty-sub">“Send 2 SOL to alice”, “Swap 2 SOL for USDC”, “Swap 100 USDC for SOL”.</p>
                  </div>
                )}
              </div>
              <section className="composer">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(utterance);
                  }}
                >
                  <input
                    value={utterance}
                    onChange={(e) => setUtterance(e.target.value)}
                    placeholder="Type naturally… e.g. Swap 2 SOL for USDC"
                    autoFocus
                    aria-label="Tell your wallet what you want"
                  />
                  <button className="btn send" type="submit" disabled={loading || !utterance.trim()} aria-label="Send">
                    {loading ? <span className="spin" /> : '↑'}
                  </button>
                </form>
                <div className="examples">
                  {EXAMPLES.map((ex) => (
                    <button key={ex.prompt} className="ex" onClick={() => void submit(ex.prompt)} disabled={loading}>
                      <span className="ex-icon">{ex.icon}</span>
                      {ex.label}
                    </button>
                  ))}
                </div>
                <p className="composer-note">Non-custodial · AI proposes, deterministic code verifies, the device signature disposes.</p>
              </section>
            </section>
          )}

          {section === 'bridge' && <BridgeView me={id} onActivity={addActivity} onUpdate={updateActivity} />}

          {section === 'swap' && id && <CrossChainSwapView me={id} />}

          {section === 'portfolio' && (
            <section className="hv">
              <div className="sect-head">
                <h2 className="sect-title">Portfolio</h2>
              </div>
              <LiveBalancesPanel variant="full" key={`pf-${acct}`} />
              <InsightsPanel />
              {id && <UniversalBalancesModal id={id} onClose={() => {}} embedded />}
              <SessionBar />
            </section>
          )}

          {section === 'activity' && (
            <section className="hv">
              <div className="sect-head">
                <h2 className="sect-title">Activity</h2>
              </div>
              {/* Two distinct views: THIS SESSION's intents (immediate, keyed by txid) and the ON-CHAIN
                  history (indexed seconds later). A just-run tx appears in both — label them so the same
                  tx across the two panels reads as "session" + "confirmed on-chain", not a duplicate. */}
              {activity.length > 0 ? (
                <>
                  <p className="id-section-label">This session</p>
                  <ActivityPanel items={activity} />
                  <p className="id-section-label" style={{ marginTop: 14 }}>On-chain history</p>
                </>
              ) : (
                <p className="sect-empty">No intents run yet this session. Executed swaps and sends show up here.</p>
              )}
              {id && <ActivityModal address={id.evm.address} onClose={() => {}} embedded />}
              <div className="card sect-card">
                <button className="set-row" onClick={() => setShowRecover(true)}>
                  <span>Recover a stuck transaction</span>
                  <span className="set-row-cta">Open</span>
                </button>
              </div>
            </section>
          )}

          {section === 'settings' && (
            <section className="hv settings">
              <div className="sect-head">
                <h2 className="sect-title">Settings</h2>
              </div>

              <div className="set-group">
                <h3 className="set-label">Preferences</h3>
                <SettingsModal embedded onClose={() => {}} />
              </div>

              <div className="set-group">
                <h3 className="set-label">Security</h3>
                <div className="card sect-card">
                  {revealed ? (
                    <div className="wl-reveal">
                      <p className="wl-lead">Your recovery phrase — keep it secret. It auto-hides shortly and when you leave this tab.</p>
                      <div className="wl-phrase">
                        {revealed.split(' ').map((w, i) => (
                          <span className="wl-word" key={i}>
                            <span className="wl-word-n">{i + 1}</span>
                            {w}
                          </span>
                        ))}
                      </div>
                      <button className="wl-link" onClick={() => setRevealed(null)}>
                        Hide now
                      </button>
                    </div>
                  ) : revealAsk ? (
                    <div className="reveal-auth">
                      <p className="wl-lead">Enter your password to reveal your recovery phrase.</p>
                      <input
                        className="wl-input"
                        type="password"
                        placeholder="Password"
                        aria-label="Password to reveal recovery phrase"
                        autoComplete="current-password"
                        value={revealPw}
                        onChange={(e) => setRevealPw(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void doReveal()}
                        autoFocus
                      />
                      {revealErr && <p className="wl-err" role="alert">{revealErr}</p>}
                      <div className="wl-actions">
                        <button className="btn primary" onClick={() => void doReveal()} disabled={revealBusy || !revealPw}>
                          {revealBusy ? 'Verifying…' : 'Reveal phrase'}
                        </button>
                        <button className="wl-link" onClick={() => { setRevealAsk(false); setRevealPw(''); setRevealErr(null); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="set-row" onClick={() => { setRevealErr(null); setRevealPw(''); setRevealAsk(true); }}>
                      <span>Back up recovery phrase</span>
                      <span className="set-row-cta">Reveal</span>
                    </button>
                  )}
                  <button className="set-row" onClick={() => setShowRevoke(true)}>
                    <span>Revoke a token approval</span>
                    <span className="set-row-cta">Open</span>
                  </button>
                  <button className="set-row" onClick={doLock}>
                    <span>Lock wallet</span>
                    <span className="set-row-cta">Lock</span>
                  </button>
                </div>
              </div>

              <div className="set-group">
                <h3 className="set-label">Address book</h3>
                <div className="card sect-card">
                  <button className="set-row" onClick={() => setShowContacts(true)}>
                    <span>Contacts — send by name</span>
                    <span className="set-row-cta">Open</span>
                  </button>
                </div>
              </div>

              <div className="set-group">
                <h3 className="set-label">Developer</h3>
                <div className="card sect-card">
                  {/* A test tx is EVM — a Solana-only imported account can't sign it (would throw and
                      silently no-op the button). Gate it on the active account's curve. */}
                  <button
                    className="set-row"
                    onClick={doSignTest}
                    disabled={isActiveImported() && activeImportedKind() !== 'evm'}
                  >
                    <span>Sign a test transaction{isActiveImported() && activeImportedKind() !== 'evm' ? ' (EVM accounts only)' : ''}</span>
                    <span className="set-row-cta">Sign</span>
                  </button>
                  {signed && (
                    <div className="wl-signed" role="status" aria-live="polite">
                      <p className="wl-signed-h">✓ Real signed Sepolia transaction (your key, in-browser)</p>
                      <code className="wl-mono">{signed.raw.slice(0, 42)}…{signed.raw.slice(-8)}</code>
                      <p className="wl-signed-sub">hash {signed.hash.slice(0, 14)}… · not broadcast (use Send).</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="set-group">
                <h3 className="set-label">Danger zone</h3>
                <div className="card sect-card">
                  <button className="set-row danger" onClick={() => setConfirmWipe(true)}>
                    <span>Remove this wallet</span>
                    <span className="set-row-cta">Remove</span>
                  </button>
                </div>
              </div>

              <p className="id-foot">
                Encrypted with your password (scrypt + AES-256-GCM) in this browser.{' '}
                {getSettings().autoLockMinutes === 0
                  ? 'Idle auto-lock is off — keys stay in memory until you lock manually.'
                  : `Auto-locks after ${getSettings().autoLockMinutes} min idle.`}
              </p>
            </section>
          )}
        </div>
      </main>

      <nav className="navbar-bottom" aria-label="Sections">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`bnav-item${section === n.id ? ' active' : ''}${n.id === 'ai' ? ' ai' : ''}`}
            onClick={() => setSection(n.id)}
            aria-current={section === n.id ? 'page' : undefined}
          >
            <span className="bnav-ic">
              <ActIcon d={n.d} />
            </span>
            <span className="bnav-lbl">{n.label}</span>
          </button>
        ))}
      </nav>

      {accountMenu && (
        <div className="rcv-overlay" onClick={() => setAccountMenu(false)}>
          <div
            ref={acctDlgRef}
            className="rcv-modal account-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Your accounts"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalBack onClick={() => setAccountMenu(false)} />
            <p className="wipe-h">Your accounts</p>
            {accountSwitchBusy && (
              <p className="wl-err" role="alert">
                A transaction is being signed — can’t switch accounts until it finishes.
              </p>
            )}
            <div className="acct-list">
              {Array.from({ length: accountCount() }, (_, i) => {
                const active = activeAccountIndex() === i;
                const addr = accountEvmAddress(i);
                return (
                  <div key={i} className="acct-item-wrap">
                    <button
                      className={`acct-item${active ? ' active' : ''}`}
                      onClick={() => switchAccount(i)}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className="acct-item-ava" aria-hidden="true">{i + 1}</span>
                      <span className="acct-item-meta">
                        <span className="acct-item-name">Account {i + 1}</span>
                        {addr && <span className="acct-item-addr">{shortAddr(addr)}</span>}
                      </span>
                      {active && <span className="acct-item-check" aria-hidden="true">✓</span>}
                    </button>
                    <button className="acct-key-btn" title="Export this account's private key" aria-label="Export this account's private key" onClick={() => openExport(i)}>
                      🔑
                    </button>
                  </div>
                );
              })}
              {listImportedAccounts().map((im) => {
                const active = activeAccountIndex() === im.index;
                return (
                  <div key={im.index} className="acct-item-wrap">
                    <button
                      className={`acct-item${active ? ' active' : ''}`}
                      onClick={() => switchAccount(im.index)}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className="acct-item-ava imp" aria-hidden="true">⇩</span>
                      <span className="acct-item-meta">
                        <span className="acct-item-name">
                          {im.label} <span className="acct-imp-badge">imported</span>
                        </span>
                        {/* The chain comes from the key's own curve. Hardcoding "EVM-only" here
                            would label an imported Solana key as EVM — the one thing that must never
                            be wrong, since it decides which address a user sends funds to. */}
                        <span className="acct-item-addr">
                          {shortAddr(im.address)} · {im.kind === 'sol' ? 'Solana-only' : 'EVM-only'}
                        </span>
                      </span>
                      {active && <span className="acct-item-check" aria-hidden="true">✓</span>}
                    </button>
                    <button className="acct-key-btn" title="Export this account's private key" aria-label="Export this account's private key" onClick={() => openExport(im.index)}>
                      🔑
                    </button>
                  </div>
                );
              })}
              {/* Export flow — a fresh password check, then the key with the same 45s auto-hide as
                  the seed reveal. Deliberately below the whole list so one panel serves every row. */}
              {(exportFor !== null || exportKeyVal) && (
                <div className="acct-import">
                  {exportKeyVal ? (
                    <>
                      <p className="acct-import-note">
                        🔑 <b>Private key</b> — anyone with this controls the account. Never share it or paste it into a site.
                        Auto-hides in 45s.
                      </p>
                      <button
                        type="button"
                        className="acct-import-in wl-mono"
                        style={{ textAlign: 'left', cursor: 'pointer', wordBreak: 'break-all' }}
                        title="Click to copy"
                        onClick={() => copy(exportKeyVal)}
                      >
                        {exportKeyVal}
                      </button>
                      <div className="acct-import-row">
                        <button className="btn primary" onClick={() => copy(exportKeyVal)}>
                          {copied === exportKeyVal ? 'Copied ✓' : 'Copy'}
                        </button>
                        <button className="wl-link" onClick={() => setExportKeyVal(null)}>
                          Hide
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="acct-import-note">Confirm your wallet password to reveal the private key.</p>
                      <input
                        className="acct-import-in"
                        aria-label="Wallet password"
                        placeholder="Wallet password"
                        value={exportPw}
                        onChange={(e) => setExportPw(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void doExport();
                        }}
                        type="password"
                        autoComplete="off"
                        autoFocus
                      />
                      {exportErr && <p className="acct-import-err">{exportErr}</p>}
                      <div className="acct-import-row">
                        <button className="btn primary" disabled={exportBusy || !exportPw} onClick={() => void doExport()}>
                          {exportBusy ? 'Verifying…' : 'Reveal key'}
                        </button>
                        <button
                          className="wl-link"
                          onClick={() => {
                            setExportFor(null);
                            setExportPw('');
                            setExportErr(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                className="acct-item acct-add"
                title="Derive the next HD account from your seed"
                onClick={() => addNewAccount()}
              >
                <span className="acct-item-ava add" aria-hidden="true">＋</span>
                <span className="acct-item-meta">
                  <span className="acct-item-name">Add account</span>
                </span>
              </button>
              {!importOpen ? (
                <button
                  className="acct-item acct-add"
                  title="Import an existing EVM account from its private key"
                  onClick={() => {
                    setImportOpen(true);
                    setImportErr(null);
                  }}
                >
                  <span className="acct-item-ava add" aria-hidden="true">⇩</span>
                  <span className="acct-item-meta">
                    <span className="acct-item-name">Import private key</span>
                  </span>
                </button>
              ) : (
                <div className="acct-import">
                  <div className="acct-import-row" style={{ marginBottom: 8 }}>
                    {(['evm', 'sol'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`chip${importChain === k ? ' on' : ''}`}
                        onClick={() => {
                          setImportChain(k);
                          setImportErr(null);
                        }}
                      >
                        {k === 'evm' ? 'EVM' : 'Solana'}
                      </button>
                    ))}
                  </div>
                  <input
                    className="acct-import-in"
                    aria-label={importChain === 'sol' ? 'Solana private key' : 'EVM private key'}
                    placeholder={importChain === 'sol' ? 'Solana private key (base58, [1,2,…] or 0x… 64 hex)' : 'EVM private key (0x… 64 hex)'}
                    value={importKey}
                    onChange={(e) => setImportKey(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    type="password"
                  />
                  <input className="acct-import-in" aria-label="Account label" placeholder="Label (optional)" value={importLabel} onChange={(e) => setImportLabel(e.target.value)} />
                  <input
                    className="acct-import-in"
                    aria-label="Wallet password"
                    placeholder="Wallet password (to save securely)"
                    value={importPw}
                    onChange={(e) => setImportPw(e.target.value)}
                    type="password"
                    autoComplete="off"
                  />
                  <p className="acct-import-note">
                    {importChain === 'sol'
                      ? 'Imported keys sign Solana only (devnet). Accepts a Phantom base58 key, a solana-keygen id.json array, or a 0x-hex seed.'
                      : 'Imported keys sign EVM only (Sepolia · GIWA).'}{' '}
                    Stored encrypted in your vault.
                  </p>
                  {importErr && <p className="acct-import-err">{importErr}</p>}
                  <div className="acct-import-row">
                    <button className="btn primary" disabled={importBusy || !importKey || !importPw} onClick={() => void doImportKey()}>
                      {importBusy ? 'Importing…' : 'Import'}
                    </button>
                    <button
                      className="wl-link"
                      onClick={() => {
                        setImportOpen(false);
                        setImportErr(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {id && <IdentityRows id={id} onCopy={copy} copied={copied} />}
            <SessionBar />
            <div className="wl-actions">
              <button className="btn primary" onClick={doLock}>
                Lock wallet
              </button>
              <button className="wl-link" onClick={() => setAccountMenu(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSend && (
        <div className="rcv-overlay" onClick={() => setShowSend(false)}>
          <div
            ref={sendDlgRef}
            className="rcv-modal wl-send-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Send"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalBack onClick={() => setShowSend(false)} />
            {(() => {
              const btc = sendChain === 'bitcoin-testnet';
              const sol = sendChain === 'solana-devnet';
              const giwa = sendChain === 'giwa-sepolia';
              const assets = ASSETS_FOR[sendChain];
              const sym = sendAsset;
              const netName = btc ? 'Bitcoin testnet' : sol ? 'Solana devnet' : giwa ? 'GIWA Sepolia' : 'Sepolia testnet';
              const explorerName = btc ? 'mempool.space' : sol ? 'Solana Explorer' : giwa ? 'GIWA Explorer' : 'Sepolia Etherscan';
              const nodeLabel = btc ? 'Esplora REST URL (editable)' : 'RPC URL (editable — paste your own if rate-limited)';
              // Gate "Review →" on a parseable, POSITIVE amount (+ a sane BTC fee) so a malformed
              // value ("abc", "1.2.3", "-1", "1.") can never reach the review sheet, where it would
              // otherwise skip the drain check and show a false "checks passed".
              const validAmt = ((): boolean => {
                try {
                  return BigInt(decimalToBase(sendAmt, assetOf(sendChain, sendAsset).decimals)) > 0n;
                } catch {
                  return false;
                }
              })();
              const validFee = !btc || Number(feeRate) >= 1;
              const faucetNote = btc
                ? 'Fund your tb1q… address from a Bitcoin testnet faucet to send — an empty address has no UTXOs to spend. Balance, UTXOs, and fees are read live from the testnet node.'
                : sol
                  ? 'Fund your address with devnet SOL (`solana airdrop`, or a devnet faucet) to send successfully — otherwise the node rejects it for insufficient funds, which itself proves the tx reached the real cluster.'
                  : giwa
                    ? 'Fund your address with GIWA Sepolia ETH (bridge Sepolia ETH via bridge-giwa.vercel.app, or faucet.giwa.io) to send — otherwise the node returns “insufficient funds”, which itself proves the tx reached GIWA (chainId 91342). Same EVM address as Ethereum.'
                    : 'Fund your address with Sepolia ETH (a faucet) to send successfully — otherwise the node returns “insufficient funds”, which itself proves the tx reached the real chain.';
              const tab = (c: SendChain, label: string): JSX.Element => (
                <button className={`wl-chain-tab${sendChain === c ? ' active' : ''}`} onClick={() => switchSendChain(c)} aria-pressed={sendChain === c}>
                  {label}
                </button>
              );
              return (
                <div className="wl-send">
                  <div className="wl-chain-tabs">
                    {/* An imported single-curve account can only sign its OWN curve — offering the other
                        chains' tabs lets the user switch to a chain it can never sign for (blank
                        recipient, wrong balance, throws at Sign). Show only its curve's chains. */}
                    {(() => {
                      const impKind = isActiveImported() ? activeImportedKind() : null;
                      const evmOk = impKind === null || impKind === 'evm';
                      const solOk = impKind === null || impKind === 'sol';
                      return (
                        <>
                          {evmOk && tab('giwa-sepolia', 'GIWA · Sepolia')}
                          {evmOk && tab('sepolia', 'Ethereum · Sepolia')}
                          {solOk && tab('solana-devnet', 'Solana · devnet')}
                          {impKind === null && tab('bitcoin-testnet', 'Bitcoin · testnet')}
                        </>
                      );
                    })()}
                  </div>
                  <div className="wl-send-head">
                    <span className="wl-send-title">Send on {netName}</span>
                    <span className="wl-bal">
                      balance: {balance ?? '…'} {sym}{' '}
                      <button className="wl-link" onClick={refreshBalance} aria-label="Refresh balance">
                        <span aria-hidden="true">↻</span>
                      </button>
                    </span>
                  </div>
                  {assets.length > 1 && (
                    <div className="wl-asset-tabs">
                      {assets.map((a) => (
                        <button
                          key={a.symbol}
                          className={`wl-asset-tab${sendAsset === a.symbol ? ' active' : ''}`}
                          onClick={() => switchSendAsset(a.symbol)}
                          aria-pressed={sendAsset === a.symbol}
                        >
                          {a.symbol}
                          {a.kind !== 'native' && <span className="wl-asset-kind">{a.kind === 'erc20' ? 'ERC-20' : 'SPL'}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="wl-flabel">{nodeLabel}</label>
                  <input className="wl-input" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} spellCheck={false} aria-label={nodeLabel} />
                  <label className="wl-flabel">Recipient</label>
                  <input
                    className="wl-input"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    spellCheck={false}
                    // Chain-aware: ENS (name.eth) only resolves on Ethereum Sepolia, so only that tab
                    // advertises it. GIWA is EVM but ENS-less; Solana/Bitcoin take their own formats.
                    placeholder={
                      sol ? 'Solana address · saved contact' : btc ? 'tb1q… address · saved contact' : isEvmSend ? '0x… · name.eth · saved contact' : '0x… · saved contact'
                    }
                    aria-label="Recipient"
                  />
                  {contactAddr && <p className="wl-ens-hint ok">✓ {contactAddr} · saved contact</p>}
                  {ensActive && (
                    <p className={`wl-ens-hint ${ensAddress ? 'ok' : ensResolving ? '' : 'bad'}`}>
                      {ensResolving ? '⏳ Resolving ENS…' : ensAddress ? `✓ ${ensAddress}` : '✕ No ENS address record'}
                    </p>
                  )}
                  <div className={btc ? 'wl-send-grid' : undefined}>
                    <div>
                      <label className="wl-flabel">Amount ({sym})</label>
                      <input className="wl-input" value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} inputMode="decimal" aria-label={`Amount in ${sym}`} />
                    </div>
                    {btc && (
                      <div>
                        <label className="wl-flabel">Fee (sat/vB)</label>
                        <input className="wl-input" value={feeRate} onChange={(e) => setFeeRate(e.target.value)} inputMode="numeric" aria-label="Fee rate in sat/vB" />
                      </div>
                    )}
                  </div>
                  {sendErr && <p className="wl-err" role="alert">{sendErr}</p>}
                  {reviewing ? (
                    (() => {
                      const decs = assetOf(sendChain, sendAsset).decimals;
                      let amountBase: bigint | null = null;
                      try {
                        amountBase = BigInt(decimalToBase(sendAmt, decs));
                      } catch {
                        amountBase = null;
                      }
                      let balanceBase: bigint | null = null;
                      if (balance && /^\d+(\.\d+)?$/u.test(balance.trim())) {
                        try {
                          balanceBase = BigInt(decimalToBase(balance.trim(), decs));
                        } catch {
                          balanceBase = null;
                        }
                      }
                      const priorBase = priorOutflow(sendChain, sendAsset);
                      // A non-numeric / non-positive amount must HARD BLOCK — not silently degrade the
                      // drain check to 'none' and let a known recipient show a green "checks passed"
                      // (doSend would then throw "Broadcast failed" AFTER the UI said it was fine).
                      const amountInvalid = amountBase === null || amountBase <= 0n;
                      // A SELF-SEND (the prefilled default recipient IS your own address) is definitionally
                      // NOT outflow and NOT a new counterparty — the poison check and guardBroadcast already
                      // exempt `to === me`. Exempt it here too, or a full-balance self-send mislabels "most of
                      // your wallet" and its ledger entry later BLOCKS a real send as a bogus "cumulative drain".
                      const selfSend = effectiveTo.length > 0 && ownAddr(id, sendChain).toLowerCase() === effectiveTo.toLowerCase();
                      const drain = selfSend || amountBase === null ? 'none' : assessSessionDrain({ priorBase, amountBase, balanceBase });
                      const guard = guardBroadcast({ chain: sendChain, toAddress: effectiveTo, knownAddresses: knownGoodAddresses() });
                      const newRecipient = !selfSend && isNewRecipient(effectiveTo);
                      // guardBroadcast enforces the EIP-55/HEX_40 shape for EVM chains, but for Solana/Bitcoin
                      // it only rejects an EMPTY recipient — so a `.eth` name or any garbage string would pass,
                      // "Confirm & sign" would enable, and the send would only fail deep in the address builder
                      // AFTER the UI showed it as ready. Validate the non-EVM recipient's format up front.
                      // BTC uses the real @scure decoder (accepts legacy P2PKH / P2SH / bech32 — classify's
                      // bech32-only regex would false-block spendable legacy addresses); Solana uses classify.
                      const recipientMalformed = (sol && classify(effectiveTo) !== 'sol') || (btc && !isValidBtcAddress(effectiveTo, 'testnet'));
                      // An on-chain poisoning finding blocks just as hard as a local one.
                      const chainBlocked = chainCheck?.blocked ?? [];
                      // Fold the BTC fee-rate check into the SAME hard-block the entry gate enforces. The
                      // fee input stays editable inside the review sheet, so without this a fee cleared to
                      // ""/0 after "Review →" left "Confirm & sign" enabled while the panel said "✓ checks
                      // passed" — then sendBtcTransfer broadcast with feeRate 0/NaN and failed at the node.
                      const hardBlocked = amountInvalid || !validFee || !guard.ok || drain === 'block' || chainBlocked.length > 0 || recipientMalformed;
                      const row = (color: string): { color: string; fontSize: number; margin: string } => ({ color, fontSize: 13, margin: '3px 0' });
                      return (
                        <div className="tx-review">
                          <p className="tx-review-h">Review before signing — this is irreversible</p>
                          <div className="tx-review-row">
                            <span>Amount</span>
                            <b>
                              {sendAmt} {sym}
                            </b>
                          </div>
                          <div className="tx-review-row">
                            <span>To</span>
                            <code className="tx-review-addr">{ensActive ? `${sendTo.trim()} → ${effectiveTo}` : effectiveTo}</code>
                          </div>
                          <div className="tx-review-row">
                            <span>Network</span>
                            <b>{netName}</b>
                          </div>
                          {btc && (
                            <div className="tx-review-row">
                              <span>Fee rate</span>
                              <b>{feeRate} sat/vB</b>
                            </div>
                          )}
                          <div
                            // The on-chain poisoning verdict resolves ASYNC and gates "Confirm & sign",
                            // so a screen-reader user must be TOLD when a block/warning appears (the
                            // success/error receipts already announce — this closes the gap on the safety
                            // verdict itself). Polite so it doesn't cut off the user mid-review.
                            role="status"
                            aria-live="polite"
                            style={{ marginTop: 10, borderTop: '1px solid rgba(128,128,128,0.25)', paddingTop: 8 }}
                          >
                            <div style={{ fontSize: 11, letterSpacing: '0.06em', opacity: 0.65, marginBottom: 5, textTransform: 'uppercase' }}>
                              Sentinel · GIWA-native pre-sign safety
                            </div>
                            {guard.blocked.map((b, i) => (
                              <div key={`gb${i}`} style={row('#dc2626')}>⛔ {b}</div>
                            ))}
                            {drain === 'block' && (
                              <div style={row('#dc2626')}>
                                ⛔ Cumulative drain — your sends this session would move most of this wallet. Blocked; send a smaller amount.
                              </div>
                            )}
                            {guard.warnings.map((w, i) => (
                              <div key={`gw${i}`} style={row('#d97706')}>⚠ {w}</div>
                            ))}
                            {drain === 'warn' && <div style={row('#d97706')}>⚠ This is most of your wallet balance.</div>}
                            {/* On-chain poisoning verdict — works on a first-ever send (chain is the reference). */}
                            {chainBlocked.map((b, i) => (
                              <div key={`cb${i}`} style={row('#dc2626')}>🧬 {b}</div>
                            ))}
                            {chainBlocked.length === 0 &&
                              (chainCheck?.warnings ?? []).map((w, i) => (
                                <div key={`cw${i}`} style={row('#d97706')}>🧬 {w}</div>
                              ))}
                            {chainChecking && <div style={row('#6b7280')}>🧬 Checking this address on-chain for poisoning…</div>}
                            {guard.ok && newRecipient && !chainChecking && chainBlocked.length === 0 && (
                              <div style={row('#d97706')}>
                                ⚠ First time sending to this address from this device — verify the FULL address, not just the ends.
                              </div>
                            )}
                            {/* Say exactly WHAT was compared. With no on-chain counterparties there is
                                nothing to measure a lookalike against, and claiming "passed" would be a lie. */}
                            {!chainChecking && chainCheck?.checked === true && chainBlocked.length === 0 && chainCheck.referenceCount > 0 && (
                              <div style={row('#16a34a')}>
                                ✓ Compared against the {chainCheck.referenceCount} address{chainCheck.referenceCount === 1 ? '' : 'es'} you
                                have really transacted with on-chain · no poisoning lookalike
                              </div>
                            )}
                            {!chainChecking && chainCheck?.checked === true && chainBlocked.length === 0 && chainCheck.referenceCount === 0 && (
                              <div style={row('#d97706')}>
                                ⚠ No on-chain counterparties yet, so a poisoning lookalike CANNOT be ruled out for this address —
                                poisoning imitates an address you already deal with. Check the full address against its original source.
                              </div>
                            )}
                            {!chainChecking && chainCheck !== null && chainCheck.checked === false && (
                              <div style={row('#d97706')}>🧬 Couldn’t reach the explorer — on-chain poisoning check was NOT completed.</div>
                            )}
                            {amountInvalid && <div style={row('#dc2626')}>⛔ Enter a valid amount greater than 0.</div>}
                            {!validFee && <div style={row('#dc2626')}>⛔ Enter a fee rate of at least 1 sat/vB.</div>}
                            {recipientMalformed && (
                              <div style={row('#dc2626')}>⛔ This is not a valid {sol ? 'Solana' : 'Bitcoin'} address — check the recipient.</div>
                            )}
                            {!amountInvalid && guard.ok && guard.warnings.length === 0 && drain === 'none' && !newRecipient && (
                              <div style={row('#16a34a')}>✓ Known recipient · no drain risk · checks passed on-device</div>
                            )}
                          </div>
                          <div className="wl-actions">
                            {/* Never let a signature fire while the on-chain poisoning check is still
                                running — the verdict could flip the recipient to blocked. Disable +
                                say so, rather than showing an enabled "Confirm & sign" mid-check. */}
                            <button className="btn primary" onClick={() => void doSend()} disabled={sending || hardBlocked || chainChecking}>
                              {sending ? 'Broadcasting…' : chainChecking ? 'Checking recipient…' : hardBlocked ? 'Blocked by Sentinel' : 'Confirm & sign'}
                            </button>
                            <button className="wl-link" onClick={() => setReviewing(false)} disabled={sending}>
                              Back
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="wl-actions">
                      <button
                        className="btn primary"
                        // Clear any prior send's receipt/error so a stale "✓ Broadcast" never sits
                        // beneath the review sheet of a new, different transaction.
                        onClick={() => {
                          setSendResult(null);
                          setSendErr(null);
                          setReviewing(true);
                        }}
                        disabled={sending || !effectiveTo || !validAmt || !validFee || ensResolving}
                      >
                        Review →
                      </button>
                      <button className="wl-link" onClick={() => setShowSend(false)}>
                        Close
                      </button>
                    </div>
                  )}
                  {sendResult && (
                    <div className="wl-signed" role="status" aria-live="polite">
                      <p className="wl-signed-h">✓ Broadcast to {netName}</p>
                      <code className="wl-mono">{sendResult.txid}</code>
                      <p className="wl-signed-sub">
                        <a href={sendResult.explorerUrl} target="_blank" rel="noreferrer">
                          View on {explorerName} →
                        </a>
                      </p>
                    </div>
                  )}
                  <p className="wl-send-note">{faucetNote}</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {showReceive && id && <ReceiveModal id={id} onClose={() => setShowReceive(false)} />}
      {showRevoke && <RevokeApprovalModal onClose={() => setShowRevoke(false)} />}
      {showRecover && <RecoverTxModal onClose={() => setShowRecover(false)} />}
      {showContacts && <ContactsModal onClose={() => setShowContacts(false)} />}

      {confirmWipe && (
        <div className="rcv-overlay" onClick={() => setConfirmWipe(false)}>
          <div
            ref={wipeDlgRef}
            className="rcv-modal wipe-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove this wallet?"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalBack onClick={() => setConfirmWipe(false)} />
            <p className="wipe-h">⚠️ Remove this wallet?</p>
            <p className="wipe-lead">
              This permanently deletes the encrypted vault from this browser. Your funds are only recoverable from your{' '}
              <b>recovery phrase</b> — without it they are lost forever. Type <b>REMOVE</b> to confirm.
            </p>
            <input
              className="wl-input"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="REMOVE"
              aria-label="Type REMOVE to confirm"
              spellCheck={false}
            />
            <div className="wl-actions">
              <button
                className="btn primary wl-danger-btn"
                onClick={() => void doRemove()}
                disabled={wipeConfirmText.trim().toUpperCase() !== 'REMOVE'}
              >
                Delete wallet
              </button>
              <button className="wl-link" onClick={() => setConfirmWipe(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-renders on unlock-state OR active-account change — the signal balance/insights
 *  panels watch so switching HD accounts refetches for the newly-selected wallet. */
function useWalletKey(): string {
  // Include the SIWE session token so a sign-in / sign-out performed anywhere re-renders every
  // consumer (e.g. both SessionBar instances) — currentSession() is a plain localStorage read with
  // no subscription, so without this a second SessionBar shows stale signed-in/out state.
  const snap = (): string => `${isUnlocked()}:${activeAccountIndex()}:${currentSession()?.token ?? ''}`;
  const [key, setKey] = useState(snap);
  useEffect(() => {
    const t = setInterval(() => setKey(snap()), 500);
    return () => clearInterval(t);
  }, []);
  return key;
}

/** Reactive network mode — re-renders when the Settings toggle flips testnet/mainnet.
 *  Polls (like useWalletKey) since getNetworkMode is a non-reactive localStorage read. */
function useNetworkMode(): NetworkMode {
  const [m, setM] = useState<NetworkMode>(getNetworkMode);
  useEffect(() => {
    const t = setInterval(() => setM(getNetworkMode()), 400);
    return () => clearInterval(t);
  }, []);
  return m;
}

const fmtAmount = (n: number | null): string =>
  n == null ? '—' : n === 0 ? '0' : n < 0.0001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

// Held-balance formatter: FLOOR at 6 dp (never round up). fmtAmount rounds half-up (0.9999995 → "1"),
// overstating a holding and breaking the wallet's float-free honesty invariant — the Send sheet floors
// the same asset via floorUnitsToDp, so the dashboard read higher than the sendable balance. Showing ≤
// the true amount is the safe direction. (Balances only; sends/receives/rates keep fmtAmount — flooring
// a spend amount would UNDER-state what leaves the wallet.)
const fmtHeld = (n: number | null): string =>
  n == null ? '—' : n === 0 ? '0' : n < 0.0001 ? n.toExponential(2) : (Math.floor(n * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

/**
 * Turn the raw node "insufficient funds" RPC error into a human sentence with real amounts. The
 * node emits: "insufficient funds for gas * price + value: balance B, tx cost C, overshot O" (wei
 * on the SOURCE chain) — cryptic for a user who "has funds" (often on a DIFFERENT chain). Anything
 * that isn't this exact shape passes through unchanged.
 */
function humanizeTxError(msg: string, nativeLabel = 'ETH'): string {
  // Solana solAMM reverse swap (dUSDC→SOL): the on-chain SPL-Token transfer of the dUSDC being sold
  // reverts with `custom program error: 0x1` (Token::InsufficientFunds) when the wallet holds less than
  // it is selling. Translate the hex so the user reads WHY, not a raw code. (The plan also PREFLIGHTS the
  // dUSDC balance to block this before signing — this is the net for the Auto path / a not-yet-read race.)
  if (/custom program error: 0x1\b/iu.test(msg) && /simulation failed|instruction\s+0\b/iu.test(msg)) {
    return 'The swap was rejected on-chain — most likely your dUSDC balance is too low to sell this amount. Get dUSDC first (swap SOL → USDC), then sell it back for SOL. Nothing was signed or sent.';
  }
  const m = /insufficient funds[\s\S]*?balance\s+(\d+)[\s\S]*?tx cost\s+(\d+)[\s\S]*?overshot\s+(\d+)/i.exec(msg);
  if (!m) return msg;
  const eth = (wei: string): string => {
    const n = Number(wei) / 1e18;
    return n < 0.0001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };
  return `Not enough ${nativeLabel} to cover this. You have ${eth(m[1]!)} ${nativeLabel}, but the amount + gas needs ${eth(m[2]!)} ${nativeLabel} — short by ${eth(m[3]!)} ${nativeLabel}. Try a smaller amount, or fund your ${nativeLabel} address.`;
}

/**
 * Format a base-unit amount for display, TRUNCATING the fraction — for "you receive at least"
 * figures only.
 *
 * `fmtAmount` rounds (`maximumFractionDigits`), so a guaranteed FLOOR can print higher than the
 * chain will actually deliver: 0.132694832 becomes "0.132695", a minimum the swap does not honour.
 * This does string math on the base units, so there is no float step either — the displayed floor
 * is always ≤ the real one.
 */
const fmtMinBase = (base: bigint | string, decimals: number): string => {
  const s = base.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const fracAll = decimals > 0 ? s.slice(s.length - decimals).replace(/0+$/u, '') : '';
  if (!fracAll) return whole;
  const cut = fracAll.slice(0, 6);
  // A dust-sized floor must not truncate to "0.000000" — a user reads that as nothing. When the
  // first 6 digits are all zero, show the exact fraction instead.
  return `${whole}.${/[1-9]/u.test(cut) ? cut : fracAll}`;
};

// ── Live balances: the REAL wallet, read from chains (mainnet + testnet) ──────
/**
 * Portfolio intelligence — the analytics brain's read over the API portfolio:
 * health score, diversification, allocation slices, and its insights. Everything
 * shown is COMPUTED by the deterministic engine (it analyzes, never signs); a
 * `stale` result is labeled, never hidden.
 */
function InsightsPanel(): JSX.Element | null {
  const walletKey = useWalletKey();
  const unlocked = isUnlocked();
  const session = currentSession();
  const [intel, setIntel] = useState<PortfolioInsights | null>(null);
  const [realUsd, setRealUsd] = useState<number | null>(null);

  useEffect(() => {
    // HONESTY: /v1/portfolio/insights is computed server-side for the signed-in principal — but this
    // is a NON-CUSTODIAL wallet whose real holdings live only on the device and are never sent to the
    // server, so the server returns a per-principal figure (often a demo ~$16,500) that is NOT this
    // wallet. We fetch it AND the wallet's real on-chain net worth, and only trust the insights if the
    // two AGREE (below). Signing in is not enough — the numbers must match reality.
    if (!isUnlocked() || !currentSession()) {
      setIntel(null);
      setRealUsd(null);
      return;
    }
    // Latest-wins: this effect re-runs on sign-in/out (session token) without remounting, so two
    // overlapping fetch pairs could resolve out of order and compare a mismatched intel/realUsd.
    let alive = true;
    void getInsights().then((v) => alive && setIntel(v)).catch(() => alive && setIntel(null));
    void fetchLiveBalances().then((b) => alive && setRealUsd(b?.totalUsd ?? null)).catch(() => alive && setRealUsd(null));
    return () => {
      alive = false;
    };
  }, [walletKey, session?.token]);

  if (!unlocked || !session || !intel) return null;

  // The insight numbers are only THIS wallet's if their net worth matches the real on-chain net worth
  // shown above. If they diverge (a demo/other-principal portfolio), or the real value can't be read,
  // we do NOT show borrowed figures — doctrine: never present fake data as the user's.
  const intelUsd = Number(intel.netWorthMicros) / 1e6;
  // Require BOTH totals to be POSITIVE before matching. An empty $0 wallet (the common fresh-testnet
  // case) otherwise passes the `|0-0| <= max(1, 0)` window and renders vacuous, misleading intelligence
  // ("Health 29/100", "Low diversification") for a portfolio that holds nothing.
  const agreesWithReal = realUsd != null && realUsd > 0 && intelUsd > 0 && Math.abs(intelUsd - realUsd) <= Math.max(1, realUsd * 0.02);
  if (!agreesWithReal) return null;

  const usd = (micros: string): string => `$${(Number(micros) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const pct = (w: number): string => `${(w * 100).toFixed(0)}%`;
  const topAssets = intel.allocation.byAsset.slice(0, 4);
  const SEV: Record<InsightItem['severity'], string> = { info: 'ℹ️', warn: '⚠️', critical: '🚨' };

  return (
    <section className="pf ins">
      <div className="ins-head">
        <span className="ins-title">Portfolio intelligence</span>
        {intel.stale && <span className="ins-stale">some data stale</span>}
      </div>
      <div className="ins-grid">
        <div className="ins-stat">
          <span className="ins-k">Health</span>
          <span className="ins-v ins-health">{Math.round(intel.risk.healthScore)}<small>/100</small></span>
        </div>
        <div className="ins-stat">
          <span className="ins-k">Net worth</span>
          <span className="ins-v">{usd(intel.netWorthMicros)}</span>
        </div>
        <div className="ins-stat">
          <span className="ins-k">Diversification</span>
          <span className="ins-v">{Math.round(intel.risk.diversificationScore)}<small>/100</small></span>
        </div>
        <div className="ins-stat">
          <span className="ins-k">Stable buffer</span>
          <span className="ins-v">{pct(intel.allocation.stablecoinWeight)}</span>
        </div>
      </div>
      <div className="ins-alloc">
        {topAssets.map((s: AllocationSlice) => (
          <div className="ins-slice" key={s.key} title={usd(s.valueMicros)}>
            <span className="ins-slice-k">{s.key}</span>
            <span className="ins-slice-bar">
              <span className="ins-slice-fill" style={{ width: `${Math.max(2, s.weight * 100)}%` }} />
            </span>
            <span className="ins-slice-w">{pct(s.weight)}</span>
          </div>
        ))}
      </div>
      {intel.insights.length > 0 && (
        <ul className="ins-list">
          {intel.insights.slice(0, 3).map((i) => (
            <li className="ins-item" key={i.code}>
              <span>{SEV[i.severity]}</span>
              <span>
                <b>{i.title}</b> — {i.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="ins-foot">computed by the intelligence engine over the API portfolio · analyzes only, never signs</p>
    </section>
  );
}

function LiveBalancesPanel({ variant = 'full' }: { variant?: 'net' | 'assets' | 'full' }): JSX.Element | null {
  const walletKey = useWalletKey(); // refetch on unlock OR active-account change
  const unlocked = isUnlocked();
  const [data, setData] = useState<LiveBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const netMode = useNetworkMode();

  // Latest-wins: the "Refresh net worth" button and the walletKey/sign-in effect both call load(),
  // so overlapping fetches could resolve out of order and regress the net worth to a stale value.
  const loadReqRef = useRef(0);
  const load = (force = false): void => {
    if (!isUnlocked()) {
      setData(null);
      return;
    }
    const reqId = ++loadReqRef.current;
    setLoading(true);
    void fetchLiveBalances(force)
      .then((b) => {
        if (reqId === loadReqRef.current) setData(b);
      })
      .catch(() => {
        if (reqId === loadReqRef.current) setData(null);
      })
      .finally(() => {
        if (reqId === loadReqRef.current) setLoading(false);
      });
  };
  useEffect(load, [walletKey]);

  if (!unlocked) return null;

  // Net worth for the SELECTED network (Settings toggle) — testnet OR mainnet holdings,
  // not both combined. Null when the price feed is down (→ "—").
  const netWorth =
    data == null || data.totalUsd == null
      ? null
      : data.assets.reduce((sum, a) => {
          const amt = (netMode === 'mainnet' ? a.mainnet.amount : a.testnet.amount) ?? 0;
          return sum + (a.priceUsd != null ? amt * a.priceUsd : 0);
        }, 0);
  return (
    <section className="pf lb">
      {variant !== 'assets' && (
        <div className="pf-net card">
          <span className="pf-net-label">
            Your net worth{' '}
            <button className="lb-refresh" onClick={() => load(true)} title="Refresh" aria-label="Refresh net worth" aria-busy={loading}>
              <span aria-hidden="true">{loading ? '…' : '↻'}</span>
            </button>
          </span>
          <span className="pf-net-value">
            {netWorth == null ? (
              loading ? (
                <span className="skeleton sk-nw" aria-label="Loading net worth" />
              ) : (
                '—'
              )
            ) : (
              `$${netWorth.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            )}
          </span>
          <span className="pf-net-sub">live value · {netMode === 'mainnet' ? 'mainnet' : 'testnet'} holdings</span>
        </div>
      )}
      {variant !== 'net' && (
        <div className="pf-assets">
          {(data?.assets ?? [])
            .filter((a) => (netMode === 'mainnet' ? a.mainnet.amount : a.testnet.amount) != null)
            .map((a) => (
              <LiveAssetCard key={a.symbol} a={a} netMode={netMode} />
            ))}
        </div>
      )}
    </section>
  );
}

function LiveAssetCard({ a, netMode }: { a: AssetLive; netMode: NetworkMode }): JSX.Element {
  // Show the SELECTED network's holding (Settings toggle), valued at the live price
  // (testnet at its mainnet-equivalent price, so real testnet balances aren't $0).
  const amount = netMode === 'mainnet' ? a.mainnet.amount : a.testnet.amount;
  const net = netMode === 'mainnet' ? 'mainnet' : a.testnet.network;
  const usd = a.priceUsd != null && amount != null ? amount * a.priceUsd : null;
  return (
    <div className="pf-asset card">
      <div className="pf-asset-top">
        <span className="pf-asset-sym">{a.symbol}</span>
        <span className="pf-asset-share">{a.priceUsd != null ? `$${a.priceUsd.toLocaleString()}` : '—'}</span>
      </div>
      <span className="pf-asset-val">{usd == null ? '—' : `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</span>
      <span className="pf-asset-amt">
        {fmtHeld(amount)} {a.symbol}{' '}
        <span className={`lb-net${netMode === 'mainnet' ? '' : ' lb-net-test'}`}>{net}</span>
      </span>
    </div>
  );
}


// ── The route graph: from real plan steps ────────────────────────────────────
interface RouteNode {
  label: string;
  sub?: string;
  kind: 'asset' | 'step';
}
function routeNodes(plan: ExecutionPlan): RouteNode[] {
  const nodes: RouteNode[] = [];
  // Rebalance: `assets` is a SET, not an ordered from→to path — assets[0] is the TARGET
  // stablecoin and the rest are the sources sold into it. The generic first→last logic
  // below would mislabel it (target → a random source), so handle it explicitly.
  if (plan.intentKind === 'rebalance') {
    const target = plan.assets[0];
    const sources = plan.assets.slice(1);
    nodes.push({ label: sources.length > 1 ? `${sources.length} assets` : (sources[0] ?? 'You'), kind: 'asset' });
    for (const s of plan.steps) nodes.push({ label: titleCase(s.kind), sub: chainNameSettled(s.chainId), kind: 'step' });
    if (target) nodes.push({ label: target, kind: 'asset' });
    return nodes;
  }
  const from = plan.assets[0];
  nodes.push({ label: from ?? 'You', kind: 'asset' });
  // A transfer settles per-asset (ETH→GIWA, USDC→Ethereum Sepolia, …) — use the asset-aware label so
  // the route graph agrees with Stage 0 and the receipt. Other intents settle by the step's chain.
  for (const s of plan.steps)
    nodes.push({
      label: titleCase(s.kind),
      sub:
        plan.intentKind === 'transfer'
          ? transferSettlementLabel(from)
          : plan.intentKind === 'stake'
            ? stakeSettlementLabel(from)
            : chainNameSettled(s.chainId),
      kind: 'step',
    });
  const to = plan.assets[plan.assets.length - 1];
  if (to && to !== from) nodes.push({ label: to, kind: 'asset' }); // swap/bridge: destination asset
  else if (plan.intentKind === 'transfer') nodes.push({ label: 'Recipient', kind: 'asset' });
  // else (stake): the step is terminal — no trailing node.
  return nodes;
}
function RouteGraph({ plan }: { plan: ExecutionPlan }): JSX.Element {
  const nodes = routeNodes(plan);
  return (
    <div className="route">
      {nodes.map((n, i) => (
        <div className="route-seg" key={`${n.label}-${i}`} style={{ '--i': i } as CSSProperties}>
          {i > 0 && <span className="route-arrow">→</span>}
          <div className={`route-node ${n.kind}`}>
            <span className="route-node-label">{n.label}</span>
            {n.sub && <span className="route-node-sub">{n.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Authorization verdict + terminal execution ───────────────────────────────
function AuthzView({ permission }: { permission: Permission }): JSX.Element {
  return (
    <div className={`authz ${permission.mayProceedToSign ? 'authz-allow' : 'authz-deny'}`}>
      <div className="authz-head">
        <span className="gate">{GATE_LABEL[permission.gate]}</span>
        <span className="drivenby">checked by {permission.drivenBy.join(' + ')}</span>
      </div>
      {permission.reasons.length > 0 && (
        <ul className="reasons">
          {permission.reasons.map((r, i) => (
            <li key={`${i}-${r}`}>{r}</li>
          ))}
        </ul>
      )}
      {permission.requirements.length > 0 && (
        <div className="chips">
          {permission.requirements.map((r, i) => (
            <span key={`${r.kind}-${i}`} className="chip">
              {requirementLabel(r)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── A single timeline stage ──────────────────────────────────────────────────
function Stage({
  i,
  icon,
  title,
  state,
  children,
}: {
  i: number;
  icon: string;
  title: string;
  state: 'done' | 'active' | 'pending';
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`stage stage-${state}`} style={{ '--i': i } as CSSProperties}>
      <div className="stage-rail">
        <span className="stage-dot">{state === 'done' ? '✓' : icon}</span>
      </div>
      <div className="stage-body">
        <span className="stage-title">{title}</span>
        <div className="stage-content">{children}</div>
      </div>
    </div>
  );
}

// ── The AI planning flow — the differentiator ────────────────────────────────
type FlowPhase = 'planned' | 'authorizing' | 'authorized' | 'executing' | 'done';

export interface ActivityItem {
  id: string;
  kind: string;
  status: ExecutionStatus;
  chainId: string;
  txid?: string;
  /** Direct explorer link for the txid, when known (makes the row clickable). */
  explorerUrl?: string;
}

/**
 * A Jumper-style cross-chain bridge across the wallet's chains (Sepolia ⇄ GIWA ⇄
 * Solana), any direction. Same-asset routes go 1:1 (minus fee); cross-asset (ETH⇄SOL)
 * converts at the live rate. The wallet deposits to the operator on the source chain
 * (real tx); a relayer releases on the destination (real tx). Operator-secured.
 */
function BridgeView({
  me,
  onActivity,
  onUpdate,
}: {
  me: WalletIdentity | null;
  onActivity: (item: ActivityItem) => void;
  onUpdate: (id: string, patch: Partial<ActivityItem>) => void;
}): JSX.Element {
  const ids = Object.keys(BRIDGE_CHAINS);
  // Default to the ONE supported route (Sepolia → GIWA canonical), so the tab opens on something
  // that works rather than a cross-chain combo the deliverability gate refuses.
  const [fromId, setFromId] = useState('sepolia');
  const [toId, setToId] = useState('giwa');
  const [amount, setAmount] = useState('0.05');
  const [recipient, setRecipient] = useState('');
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'depositing' | 'waiting' | 'done'>('idle');
  const [srcTx, setSrcTx] = useState<EvmSendResult | null>(null);
  const [destTx, setDestTx] = useState<{ txid: string; explorerUrl: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Clear the bridge route + quote on a network toggle: the operator/canonical routes are testnet, so a
  // testnet↔mainnet switch must not leave a stale route/quote/tx on screen (route-clear, ADR-0055).
  const bridgeNetMode = useNetworkMode();
  useEffect(() => {
    setQuote(null);
    setPhase('idle');
    setSrcTx(null);
    setDestTx(null);
    setErr(null);
  }, [bridgeNetMode]);
  const unlocked = isUnlocked();
  // Synchronous re-entrancy latch — `busy` is async phase state that may not flush between two fast
  // taps, so both would fire a real bridgeDeposit; on SOL/BTC (no nonce dedup) BOTH settle. This is
  // the exact button that lost 0.05 SOL on 2026-07-24. Mirrors BridgeFlow's bridgingRef.
  const bridgingRef = useRef(false);
  // Mounted flag: leaving the Bridge tab unmounts this view mid-poll — stop touching local state and
  // stop the ~100s arrival loop. The deposit is still recorded to the (parent-owned) Activity panel.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const from = BRIDGE_CHAINS[fromId];
  const to = BRIDGE_CHAINS[toId];
  const myAddr = (id: string): string => {
    const c = BRIDGE_CHAINS[id];
    if (!me || !c) return '';
    return c.kind === 'evm' ? me.evm.address : c.kind === 'bitcoin' ? me.btc.address : me.sol.address;
  };

  useEffect(() => {
    if (toId === fromId) {
      const other = ids.find((i) => i !== fromId);
      if (other) setToId(other);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId]);
  useEffect(() => {
    setRecipient(myAddr(toId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toId, me?.evm.address, me?.sol.address, me?.btc.address]);

  // STRICT parse (rejects '1.05.5', '-0.5', exponents) — the same parser the send/swap paths use, so
  // a malformed amount blocks (amountBase '0' ⇒ no quote ⇒ button disabled) instead of silently
  // signing a wrong amount. The old local parser dropped the sign and extra dot-segments.
  const amountBase = ((): string => {
    try {
      return String(decimalToBase(amount.trim(), from.decimals));
    } catch {
      return '0';
    }
  })();

  const quoteKey = `${fromId}>${toId}:${amountBase}`;
  useEffect(() => {
    if (BigInt(amountBase) <= 0n || fromId === toId) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    let cancelled = false;
    void bridgeQuote(fromId, toId, amountBase)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null))
      .finally(() => !cancelled && setQuoting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const swapDir = (): void => {
    const f = fromId;
    setFromId(toId);
    setToId(f);
    setPhase('idle');
    setSrcTx(null);
    setDestTx(null);
  };

  // The SAME deliverability gate the chat flow uses. This screen was missed when that gate landed,
  // which left the exact button that lost 0.05 SOL on 2026-07-24 fully live — a fix applied to one
  // of two entry points is not a fix. `from.asset` is the asset that actually leaves this chain.
  const deliverable = bridgeRouteDeliverable({ fromId, toId, asset: from?.asset ?? 'ETH', recipient: recipient.trim() || undefined, sender: me?.evm.address });
  // Canonical vs relayed — mirror BridgeFlow. Only Sepolia→GIWA ETH to your OWN address rides the
  // canonical L1StandardBridge (bridgeEthToGiwa). Anything else would be the custodial operator path,
  // which is NOT wired into the product (prior operator deposits were lost silently). The header
  // claims "canonical · non-custodial", so run() MUST actually take the canonical path — the old code
  // always called bridgeDeposit (operator), contradicting the label. The deliverability gate refuses
  // every non-canonical route, so the relayed arm below is only a defensive fallback.
  const canonical =
    fromId === 'sepolia' &&
    toId === 'giwa' &&
    (from?.asset ?? 'ETH') === 'ETH' &&
    (recipient.trim() === '' || recipient.trim().toLowerCase() === (me?.evm.address ?? '').toLowerCase());

  const run = async (): Promise<void> => {
    if (!deliverable.ok) {
      setErr(deliverable.reason);
      return;
    }
    if (bridgingRef.current) return; // a deposit is already in flight — ignore the double-click/tap
    bridgingRef.current = true;
    setErr(null);
    setSrcTx(null);
    setDestTx(null);
    setPhase('depositing');
    try {
      const dep = canonical
        ? await bridgeEthToGiwa({ ethAmount: amount })
        : await bridgeDeposit({ fromId, toId, amountBase, recipient: recipient.trim() });
      const since = Math.floor(Date.now() / 1000);
      // ONE bridge row: added as running (deposit done), then flipped to completed when
      // the relayer's release lands — no more permanently-"pending" duplicate row.
      // Record it UNCONDITIONALLY: the funds have moved, and the Activity panel is parent-owned, so
      // the row survives even if the user has already navigated away from the Bridge tab.
      const bridgeId = dep.txid;
      onActivity({ id: bridgeId, kind: 'bridge', status: 'running', chainId: `${from.label} → ${to.label}`, txid: dep.txid, explorerUrl: dep.explorerUrl });
      if (mountedRef.current) {
        setSrcTx(dep);
        setPhase('waiting');
      }
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!mountedRef.current) return; // left the tab — stop polling; the deposit is on-chain and in Activity
        const rel = await findBridgeRelease(toId, recipient.trim(), since);
        if (rel) {
          setDestTx(rel);
          setPhase('done');
          onUpdate(bridgeId, { status: 'completed', txid: rel.txid, explorerUrl: rel.explorerUrl });
          return;
        }
      }
      setPhase('done'); // deposit landed; relayer release still settling
      onUpdate(bridgeId, { status: 'parked' }); // release not seen yet — surfaced as pending-settlement
    } catch (e) {
      if (mountedRef.current) {
        setErr(e instanceof Error ? humanizeTxError(e.message, fromId === 'sepolia' ? 'Sepolia ETH' : from?.asset ?? 'ETH') : 'Bridge failed');
        setPhase('idle');
      }
    } finally {
      bridgingRef.current = false;
    }
  };

  const busy = phase === 'depositing' || phase === 'waiting';
  const canRun = unlocked && quote != null && recipient.trim() !== '' && !busy;
  const recvDisplay = quote ? fmtAmount(Number(quote.destAmountBase) / 10 ** quote.destDecimals) : '—';

  return (
    <section className="hv">
      <div className="sect-head">
        <h2 className="sect-title">Bridge</h2>
        <span className="brg-sub">Move value across chains · Sepolia → GIWA is canonical OP-Stack (non-custodial, ~60s) · Solana ⇄ EVM and other same-realism routes are operator-assisted</span>
      </div>
      <div className="card brg-card">
        <div className="brg-leg">
          <div className="brg-leg-top">
            <span className="brg-label">From</span>
            <select
              className="brg-select"
              value={fromId}
              onChange={(e) => {
                setFromId(e.target.value);
                setPhase('idle');
                setSrcTx(null);
                setDestTx(null);
              }}
            >
              {ids.map((i) => (
                <option key={i} value={i}>
                  {BRIDGE_CHAINS[i].label}
                </option>
              ))}
            </select>
          </div>
          <div className="brg-amt">
            <input className="brg-amt-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
            <span className="brg-asset">{from.asset}</span>
          </div>
        </div>

        <button className="brg-swap" onClick={swapDir} aria-label="Reverse direction" type="button">
          ⇅
        </button>

        <div className="brg-leg">
          <div className="brg-leg-top">
            <span className="brg-label">To</span>
            <select className="brg-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              {ids
                .filter((i) => i !== fromId)
                .map((i) => (
                  <option key={i} value={i}>
                    {BRIDGE_CHAINS[i].label}
                  </option>
                ))}
            </select>
          </div>
          <div className="brg-amt receive">
            <span className="brg-recv">{quoting ? '…' : recvDisplay}</span>
            <span className="brg-asset">{to.asset}</span>
          </div>
        </div>

        <label className="brg-recip">
          <span>Recipient on {to.label}</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} spellCheck={false} />
        </label>

        <div className="brg-route">
          <span>{quote ? (quote.sameAsset ? '1 : 1 · same asset' : `≈ ${fmtAmount(quote.rate)} ${to.asset} / ${from.asset}`) : '—'}</span>
          <span>
            {(BRIDGE_FEE_BPS / 100).toFixed(2)}% fee · ~15s
          </span>
        </div>

        {!deliverable.ok ? (
          <p className="authz-deny err-line">🛑 Not available yet — {deliverable.reason}</p>
        ) : !unlocked ? (
          <p className="brg-note muted">Unlock your wallet to bridge.</p>
        ) : (
          <>
            {deliverable.note && <p className="brg-note muted">ℹ️ {deliverable.note}</p>}
            <button className="btn primary brg-go" disabled={!canRun} onClick={() => void run()} type="button">
              {phase === 'depositing' ? 'Signing deposit…' : phase === 'waiting' ? 'Relayer releasing…' : `Bridge ${from.asset} → ${to.label}`}
            </button>
          </>
        )}

        {err && <p className="brg-err err-line">{err}</p>}

        {(srcTx || destTx || busy) && (
          <div className="brg-status">
            <div className={`brg-step${srcTx ? ' done' : phase === 'depositing' ? ' active' : ''}`}>
              <b>1 · Deposit on {from.label}</b>
              {srcTx ? (
                <a href={srcTx.explorerUrl} target="_blank" rel="noreferrer">
                  {srcTx.txid.slice(0, 14)}… →
                </a>
              ) : (
                <span className="muted">signing…</span>
              )}
            </div>
            <div className={`brg-step${destTx ? ' done' : phase === 'waiting' ? ' active' : ''}`}>
              <b>2 · Release on {to.label}</b>
              {destTx ? (
                <a href={destTx.explorerUrl} target="_blank" rel="noreferrer">
                  {destTx.txid.slice(0, 14)}… →
                </a>
              ) : phase === 'waiting' ? (
                <span className="muted">operator releasing…</span>
              ) : (
                <span className="muted">pending</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface RealTransfer {
  asset: string;
  to: string;
  amountBase: string;
  chain: ChainId;
  chainLabel: string;
  /** True when this broadcasts to a REAL mainnet (needs the mainnet confirm + spend-cap guard). */
  isMainnet: boolean;
  /** The transfer's USD notional, when the plan priced it — feeds the mainnet spend cap. */
  amountUsd?: number;
}

/** If this plan is a native transfer the browser wallet can really sign+broadcast,
 *  return its concrete params (from the server plan); otherwise null. Network follows the
 *  user's explicit network mode (default TESTNET); mainnet is native-ETH only and is gated
 *  by the guard's confirm + spend cap, never silently. */
function executableTransfer(plan: ExecutionPlan): RealTransfer | null {
  if (plan.intentKind !== 'transfer') return null;
  const p = plan.steps[0]?.params;
  if (!p || typeof p.to !== 'string' || typeof p.amountBase !== 'string' || typeof p.asset !== 'string') return null;
  if (!isExecutableAsset(p.asset)) return null;
  const a = p.asset.toUpperCase();
  const amountUsd = plan.quote?.youSend?.valueMicros ? Number(plan.quote.youSend.valueMicros) / 1e6 : undefined;
  const usd = amountUsd !== undefined ? { amountUsd } : {};
  // Native SOL runs on MAINNET in Mainnet mode (real funds, gated by the mainnet-ack + spend-cap guard);
  // else Solana devnet. SOL is native — no token map to get wrong — so the mainnet path is safe to wire.
  if (a === 'SOL') {
    return getNetworkMode() === 'mainnet'
      ? { asset: a, to: p.to, amountBase: p.amountBase, chain: 'solana', chainLabel: 'Solana mainnet', isMainnet: true, ...usd }
      : { asset: a, to: p.to, amountBase: p.amountBase, chain: 'solana-devnet', chainLabel: 'Solana devnet', isMainnet: false, ...usd };
  }
  // BTC native runs on testnet only (mainnet BTC broadcast isn't wired).
  if (a === 'BTC') return { asset: a, to: p.to, amountBase: p.amountBase, chain: 'bitcoin-testnet', chainLabel: 'Bitcoin testnet', isMainnet: false, ...usd };
  // EVM: mainnet only in Mainnet mode AND only native ETH (mainnet ERC-20 needs a verified token map).
  if (getNetworkMode() === 'mainnet' && a === 'ETH') {
    return { asset: a, to: p.to, amountBase: p.amountBase, chain: 'ethereum', chainLabel: 'Ethereum mainnet', isMainnet: true, ...usd };
  }
  // GIWA-native fork: a native-ETH testnet transfer settles on GIWA THROUGH the deployed
  // IntentExecutor contract (executeTransferStep routes it there). Falls back to Sepolia
  // when no executor is configured, and ERC-20s stay on Sepolia (no GIWA token map yet).
  if (a === 'ETH' && GIWA_INTENT_EXECUTOR) {
    return { asset: a, to: p.to, amountBase: p.amountBase, chain: 'giwa-sepolia', chainLabel: 'GIWA Sepolia', isMainnet: false, ...usd };
  }
  return { asset: a, to: p.to, amountBase: p.amountBase, chain: 'sepolia', chainLabel: 'Sepolia', isMainnet: false, ...usd };
}

interface RealSwap {
  fromSym: string;
  toSym: string;
  amountInBase: string;
}

/** If this plan is a swap the browser can quote + execute on Sepolia Uniswap, its params. */
function executableSwap(plan: ExecutionPlan): RealSwap | null {
  if (plan.intentKind !== 'swap') return null;
  const fromSym = plan.quote.youSend.symbol;
  const toSym = plan.quote.youReceiveMin?.symbol ?? plan.steps[0]?.params?.['to'];
  const amountInBase = plan.quote.youSend.base;
  if (!fromSym || !toSym || !amountInBase) return null;
  // The GIWA-native ETH⇄{USDC,gUSDC} pair executes on our own SimpleAMM, but isSwappablePair (Sepolia
  // Uniswap: USDC/ETH/WETH) and isSolammPair (Solana SOL⇄dUSDC) both miss gUSDC — so "swap ETH for gUSDC"
  // (the flagship GIWA phrasing) was refused as "not executable" while the identical USDC swap ran on the
  // SAME AMM. Mirror PlanFlow's `giwaSwap` predicate so the gate matches what actually executes.
  const a = fromSym.toUpperCase();
  const b = toSym.toUpperCase();
  const isGiwaStable = (s: string): boolean => s === 'USDC' || s === 'GUSDC';
  const giwaAmmPair = GIWA_AMM !== '' && ((a === 'ETH' && isGiwaStable(b)) || (isGiwaStable(a) && b === 'ETH'));
  if (!isSwappablePair(fromSym, toSym) && !isSolammPair(fromSym, toSym) && !giwaAmmPair) return null;
  return { fromSym: a, toSym: b, amountInBase };
}

interface RealSwapSend {
  fromSym: string;
  toSym: string;
  amountInBase: string;
  recipient: string;
  /** The chain BOTH legs settle on — taken from the plan, never assumed. */
  chainId: string;
  venue: SwapSendVenue;
}

/**
 * If a compound swap-and-send can be executed for real in-browser, return its concrete params.
 *
 * The venue decision lives in `swapSendVenue` (broadcast.ts), keyed on the PLAN's own chainId — so
 * this gate widens to every wired pool (GIWA ETH⇄gUSDC, solAMM SOL⇄dUSDC, both directions) without
 * this function knowing anything chain-specific beyond which address family each venue signs for.
 *
 * Still refused, deliberately: any plan whose two legs sit on DIFFERENT chains. There is no
 * cross-chain route in this wallet, so those stay plan-level and nothing is signed.
 */
function executableSwapAndSend(plan: ExecutionPlan): RealSwapSend | null {
  if (plan.intentKind !== 'swap_and_send') return null;
  const swapStep = plan.steps[0];
  const sendStep = plan.steps[plan.steps.length - 1];
  const fromSym = plan.quote.youSend.symbol?.toUpperCase();
  const toSym = plan.quote.youReceiveMin?.symbol?.toUpperCase();
  const amountInBase = plan.quote.youSend.base;
  const to = sendStep?.params?.['to'];
  const recipient = typeof to === 'string' ? to : null;
  const chainId = swapStep?.chainId;
  if (!fromSym || !toSym || !amountInBase || !recipient || !chainId) return null;
  if (sendStep?.chainId !== chainId) return null; // cross-chain compound — no route exists
  const venue = swapSendVenue(chainId, fromSym, toSym);
  if (!venue) return null;
  // The recipient must belong to the venue's address family, or leg 2 could not be signed at all.
  const addrOk =
    venue === 'giwa' ? /^0x[0-9a-fA-F]{40}$/u.test(recipient) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(recipient);
  if (!addrOk) return null;
  return { fromSym, toSym, amountInBase, recipient, chainId, venue };
}

interface RealStake {
  asset: string;
  amountBase: string;
  chain: ChainId;
  chainLabel: string;
}

/**
 * If this plan is an ETH stake the browser can REALLY execute on-chain (a SimpleStaking pool is
 * deployed + configured), return its params. Prefers GIWA Sepolia (the flagship), falls back to
 * Ethereum Sepolia. SOL/POL staking isn't wired for real execution here yet → null (plan-level).
 */
function executableStake(plan: ExecutionPlan): RealStake | null {
  if (plan.intentKind !== 'stake') return null;
  const p = plan.steps[0]?.params;
  if (!p || typeof p.asset !== 'string' || typeof p['amountBase'] !== 'string') return null;
  const asset = p.asset.toUpperCase();
  const amountBase = p['amountBase'] as string;
  if (asset === 'ETH') {
    if (canStakeOn('giwa-sepolia')) return { asset, amountBase, chain: 'giwa-sepolia', chainLabel: 'GIWA Sepolia' };
    if (canStakeOn('sepolia')) return { asset, amountBase, chain: 'sepolia', chainLabel: 'Sepolia' };
    return null;
  }
  if (asset === 'SOL' && canStakeSol()) return { asset, amountBase, chain: 'solana-devnet', chainLabel: 'Solana devnet' };
  return null;
}

function RealExecView({ tx, transfer }: { tx: EvmSendResult; transfer: RealTransfer }): JSX.Element {
  return (
    <div className="wl-signed" role="status" aria-live="polite">
      <p className="wl-signed-h">✓ Signed in your browser &amp; broadcast to {transfer.chainLabel}</p>
      <code className="wl-mono">{tx.txid}</code>
      <p className="wl-signed-sub">
        <a href={tx.explorerUrl} target="_blank" rel="noreferrer">
          View on explorer →
        </a>
      </p>
    </div>
  );
}

function RealSwapExecView({ tx, venue }: { tx: EvmSendResult; venue: 'giwa' | 'solana' | 'uniswap' }): JSX.Element {
  // "broadcast", not "executed": these standalone-swap paths broadcast the signed tx (node-accepted)
  // but don't wait for a receipt, so an on-chain minOut revert is possible — say what actually happened,
  // matching the Uniswap wording and the app-wide honest-broadcast doctrine. The explorer link confirms.
  const heading =
    venue === 'giwa'
      ? '✓ Swap signed in your browser & broadcast to our GIWA AMM'
      : venue === 'solana'
        ? '✓ Swap signed in your browser & broadcast to our Solana solAMM'
        : '✓ Uniswap swap signed in your browser & broadcast to Sepolia';
  const link =
    venue === 'giwa' ? 'View on GIWA explorer →' : venue === 'solana' ? 'View on Solana explorer →' : 'View on Sepolia Etherscan →';
  return (
    <div className="wl-signed" role="status" aria-live="polite">
      <p className="wl-signed-h">{heading}</p>
      <code className="wl-mono">{tx.txid}</code>
      <p className="wl-signed-sub">
        <a href={tx.explorerUrl} target="_blank" rel="noreferrer">
          {link}
        </a>
      </p>
    </div>
  );
}

/** The two-leg compound result: the GIWA swap tx AND the follow-on gUSDC send tx, each with
 *  its own explorer link — proof that BOTH legs actually executed on-chain, not just planned. */
function SwapSendExecView({ res }: { res: SwapAndSendResult }): JSX.Element {
  // Use the OUTPUT asset's real decimals + symbol + chain — NOT a hardcoded gUSDC/GIWA, which
  // mislabelled (and mis-scaled ~1e12x) every route except ETH→gUSDC.
  const received = fmtAmount(Number(res.receivedBase) / 10 ** res.outDecimals);
  const venue = res.chainLabel.startsWith('Solana') ? 'Solana solAMM' : 'GIWA AMM';
  return (
    <div className="wl-signed" role="status" aria-live="polite">
      <p className="wl-signed-h">✓ Converted on our {venue}, then forwarded {received} {res.outSymbol} — both on {res.chainLabel}</p>
      <p className="wl-signed-sub" style={{ marginTop: 6 }}>
        <b>1 · Swap</b> <code className="wl-mono">{res.swap.txid}</code>{' '}
        <a href={res.swap.explorerUrl} target="_blank" rel="noreferrer">
          view →
        </a>
      </p>
      <p className="wl-signed-sub">
        <b>2 · Send</b> <code className="wl-mono">{res.send.txid}</code>{' '}
        <a href={res.send.explorerUrl} target="_blank" rel="noreferrer">
          view →
        </a>
      </p>
    </div>
  );
}

/** The signed-stake receipt. Like the transfer/swap receipts, the tx is signed in-browser and
 *  broadcast — NOT receipt-confirmed here — so the wording says "broadcast", not "staked" (an
 *  on-chain revert is still possible; a completed-state verb would over-claim). */
function StakeExecView({ tx, stake }: { tx: EvmSendResult; stake: RealStake }): JSX.Element {
  return (
    <div className="wl-signed" role="status" aria-live="polite">
      <p className="wl-signed-h">✓ Stake signed in your browser &amp; broadcast to {stake.chainLabel} via SimpleStaking</p>
      <code className="wl-mono">{tx.txid}</code>
      <p className="wl-signed-sub">
        <a href={tx.explorerUrl} target="_blank" rel="noreferrer">
          View on explorer →
        </a>
      </p>
    </div>
  );
}

/**
 * The chat bridge flow, for ANY route the wallet can bridge (Sepolia ⇄ GIWA ⇄ Solana ⇄ Bitcoin).
 *
 * Two execution paths, and the choice matters:
 *   • Sepolia → GIWA in ETH, to your own address ⇒ GIWA's CANONICAL OP Stack L1StandardBridge.
 *     Non-custodial, no third party. Always preferred when it applies.
 *   • every other route ⇒ the operator/relayer bridge the Bridge tab uses (deposit on the source,
 *     release on the destination). Custodial for the few minutes in between, so the UI says so.
 */
// Bridge deposits carry the same remount-double-broadcast risk as PlanFlow (both live in the
// persistent AI-chat turns). Keyed by the turn's stable flowKey, this blocks a second deposit and
// restores the receipt after a section navigation remounts the flow.
const EXECUTED_BRIDGES = new Map<string, EvmSendResult>();
const INFLIGHT_BRIDGES = new Set<string>();
// Durable twin of BridgeFlow's autoTriedRef: a bridge whose Auto-deposit was ATTEMPTED (success OR
// failure) this session. A failed deposit is not in EXECUTED_BRIDGES and autoTriedRef resets on unmount,
// so a section-nav remount re-signed the still-armed, IRREVERSIBLE L1 deposit. Cleared with the arming sets.
const BRIDGE_AUTO_TRIED = new Set<string>();
// The arrival-watcher SEED, persisted alongside the deposit so a remount (which restores the deposit
// from EXECUTED_BRIDGES) can RESUME the watch — otherwise the "bridge in" Activity row is stranded
// on 'running' forever and the card contradicts itself (deposit done, arrival stage says "not yet").
type BridgeWatch = { since: number; before: bigint | null; rowId: string; l1TxHash: string; valueBase: string };
const BRIDGE_WATCH = new Map<string, BridgeWatch>();

function BridgeFlow({
  route,
  flowKey,
  onExecuted,
  onUpdate,
}: {
  route: BridgeRoute;
  flowKey: string;
  onExecuted?: (item: ActivityItem) => void;
  onUpdate?: (id: string, patch: Partial<ActivityItem>) => void;
}): JSX.Element {
  // Restore a prior deposit (survives remount) so we never re-bridge and the receipt persists.
  const bridged = EXECUTED_BRIDGES.get(flowKey) ?? null;
  const [phase, setPhase] = useState<'planned' | 'bridging' | 'done'>(bridged ? 'done' : 'planned');
  const [tx, setTx] = useState<EvmSendResult | null>(bridged);
  const [err, setErr] = useState<string | null>(null);
  const unlocked = isUnlocked();
  // Synchronous in-flight latch — the deposit button is render-gated on `phase`, which
  // updates asynchronously, so a fast double-click could otherwise fire two real deposits.
  const bridgingRef = useRef(false);

  const from = BRIDGE_CHAINS[route.fromId];
  const to = BRIDGE_CHAINS[route.toId];
  const amount = route.amount ?? '0';
  // A null/0/sub-wei amount must NOT be signable — "bridge to giwa" / "bridge 0 ETH" would otherwise
  // broadcast a real 0-value L1 deposit (gas burned, nothing bridged) and the arrival watcher could
  // then false-match an unrelated 0-value tx. Gate the button + run() on a positive base amount.
  const amountBase = ((): bigint => {
    try {
      return BigInt(decimalToBase(amount, from?.decimals ?? 18));
    } catch {
      return 0n;
    }
  })();
  const hasAmount = amountBase > 0n;
  // The canonical bridge only covers L1→L2 ETH into your own address; anything else is relayed.
  const canonical = route.fromId === 'sepolia' && route.toId === 'giwa' && route.asset === 'ETH' && !route.recipient;
  // …and a relayed route has NO relayer behind it, so it must never be signed. This is a refusal
  // rather than a warning because the failure is silent, total and irreversible — see
  // `bridgeRouteDeliverable`, which lists the two deposits already lost that way.
  const deliverable = bridgeRouteDeliverable(route);
  /** Where the funds land: an explicitly named recipient, else this wallet's own address there. */
  const destAddr = ((): string => {
    if (route.recipient) return route.recipient;
    const me = currentIdentity();
    if (!me || !to) return '';
    return to.kind === 'evm' ? me.evm.address : to.kind === 'bitcoin' ? me.btc.address : me.sol.address;
  })();

  // ── The INCOMING leg ────────────────────────────────────────────────────────
  // A bridge is two transactions and the second one is the one the user actually cares about, but
  // only the outgoing deposit was ever shown — and the activity row was marked ✓ the moment it was
  // signed, claiming "done" while nothing had arrived yet. So: watch the destination, show the
  // credit with its own tx, and count down to the expected arrival instead of going silent.
  // Measured, not guessed: on a real deposit the L1 tx landed at 12:14:36 and the L2 credit at
  // 12:15:38 — 62s. A 30s countdown would spend most of every bridge saying "taking longer than
  // usual", which trains the user to distrust a timer that is actually fine.
  const ETA_SECONDS = 75;
  // Resume the arrival watch after a remount that restored the deposit — the polling effect re-detects
  // the credit (findBridgeCredit is idempotent) and drives the row + card to a terminal state.
  const [watch, setWatch] = useState<BridgeWatch | null>(() => (bridged ? BRIDGE_WATCH.get(flowKey) ?? null : null));
  const [arrival, setArrival] = useState<{ txid: string; explorerUrl: string } | null>(null);
  const [credited, setCredited] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  // True once the arrival watch reached a terminal (arrived / gave up). The watcher only runs while
  // BridgeFlow is mounted (the AI section); if the user leaves to another tab BEFORE terminal, the
  // parent-owned "bridge in" Activity row would spin 'running' with no watcher. On unmount we park it
  // (a remount resumes the watch from BRIDGE_WATCH and re-detects).
  const bridgeTerminalRef = useRef(false);
  const watching = watch !== null && arrival === null && credited === null && !gaveUp;

  useEffect(() => {
    if (!watch) return;
    let live = true;
    const t0 = Date.now();
    const ticker = setInterval(() => {
      if (live) setElapsed(Math.round((Date.now() - t0) / 1000));
    }, 1000);
    void (async () => {
      // ~5 minutes of polling: an OP Stack deposit is usually ~30s, but a busy sequencer or a slow
      // relayer can lag well past that, and giving up early would look like a lost bridge.
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!live) return;
        const [creditTx, now] = await Promise.all([
          findBridgeCredit(route.toId, destAddr, watch.since, { l1TxHash: watch.l1TxHash, valueBase: watch.valueBase }),
          bridgeChainBalanceBase(route.toId, destAddr),
        ]);
        if (!live) return;
        // Require the balance to have grown by AT LEAST the bridged amount — on a self-bridge
        // (destAddr is your own address), a smaller UNRELATED inbound credit must not be mistaken for
        // the bridge arriving (and its value shown as the "credited" amount).
        const delta = watch.before !== null && now !== null ? now - watch.before : 0n;
        const expected = BigInt(watch.valueBase);
        const grew = expected > 0n && delta >= expected;
        if (creditTx || grew) {
          if (grew) {
            setCredited(baseToDecimal(watch.valueBase, to?.decimals ?? 18)); // the bridged amount, not the raw balance delta
          }
          if (creditTx) setArrival(creditTx);
          onUpdate?.(watch.rowId, {
            status: 'completed',
            ...(creditTx ? { txid: creditTx.txid, explorerUrl: creditTx.explorerUrl } : {}),
          });
          bridgeTerminalRef.current = true;
          clearInterval(ticker); // arrived — freeze the counter (else "Arrived in Ns" ticks up forever)
          return;
        }
      }
      if (live) setGaveUp(true); // stopped watching — the deposit itself still stands
      // Move the incoming-leg Activity row to a terminal 'parked' state (not a perpetual "running"
      // spinner) when arrival auto-detection gives up — the deposit landed; the release is still
      // settling. Mirrors BridgeView's parked handling.
      bridgeTerminalRef.current = true;
      onUpdate?.(watch.rowId, { status: 'parked' });
      clearInterval(ticker); // gave up — stop the counter too
    })();
    return () => {
      live = false;
      clearInterval(ticker);
      // Left the section before arrival resolved — park the still-'running' row so it isn't a
      // perpetual spinner on other tabs (returning to AI resumes the watch from BRIDGE_WATCH).
      if (!bridgeTerminalRef.current && watch) onUpdate?.(watch.rowId, { status: 'parked' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  const run = async (): Promise<void> => {
    // Last line of defence: even if some future caller reaches past the disabled button, an
    // undeliverable route is never signed.
    if (!deliverable.ok) {
      setErr(deliverable.reason);
      return;
    }
    if (!hasAmount) {
      setErr('Tell me how much to bridge — e.g. “bridge 0.01 ETH to GIWA”.');
      return;
    }
    if (bridgingRef.current) return; // a deposit is already in flight — ignore the double-click
    // Durable across remounts: this bridge already deposited (or is mid-deposit) — NEVER send twice.
    if (EXECUTED_BRIDGES.has(flowKey) || INFLIGHT_BRIDGES.has(flowKey)) return;
    bridgingRef.current = true;
    INFLIGHT_BRIDGES.add(flowKey); // claim BEFORE the async deposit; released on failure
    setErr(null);
    setPhase('bridging');
    try {
      const label = `${from?.label ?? route.fromId} → ${to?.label ?? route.toId}`;
      // Read the destination balance BEFORE signing — it is the baseline the arrival is measured
      // against, and after the deposit it is already too late to establish.
      const before = await bridgeChainBalanceBase(route.toId, destAddr);
      const sent: EvmSendResult = canonical
        ? await bridgeEthToGiwa({ ethAmount: amount })
        : await (async () => {
            if (!from || !to) throw new Error(`Unknown bridge route ${route.fromId} → ${route.toId}.`);
            if (!destAddr) throw new Error(`No ${to.label} address to deliver to — unlock your wallet or name a recipient.`);
            return bridgeDeposit({
              fromId: route.fromId,
              toId: route.toId,
              amountBase: decimalToBase(amount, from.decimals),
              recipient: destAddr,
            });
          })();
      setTx(sent);
      EXECUTED_BRIDGES.set(flowKey, sent); // durable — no re-deposit on remount
      setPhase('done');
      // TWO rows, because a bridge really is two transactions: the outgoing deposit is genuinely
      // complete once mined, while the incoming leg stays `running` until it actually lands.
      const inRowId = `${sent.txid}:in`;
      onExecuted?.({ id: sent.txid, kind: 'bridge out', status: 'completed', chainId: label, txid: sent.txid, explorerUrl: sent.explorerUrl });
      onExecuted?.({ id: inRowId, kind: 'bridge in', status: 'running', chainId: `${to?.label ?? route.toId} (arriving)` });
      const seed: BridgeWatch = {
        since: Math.floor(Date.now() / 1000),
        before,
        rowId: inRowId,
        l1TxHash: sent.txid,
        valueBase: decimalToBase(amount, from?.decimals ?? 18),
      };
      BRIDGE_WATCH.set(flowKey, seed); // durable — a remount resumes the arrival watch from this seed
      setWatch(seed);
    } catch (e) {
      setErr(e instanceof Error ? humanizeTxError(e.message, route.fromId === 'sepolia' ? 'Sepolia ETH' : from?.asset ?? 'ETH') : 'Bridge failed');
      setPhase('planned');
    } finally {
      bridgingRef.current = false;
      INFLIGHT_BRIDGES.delete(flowKey); // on success EXECUTED_BRIDGES still blocks a re-send; on failure allow a manual retry
    }
  };

  // AUTO MODE — same doctrine as PlanFlow: no per-tx click, but the deposit is still signed
  // in-browser and still passes the pre-sign Sentinel guard on the source chain.
  const [autoDec, setAutoDec] = useState<{ auto: boolean; reason?: string }>({ auto: false });
  const autoTriedRef = useRef(false); // one shot — a failed deposit NEVER auto-retries (would loop)
  const autoUsdRef = useRef<number | null>(null); // decided USD value, carried to the run effect for the daily ledger

  useEffect(() => {
    if (getTxMode() !== 'auto') {
      setAutoDec({ auto: false });
      return;
    }
    let live = true;
    void (async () => {
      // Value the deposit at the ROUTE ASSET's live spot so the per-tx + daily caps ACTUALLY bind.
      // Passing a null usdVal would make autoDecision() skip BOTH caps, so an unknown price fails
      // safe (stay manual) rather than auto-signing an unbounded amount. Pricing every route at the
      // ETH spot would have bound a SOL or BTC bridge against the wrong number entirely.
      const spot = await spotUsd(route.asset);
      if (!live) return;
      const amt = Number(route.amount);
      if (spot == null || !Number.isFinite(amt) || amt <= 0) {
        autoUsdRef.current = null;
        setAutoDec({ auto: false, reason: `the ${route.asset} price feed is unavailable, so your spend caps can't be checked` });
        return;
      }
      // An undeliverable route is never auto-signed — Auto mode is a convenience, never a way past
      // a human decision, and least of all a way to auto-lose funds.
      if (!deliverable.ok) {
        autoUsdRef.current = null;
        setAutoDec({ auto: false, reason: 'this route cannot be delivered end-to-end yet' });
        return;
      }
      autoUsdRef.current = amt * spot; // remember the decided USD so the run effect can bill the daily ledger
      setAutoDec(autoDecision(amt * spot, 'low')); // canonical L1StandardBridge — low risk
    })();
    return () => {
      live = false;
    };
  }, [route.asset, route.amount, canonical]);

  useEffect(() => {
    // Respect the LIVE tx-mode, mirroring PlanFlow's auto effect. `autoDec` is a snapshot: its effect
    // deps are [route.asset, route.amount, canonical] — NOT tx-mode — so a switch to Manual after the
    // snapshot was taken leaves `autoDec.auto` stale-true. Without this guard a later phase change could
    // re-fire the deposit in Manual mode (Manual's contract is "confirm every tx").
    if (getTxMode() !== 'auto') return;
    if (!autoDec.auto || !unlocked || phase !== 'planned' || autoTriedRef.current) return;
    if (!BRIDGE_AUTO_ARMED.has(flowKey)) return; // created in Manual — a later Auto switch/remount must not auto-deposit it
    if (EXECUTED_BRIDGES.has(flowKey) || INFLIGHT_BRIDGES.has(flowKey)) return; // already deposited/in-flight — no re-fire on remount
    if (BRIDGE_AUTO_TRIED.has(flowKey)) return; // auto-deposit already ATTEMPTED this session — a failed try + remount must not re-sign the irreversible deposit
    // TOCTOU re-check (mirrors the plan path at PlanFlow's reservation point): `autoDec` was decided in
    // a SEPARATE async effect against the daily spend at that moment, and the ledger is not one of its
    // deps — so a sibling auto-bridge deciding in the same window read the same stale spend and both
    // reserved, overshooting the daily cap the comment below claims to enforce. Re-read the ledger HERE,
    // synchronously at the reservation point, so a sibling that reserved first IS observed; drop to
    // manual WITHOUT consuming the try (the Deposit button stays available, and the effect's deps won't
    // change so it won't auto-retry) if this deposit would now breach the cap.
    if (autoUsdRef.current != null && autoSpentTodayUsd() + autoUsdRef.current > getAutoCaps().dailyUsd) return;
    autoTriedRef.current = true;
    BRIDGE_AUTO_TRIED.add(flowKey); // durable across remounts (autoTriedRef resets on unmount)
    // Reserve the daily budget at the DECISION point (mirrors the plan path), so a batch of auto
    // bridges deciding in the same window sees each other's spend and the daily cap actually binds.
    // Without this, every bridge read a ledger bridges never wrote → the batch blew past the budget.
    if (autoUsdRef.current != null) recordAutoSpendUsd(autoUsdRef.current);
    void run();
    // A failed deposit drops back to 'planned' and the manual button reappears — deliberate retry only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDec.auto, unlocked, phase]);

  const depState: 'done' | 'active' | 'pending' = tx ? 'done' : phase === 'bridging' ? 'active' : 'pending';

  // A route the wallet can't deliver end-to-end shows ONLY the refusal — never the operator/relayer
  // route card. Otherwise a non-canonical utterance in chat renders an "Operator relayed" badge,
  // route diagram and custodial footer ABOVE the refusal, presenting the roadmap operator bridge as
  // a shipped mechanism. The one supported route (Sepolia → GIWA canonical) renders the full card.
  if (!deliverable.ok) {
    return (
      <div className="flow card">
        <div className="flow-top">
          <span className="kind">Bridge</span>
          <span className="risk-badge medium">Not available</span>
        </div>
        <p className="flow-lead">
          Bridge {amount} {route.asset} from {from?.label ?? route.fromId} to {to?.label ?? route.toId}
        </p>
        <p className="authz-deny err-line">🛑 {deliverable.reason}</p>
      </div>
    );
  }

  return (
    <div className="flow card">
      <div className="flow-top">
        <span className="kind">Bridge</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {getTxMode() === 'auto' && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>⚡ AUTO</span>}
          <span className={`risk-badge ${canonical ? 'low' : 'medium'}`}>{canonical ? 'OP Stack canonical' : 'Operator relayed'}</span>
        </span>
      </div>
      <p className="flow-lead">
        Bridge {amount} {route.asset} from {from?.label ?? route.fromId} to {to?.label ?? route.toId}
        {canonical ? ' via the canonical L1StandardBridge.' : ' via the operator bridge.'}
      </p>
      <p className="flow-reasoning">
        🧠 1 deposit · ~1–3 min to arrive · {canonical ? 'no third-party bridge' : 'operator-secured (custodial while in flight)'}
      </p>

      <div className="stages">
        <Stage i={0} icon="✦" title="Understood your intent" state="done">
          <span className="muted">
            A native <b>bridge</b> — {from?.label ?? route.fromId} → {to?.label ?? route.toId}.
          </span>
        </Stage>
        <Stage i={1} icon="🧭" title="Route" state="done">
          <span className="muted">
            {from?.label} {route.asset} → <b>{canonical ? 'L1StandardBridge' : 'operator + relayer'}</b> → {to?.label} {to?.asset}{' '}
            {route.recipient ? (
              <>
                → <code className="wl-mono">{shortAddr(route.recipient)}</code>
              </>
            ) : (
              '(your own address)'
            )}
          </span>
        </Stage>
        <Stage i={2} icon="🌉" title={`Deposit (sign on ${from?.label ?? route.fromId} → arrives on ${to?.label ?? route.toId})`} state={depState}>
          {tx ? (
            <div className="wl-signed" role="status" aria-live="polite">
              <p className="wl-signed-h">
                ✓ Deposit signed on {from?.label} — arriving on {to?.label} in ~1–3 min
              </p>
              <code className="wl-mono">{tx.txid}</code>
              <p className="wl-signed-sub">
                <a href={tx.explorerUrl} target="_blank" rel="noreferrer">
                  View the deposit on {from?.label} →
                </a>
              </p>
            </div>
          ) : phase === 'bridging' ? (
            <span className="muted">Signing the deposit &amp; broadcasting…</span>
          ) : !deliverable.ok ? (
            <span className="muted">Not signed — this route can&apos;t be delivered (see below).</span>
          ) : unlocked ? (
            <span className="muted">
              {autoDec.auto ? 'Auto-depositing — signing now' : 'Ready to deposit — signs'} on {from?.label} (needs {from?.label}{' '}
              {route.asset}: the amount + gas).
            </span>
          ) : (
            <span className="muted">Unlock your wallet to bridge.</span>
          )}
        </Stage>
        <Stage
          i={3}
          icon="📥"
          title={`Arrival on ${to?.label ?? route.toId}`}
          state={arrival || credited ? 'done' : watching ? 'active' : 'pending'}
        >
          {arrival || credited ? (
            <div className="wl-signed" role="status" aria-live="polite">
              <p className="wl-signed-h">
                ✓ Arrived on {to?.label}
                {credited ? ` — +${credited} ${to?.asset ?? ''} credited` : ''} in {elapsed}s
              </p>
              {arrival ? (
                <>
                  <code className="wl-mono">{arrival.txid}</code>
                  <p className="wl-signed-sub">
                    <a href={arrival.explorerUrl} target="_blank" rel="noreferrer">
                      View the incoming tx on {to?.label} →
                    </a>
                  </p>
                </>
              ) : (
                // The balance grew but no explorer has indexed the tx yet. Say exactly that rather
                // than implying we have a hash we don't.
                <p className="wl-signed-sub muted">Balance confirmed on-chain; the explorer hasn&apos;t indexed the transaction yet.</p>
              )}
            </div>
          ) : watching ? (
            <span className="muted">
              {elapsed < ETA_SECONDS
                ? `Watching ${to?.label} — expected in ~${ETA_SECONDS - elapsed}s…`
                : `Taking longer than the usual ~${ETA_SECONDS}s (${elapsed}s so far) — still watching ${to?.label}.`}
            </span>
          ) : gaveUp ? (
            <span className="muted">
              Couldn&apos;t confirm the arrival automatically after {elapsed}s. The deposit above did succeed — check{' '}
              <a href={`${to?.explorer}/address/${destAddr}`} target="_blank" rel="noreferrer">
                your address on {to?.label}
              </a>
              .
            </span>
          ) : (
            <span className="muted">Starts once the deposit is signed — you&apos;ll see the incoming tx here.</span>
          )}
        </Stage>
      </div>

      {err && <p className="authz-deny err-line" role="alert">{err}</p>}
      {/* This whole block only renders for a DELIVERABLE route — an undeliverable one early-returns
          above with a refusal-only card, so there is no operator/relayer language to leak here. */}
      {getTxMode() === 'auto' && !autoDec.auto && autoDec.reason && phase === 'planned' && (
        <p className="muted" style={{ color: 'var(--medium)' }}>⚡ Auto paused — {autoDec.reason}. Confirm manually below.</p>
      )}
      {/* Auto hides the button only while a deposit is genuinely pending/in-flight. It comes back
          when one FAILS (`err`) — the one-shot no-retry rule would otherwise strand the user with a
          failed bridge — and when the wallet is LOCKED, because auto can never fire in that state,
          so hiding it left the card with no control and no visible next step at all. */}
      {!tx && phase !== 'bridging' && (!autoDec.auto || err !== null || !unlocked) && (
        <div className="wl-actions">
          <button className="btn primary" onClick={() => void run()} disabled={!unlocked || !hasAmount}>
            {hasAmount ? `Bridge to ${to?.label ?? route.toId} →` : 'Enter an amount to bridge'}
          </button>
        </div>
      )}
      {/* This footer used to be a hardcoded "Ethereum Sepolia → GIWA · canonical · non-custodial"
          on EVERY route, so a relayed GIWA→Sepolia card claimed to be canonical and non-custodial
          while its own badge said "Operator relayed". Derive it from the route instead. */}
      <p className="flow-foot">
        {from?.label ?? route.fromId} → {to?.label ?? route.toId} ·{' '}
        {canonical ? 'canonical OP Stack L1StandardBridge · signed in your browser (non-custodial)' : 'operator bridge · custodial while in flight'}
      </p>
    </div>
  );
}

// A plan's execution result must SURVIVE a PlanFlow remount. In Auto mode, leaving AI-Chat and
// returning remounts PlanFlow with phase reset to 'planned', which would re-run the auto-authorize→
// execute effect and DOUBLE-BROADCAST the same plan; in Manual mode the receipt is lost and the
// user is asked to re-authorize a plan that already settled. Keyed by the stable planId, this both
// (a) blocks any second broadcast (EXECUTED + INFLIGHT guards) and (b) restores the receipt.
interface ExecutedPlan {
  realTx: EvmSendResult;
  swapSendTx: SwapAndSendResult | null;
}
const EXECUTED_PLANS = new Map<string, ExecutedPlan>();
// Claimed at broadcast start (before the await) and released only on failure — closes the narrow
// window where a remount mid-broadcast (result not yet stored) could fire a second send.
const INFLIGHT_PLAN_IDS = new Set<string>();
// Durable twin of PlanFlow's autoExecTriedRef: a plan whose Auto-execute was ATTEMPTED (success OR
// failure) this session. EXECUTED_PLANS records SUCCESS only, and the try-refs reset on unmount, so a
// FAILED auto-execute left no durable marker — a section-nav remount reset phase to 'planned' and the
// still-armed plan auto-fired AGAIN (re-broadcasting a since-recoverable tx and double-charging the daily
// cap). Cleared wherever the arming sets are (lock / manual / account-switch).
const PLAN_AUTO_TRIED = new Set<string>();


function PlanFlow({ plan, onExecuted }: { plan: ExecutionPlan; onExecuted?: (item: ActivityItem) => void }): JSX.Element {
  // Restore a prior execution (survives remount) so we never re-broadcast and the receipt persists.
  const settled = EXECUTED_PLANS.get(plan.planId) ?? null;
  const [phase, setPhase] = useState<FlowPhase>(settled ? 'done' : 'planned');
  const [permission, setPermission] = useState<Permission | null>(null);
  const [realTx, setRealTx] = useState<EvmSendResult | null>(settled?.realTx ?? null);
  const [swapSendTx, setSwapSendTx] = useState<SwapAndSendResult | null>(settled?.swapSendTx ?? null);
  const [bal, setBal] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Can the on-device wallet REALLY execute this plan (native transfer + unlocked)?
  const real = executableTransfer(plan);
  const canReal = real != null && isUnlocked();
  // Or is it a swap we can quote + execute on Sepolia Uniswap v3?
  const swap = executableSwap(plan);
  const canSwap = swap != null && isUnlocked();
  // Or the flagship 2-leg compound "convert ETH → gUSDC and send to 0x…", both legs on GIWA?
  const swapSend = executableSwapAndSend(plan);
  const canSwapSend = swapSend != null && isUnlocked();
  // Or a native-ETH stake we can settle on our SimpleStaking pool (GIWA Sepolia / Sepolia)?
  const stake = executableStake(plan);
  const canStake = stake != null && isUnlocked();

  // PRE-SIGN recipient safety for the chat flow. The broadcast boundary already refuses a poisoned
  // recipient, but only once the user has clicked execute — far too late to be useful. Run the same
  // local + on-chain checks up front so the plan SHOWS the finding and the execute button is gated,
  // exactly like the Send sheet does.
  const planRecipient = real?.to ?? (swapSend?.recipient ?? null);
  // The guard has to run on the chain the compound actually settles on — hardcoding GIWA here would
  // have checked a Solana recipient against EVM rules (and vice versa) once more venues were wired.
  const planChain: ChainId | null =
    real?.chain ?? (swapSend ? (swapSend.venue === 'giwa' ? 'giwa-sepolia' : 'solana-devnet') : null);
  // This preview is the RECIPIENT-safety check (address poisoning / malformed / drain). The mainnet
  // acknowledgment + $1,000 spend cap are confirmed SEPARATELY — the mainnet-ack dialog and the execution
  // guard, which sees the plan's REAL USD value — so treat them as satisfied here and thread the plan's
  // priced value. Otherwise every mainnet plan shows a false "REAL funds / over-cap, high-value confirmation
  // required" before the user has even reviewed it (a $7 send read as "over $1,000").
  const localGuard =
    planRecipient && planChain
      ? guardBroadcast({
          chain: planChain,
          toAddress: planRecipient,
          knownAddresses: knownGoodAddresses(),
          acknowledgeMainnet: true,
          acknowledgeHighValue: true,
          ...(real?.amountUsd !== undefined ? { amountUsd: real.amountUsd } : {}),
        })
      : null;
  const [planChainCheck, setPlanChainCheck] = useState<RecipientAssessment | null>(null);
  const [planChainChecking, setPlanChainChecking] = useState(false);
  useEffect(() => {
    const me = currentIdentity();
    const evmChain = planChain === 'giwa-sepolia' || planChain === 'sepolia' ? planChain : null;
    if (!evmChain || !me || !planRecipient || !/^0x[0-9a-fA-F]{40}$/u.test(planRecipient)) {
      setPlanChainCheck(null);
      setPlanChainChecking(false);
      return;
    }
    let alive = true;
    setPlanChainChecking(true); // an on-chain verdict is PENDING — Auto mode must wait for it, never sign ahead
    void assessRecipientLive({ chain: evmChain, me: me.evm.address, target: planRecipient })
      .then((r) => {
        if (alive) setPlanChainCheck(r);
      })
      .catch(() => {
        if (alive) setPlanChainCheck(null);
      })
      .finally(() => {
        if (alive) setPlanChainChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [planChain, planRecipient]);
  // Cumulative session-drain guard for a native transfer — the SAME check + the SHARED ledger the
  // Send sheet uses, so a multi-send wallet-drain executed through AI-chat (worst in Auto mode, where
  // there's no per-tx click) is blocked, not just Send-sheet drains. Scoped to native transfers (the
  // drain pattern); a null/unloaded balance yields 'none' (fail-open on unknown, like the Send sheet).
  const drainBlock = ((): string[] => {
    // Applies to a native transfer OR a native-INPUT convert-and-send — both spend the native balance
    // to move value OUT (the latter to an EXTERNAL recipient). Same shared ledger + check as the Send
    // sheet, so an Auto-mode run of either — or a mix across Send + chat — is caught, not just Send.
    const nativeSwapSend = swapSend != null && (swapSend.fromSym === 'ETH' || swapSend.fromSym === 'SOL');
    const chain = real?.chain ?? (nativeSwapSend ? (swapSend.venue === 'giwa' ? 'giwa-sepolia' : 'solana-devnet') : null);
    const asset = real?.asset ?? (nativeSwapSend ? swapSend.fromSym : null);
    const amountStr = real?.amountBase ?? (nativeSwapSend ? swapSend.amountInBase : null);
    if (!chain || !asset || amountStr == null) return [];
    // A SELF-SEND (native transfer to your OWN address) never leaves the wallet — exempt it from the
    // drain check (parity with the Send sheet's `selfSend` and the ledger-record guard below). Only the
    // `real` native-transfer path has a wallet-owned recipient; a convert-and-send goes to an EXTERNAL one.
    if (real?.to) {
      const meSelf = currentIdentity();
      const ownChk = !meSelf ? '' : chain === 'bitcoin-testnet' ? (btcTestnetAddress() ?? '') : chain === 'solana-devnet' ? meSelf.sol.address : meSelf.evm.address;
      if (ownChk && ownChk.toLowerCase() === real.to.trim().toLowerCase()) return [];
    }
    // Derive decimals from the ASSET, not a native-only ternary. A 6-dp ERC-20/SPL (USDC) fell into the
    // `else → 18` branch, scaling the fetched balance ~1e12× too large so the drain line was never
    // reached and the guard silently no-op'd for chat token transfers (the Send sheet gets this right).
    const dec = tokenInfo(asset)?.decimals ?? splToken(asset)?.decimals ?? NATIVE_DECIMALS[asset] ?? 18;
    let balanceBase: bigint | null = null;
    if (bal && /^\d+(\.\d+)?$/u.test(bal.trim())) {
      try {
        balanceBase = BigInt(decimalToBase(bal.trim(), dec));
      } catch {
        balanceBase = null;
      }
    }
    try {
      const drain = assessSessionDrain({ priorBase: priorOutflow(chain, asset), amountBase: BigInt(amountStr), balanceBase });
      return drain === 'block' ? ['Together with this session’s sends, this empties your balance. Send a smaller amount, or use the Send sheet.'] : [];
    } catch {
      return [];
    }
  })();
  // Non-EVM recipient FORMAT check (mirrors the Send sheet's recipientMalformed). guardBroadcast
  // enforces the EIP-55/hex-40 shape for EVM, but for Solana/Bitcoin it only rejects an EMPTY recipient
  // — so a garbage Solana/BTC string would pass localGuard, the plan would SHOW "checks passed", execute
  // would enable, and it would only fail deep in the address builder AFTER the user saw it as ready.
  // Block it up front so the chat path fails the same way as the Send sheet (BTC uses @scure's decoder).
  const planRecipientMalformed =
    !!planRecipient &&
    ((planChain === 'solana-devnet' && classify(planRecipient) !== 'sol') ||
      (planChain === 'bitcoin-testnet' && !isValidBtcAddress(planRecipient, 'testnet')));
  // Everything that must stop a signature, gathered before the button is rendered.
  const recipientBlocks = [
    ...(localGuard?.blocked ?? []),
    ...(planChainCheck?.blocked ?? []),
    ...drainBlock,
    ...(planRecipientMalformed ? ['This recipient address isn’t valid for the destination chain.'] : []),
  ];
  const recipientWarnings = [...(localGuard?.warnings ?? []), ...(planChainCheck?.warnings ?? [])];
  const recipientBlocked = recipientBlocks.length > 0;
  // AUTO MODE holds on more than a hard block. The recipient safety is designed as "block on strong
  // evidence, WARN on weaker, let the human decide the warnings" — but Auto has no human, so it must
  // also refuse on any recipient WARNING (dust-spray under the block threshold, a passive address
  // whose lookalike "can't be ruled out", an unverified-token-only sender) AND, for an external EVM
  // recipient, until the on-chain poison check has POSITIVELY completed: an inconclusive/failed check
  // (explorer + RPC both down → checked:false) drops Auto back to manual, mirroring how settings.ts
  // falls back to manual when a spend cap "can't be checked". Manual is unchanged — it still shows the
  // warnings and lets the human proceed.
  const evmRecipientCheckable =
    (planChain === 'giwa-sepolia' || planChain === 'sepolia') && !!planRecipient && /^0x[0-9a-fA-F]{40}$/u.test(planRecipient);
  const autoRecipientHold = recipientWarnings.length > 0 || (evmRecipientCheckable && planChainCheck?.checked !== true);
  // GIWA: ETH⇄USDC swaps settle through our own on-chain SimpleAMM (ETH⇄gUSDC), both directions.
  const isStable = (s: string): boolean => s === 'USDC' || s === 'GUSDC';
  const giwaSwap =
    swap != null &&
    GIWA_AMM !== '' &&
    ((swap.fromSym === 'ETH' && isStable(swap.toSym)) || (isStable(swap.fromSym) && swap.toSym === 'ETH'));
  const giwaSwapReverse = giwaSwap && swap != null && swap.fromSym !== 'ETH'; // gUSDC → ETH
  // Solana: SOL⇄USDC swaps settle through our own on-chain solAMM (SOL⇄dUSDC), both directions.
  const solanaSwap = swap != null && isSolammPair(swap.fromSym, swap.toSym);
  const solanaSwapReverse = solanaSwap && swap != null && swap.fromSym !== 'SOL'; // USDC → SOL
  // The in-chat swap/convert pools are TESTNET (solAMM on Solana devnet, the GIWA AMM on Sepolia). On MAINNET
  // mode there is NO in-chat mainnet pool, so executing would sign a devnet/testnet tx while the user believes
  // they're on mainnet — fail closed (below) and point to the real mainnet path (the Swap tab aggregator).
  const onMainnet = useNetworkMode() === 'mainnet';
  // On mainnet, a SOL⇄USDC chat swap runs for REAL via the aggregator, rendered through the SAME plan
  // stages as testnet (quote + execute swapped to the aggregator; see the swap quote effect + execute).
  // The EVM in-chat pools (GIWA AMM) and convert-and-send have no mainnet path yet, so those still redirect
  // to the Swap tab (fail-closed).
  const testnetSwapOnMainnet = onMainnet && (giwaSwap || swapSend != null);
  // Which curve the plan settles on — an imported single-curve account can only sign its OWN. Hoisted
  // to component scope so BOTH the manual Execute button AND the Auto-mode effect gate on it (the
  // backend planner has no knowledge of the active account, so it can return a different-curve plan
  // that would otherwise throw only at the signing boundary — and Auto has no per-tx click to stop it).
  const importedKind = isActiveImported() ? activeImportedKind() : null;
  const planCurve: 'evm' | 'sol' | 'btc' | null = real
    ? real.chain === 'solana-devnet' || real.chain === 'solana'
      ? 'sol'
      : real.chain === 'bitcoin-testnet'
        ? 'btc'
        : 'evm'
    : swapSend
      ? swapSend.venue === 'giwa'
        ? 'evm'
        : 'sol'
      : swap
        ? solanaSwap
          ? 'sol'
          : 'evm'
        : stake
          ? stake.chain === 'solana-devnet'
            ? 'sol'
            : 'evm'
          : null;
  const wrongCurve = importedKind !== null && planCurve !== null && planCurve !== importedKind;
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  // On MAINNET a SOL⇄USDC swap is quoted by the aggregator (LI.FI) but rendered through the SAME plan
  // stages as testnet — swapQuote drives the UI; aggQuote holds the aggregator's unsigned tx for execution.
  const [aggQuote, setAggQuote] = useState<CrossChainSwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false); // the one-shot quote fetch REJECTED (vs. still in flight)
  const [quoteErrMsg, setQuoteErrMsg] = useState<string | null>(null); // the WHY of a failed quote (e.g. provider rate limit)
  const [quoteAttempt, setQuoteAttempt] = useState(0); // bump to force a re-quote after a failure
  // User-controlled max slippage (bps). The guaranteed minimum received is shown
  // before signing — no invisible fixed slippage on a real-fund swap.
  const [slippageBps, setSlippageBps] = useState(50); // 0.5% default
  // The wallet's dUSDC balance (base units) for a REVERSE testnet swap (dUSDC→SOL). Read up front so we
  // can refuse to sign a sell of more dUSDC than the wallet holds — which would only revert on-chain with
  // a cryptic `custom program error: 0x1`. null = not-yet-read / read failed (best-effort: no block then;
  // the on-chain revert + humanizeTxError stay the guarantee). See the reverse-swap preflight effect.
  const [dusdcBal, setDusdcBal] = useState<bigint | null>(null);

  // The worst-case amount the swap is allowed to deliver, given the live quote +
  // the chosen slippage. This is the on-chain amountOutMinimum — a hard floor.
  const minOut = swapQuote ? (swapQuote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n : null;
  const minOutDisplay = minOut !== null && swapQuote ? fmtMinBase(minOut, swapQuote.decimalsOut) : null;
  // The PLANNER's own minimum-out, for plans with no live in-browser quote (a Solana/Jupiter route
  // never gets one). The API always sends base + decimals, so falling back to the bare symbol threw
  // away the one number the user most needs — "You receive (min): SOL" with no amount at all.
  const plannedMinOut = plan.quote.youReceiveMin ? fmtMinBase(plan.quote.youReceiveMin.base, plan.quote.youReceiveMin.decimals) : null;

  // Fetch the native balance for a transfer OR a native-input convert-and-send, so the drain guard has
  // a balance to check against for both.
  const realAsset = real?.asset ?? (swapSend && (swapSend.fromSym === 'ETH' || swapSend.fromSym === 'SOL') ? swapSend.fromSym : null);
  useEffect(() => {
    if ((canReal || canSwapSend) && realAsset) void balanceForAsset(realAsset).then((b) => setBal(b?.amount ?? null)).catch(() => setBal(null));
  }, [canReal, canSwapSend, realAsset]);

  const swapKey = swap ? `${swap.fromSym}>${swap.toSym}:${swap.amountInBase}` : null;
  useEffect(() => {
    if (!canSwap || !swap) return;
    setQuoting(true);
    setQuoteFailed(false);
    setAggQuote(null);
    // MAINNET SOL⇄USDC: quote via the aggregator (LI.FI, same-chain Solana) and ADAPT it to the SwapQuote
    // shape the testnet solAMM uses — so the plan renders the exact same route + quote stages on both networks.
    if (onMainnet && solanaSwap) {
      const me2 = currentIdentity();
      const fromSym = swap.fromSym.toUpperCase() === 'DUSDC' ? 'USDC' : swap.fromSym.toUpperCase();
      const toSym = swap.toSym.toUpperCase() === 'DUSDC' ? 'USDC' : swap.toSym.toUpperCase();
      // Quote through the BACKEND proxy (/v1/lifi), which adds the LI.FI key SERVER-SIDE — the key never
      // touches the browser bundle (LI.FI's own guidance) and we get the keyed rate limit (100/min).
      void (me2
        ? makeLifiProvider({ baseUrl: '/v1/lifi' }).quote({
            fromChainId: 'solana:mainnet',
            toChainId: 'solana:mainnet',
            fromToken: fromSym,
            toToken: toSym,
            amountInBase: BigInt(swap.amountInBase),
            fromDecimals: fromSym === 'SOL' ? 9 : 6,
            fromAddress: me2.sol.address,
            toAddress: me2.sol.address,
            slippageBps: 50,
          })
        : Promise.reject(new Error('Unlock your wallet first.'))
      )
        .then((agg) => {
          const best = bestCrossChainQuote([agg]).best; // validate (fail-closed on a stale/unpriced quote)
          setAggQuote(best);
          setQuoteErrMsg(null);
          setSwapQuote({ amountOut: best.toAmountBase, decimalsOut: best.toDecimals, symbolOut: best.toTokenSymbol, fee: 0 });
        })
        .catch((e) => {
          setSwapQuote(null);
          setAggQuote(null);
          setQuoteFailed(true);
          setQuoteErrMsg(e instanceof Error ? e.message : 'Quote failed');
        })
        .finally(() => setQuoting(false));
      return;
    }
    void (solanaSwap
      ? solanaSwapReverse
        ? quoteSolammSell(swap.amountInBase)
        : quoteSolammBuy(swap.amountInBase)
      : giwaSwap
        ? giwaSwapReverse
          ? quoteGiwaSwapTokenForEth(swap.amountInBase)
          : quoteGiwaSwap(swap.amountInBase)
        : quoteSwap({ fromSym: swap.fromSym, toSym: swap.toSym, amountInBase: swap.amountInBase }))
      .then((q) => setSwapQuote(q))
      .catch(() => {
        setSwapQuote(null);
        setQuoteFailed(true); // a transient RPC/AMM failure — surface a Retry instead of a dead plan
      })
      .finally(() => setQuoting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwap, swapKey, quoteAttempt, onMainnet]);

  // Preflight the REVERSE testnet swap (dUSDC→SOL): read the wallet's dUSDC balance so the plan can
  // refuse — BEFORE any signature — to sell more dUSDC than it holds. Without this the swap looks fine,
  // gets signed, then reverts on-chain with "Transaction simulation failed … custom program error: 0x1"
  // (Token::InsufficientFunds) — a cryptic dead-end that violates "comprehension precedes signature" and
  // "honest errors". Best-effort: a failed read leaves dusdcBal null (no block); on-chain revert is the net.
  useEffect(() => {
    if (!(canSwap && solanaSwapReverse && !onMainnet)) {
      setDusdcBal(null);
      return;
    }
    void solDusdcBalanceBase().then(setDusdcBal).catch(() => setDusdcBal(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwap, solanaSwapReverse, onMainnet, swapKey]);

  // The compound's swap leg uses the SAME live quote + slippage floor as a standalone swap — one
  // quote source per venue AND direction, so the on-chain floor always comes from the pool that
  // will actually settle it. (Hardcoding quoteGiwaSwap here would have priced a Solana swap, and
  // every reverse swap, against the GIWA pool.)
  const swapSendKey = swapSend ? `${swapSend.chainId}:${swapSend.fromSym}>${swapSend.toSym}:${swapSend.amountInBase}` : null;
  useEffect(() => {
    if (!canSwapSend || !swapSend) return;
    setQuoting(true);
    setQuoteFailed(false);
    const { venue, fromSym, amountInBase } = swapSend;
    const q =
      venue === 'solamm'
        ? fromSym === 'SOL'
          ? quoteSolammBuy(amountInBase)
          : quoteSolammSell(amountInBase)
        : fromSym === 'ETH'
          ? quoteGiwaSwap(amountInBase)
          : quoteGiwaSwapTokenForEth(amountInBase);
    void q
      .then((r) => setSwapQuote(r))
      .catch(() => {
        setSwapQuote(null);
        setQuoteFailed(true);
      })
      .finally(() => setQuoting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwapSend, swapSendKey, quoteAttempt]);

  const authorize = async (): Promise<void> => {
    setErr(null);
    setPhase('authorizing');
    try {
      const perm = await authorizeIntent(plan.planId);
      setPermission(perm);
      setPhase('authorized');
    } catch (e) {
      if (isSessionExpired(e)) void signOut(); // 401 mid-flow → clear the stale session so sign-in is offered
      setErr(e instanceof Error ? e.message : 'Authorization failed');
      setPhase('planned');
    }
  };
  // The plan's known USD notional (null when the plan didn't price it) — feeds the spend caps.
  const usdVal = plan.quote?.youSend?.valueMicros ? Number(plan.quote.youSend.valueMicros) / 1e6 : null;
  const [mainnetAsk, setMainnetAsk] = useState(false); // real-funds confirm dialog open
  const [hvAck, setHvAck] = useState(false); // high-value (> $1k cap) acknowledgement
  // In-flight latch: a SYNCHRONOUS guard so a double-click (before React re-renders the
  // execute/confirm buttons away) can't fire two real broadcasts. Both the testnet path
  // (execute → runExecute) and the mainnet confirm button funnel through runExecute, so
  // one latch here covers both. `disabled` alone is insufficient — the button is render-
  // gated on `phase`, which updates asynchronously and may not flush between two clicks.
  const execInFlightRef = useRef(false);

  const execute = async (): Promise<void> => {
    // A REAL mainnet broadcast NEVER fires without an explicit confirm — that click is the GuardAck the
    // deterministic guard demands. Covers a mainnet transfer AND a mainnet aggregator swap. Testnet/devnet
    // (solAMM / GIWA) run straight through.
    if ((canReal && real?.isMainnet) || (canSwap && onMainnet && solanaSwap)) {
      setMainnetAsk(true);
      return;
    }
    await runExecute();
  };
  const runExecute = async (ackHighValue = false): Promise<void> => {
    if (execInFlightRef.current) return; // a broadcast is already in flight — ignore the double-click
    // Durable across remounts: this plan already settled (or is mid-broadcast) — NEVER send twice.
    if (EXECUTED_PLANS.has(plan.planId) || INFLIGHT_PLAN_IDS.has(plan.planId)) return;
    execInFlightRef.current = true;
    INFLIGHT_PLAN_IDS.add(plan.planId); // claim BEFORE the async broadcast; released on failure
    setErr(null);
    setMainnetAsk(false);
    setPhase('executing');
    try {
      // Fail closed on MAINNET: the in-chat swap/convert pools are TESTNET (solAMM on Solana devnet, the GIWA
      // AMM on Sepolia). Signing one while the user is on mainnet would broadcast a devnet/testnet tx behind a
      // mainnet expectation — never do that. Point to the real mainnet path instead.
      if (testnetSwapOnMainnet) {
        throw new Error(
          "You're on Mainnet. AI-chat swaps settle on our TESTNET pools (Solana devnet solAMM / GIWA AMM) — for a REAL mainnet swap open the Swap tab: it routes SOL · USDC · ETH across chains via LI.FI + deBridge. Nothing was signed.",
        );
      }
      if (canReal && real) {
        // Mainnet carries the acknowledgeMainnet ack (+ high-value ack over the $1k cap); testnet
        // passes no guard (the guard waves testnets through). Signed in-browser, broadcast for real.
        const guard = real.isMainnet
          ? { acknowledgeMainnet: true, acknowledgeHighValue: ackHighValue, ...(real.amountUsd !== undefined ? { amountUsd: real.amountUsd } : {}) }
          : undefined;
        const tx = await executeTransferStep({
          asset: real.asset,
          amountBase: real.amountBase,
          to: real.to,
          chain: real.chain,
          // Only an EVM mainnet send uses the Ethereum RPC. A mainnet SOL send (chain 'solana') must NOT —
          // passing DEFAULT_ETHEREUM_RPC here made sendSolTransfer POST getLatestBlockhash to an Ethereum
          // node (method-not-found → the send always failed). Omit it so executeTransferStep picks the
          // Solana mainnet RPC. (BTC/others aren't mainnet-wired, so 'ethereum' is the only mainnet RPC here.)
          ...(real.isMainnet && real.chain === 'ethereum' ? { rpcUrl: DEFAULT_ETHEREUM_RPC } : {}),
          ...(guard ? { guard } : {}),
        });
        setRealTx(tx);
        EXECUTED_PLANS.set(plan.planId, { realTx: tx, swapSendTx: null }); // durable — no re-send on remount
        setPhase('done');
        recordRecipient(real.to); // known-good reference for future poisoning detection
        // A SELF-SEND never left the wallet, so it must NOT accrue to the SHARED drain ledger — otherwise
        // it would later falsely block a real send as a bogus "cumulative drain". The Send sheet already
        // skips its ledger write for self-sends (doSend); mirror that here so the two surfaces agree.
        const selfMe = currentIdentity();
        const ownOnChain = !selfMe
          ? ''
          : real.chain === 'bitcoin-testnet'
            ? (btcTestnetAddress() ?? '')
            : real.chain === 'solana-devnet'
              ? selfMe.sol.address
              : selfMe.evm.address;
        if (!ownOnChain || ownOnChain.toLowerCase() !== real.to.trim().toLowerCase()) {
          try {
            recordOutflow(real.chain, real.asset, BigInt(real.amountBase)); // feed the SHARED drain ledger (Send sheet + chat)
          } catch {
            /* amountBase came straight from the plan; ignore a re-parse edge */
          }
        }
        // (The daily-USD ledger is accrued at the auto-execute DECISION point — see the auto effect —
        // so a batch of auto plans can't each read a stale $0 and collectively blow past the cap.)
        onExecuted?.({ id: tx.txid, kind: plan.intentKind, status: 'completed', chainId: real.chainLabel, txid: tx.txid, explorerUrl: tx.explorerUrl });
        return;
      }
      if (canSwap && swap) {
        if (!swapQuote || minOut === null) throw new Error('Still fetching a live quote — try again in a second.');
        // amountOutMin is the user-chosen floor — the swap reverts on-chain rather
        // than delivering less, so slippage/MEV can never silently cost the user.
        const tx =
          onMainnet && solanaSwap
            ? // MAINNET: sign + broadcast the aggregator's route (same non-custodial Solana executor as the
              // Swap tab — mainnet-ack + spend cap + pre-broadcast simulation gate).
              await (async () => {
                const data = (aggQuote?.execution?.raw as { data?: string } | undefined)?.data;
                if (!data) throw new Error('No executable mainnet route — re-quote and try again.');
                const valueUsd = aggQuote && aggQuote.toValueMicros !== null ? Number(aggQuote.toValueMicros) / 1e6 : undefined;
                return executeCrossChainSwapSolana({
                  data,
                  ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}),
                  guard: { acknowledgeMainnet: true, acknowledgeHighValue: ackHighValue, ...(valueUsd !== undefined ? { amountUsd: valueUsd } : {}) },
                });
              })()
            : solanaSwap
              ? solanaSwapReverse
                ? await swapDusdcForSol({ tokenBase: swap.amountInBase, amountOutMin: minOut })
                : await swapSolForDusdc({ lamportsBase: swap.amountInBase, amountOutMin: minOut })
              : giwaSwap
                ? giwaSwapReverse
                  ? await swapGusdcForEthOnGiwa({ tokenAmountBase: swap.amountInBase, amountOutMin: minOut })
                  : await swapEthForGusdcOnGiwa({ ethAmountBase: swap.amountInBase, amountOutMin: minOut })
                : await sendSwap({ fromSym: swap.fromSym, toSym: swap.toSym, amountInBase: swap.amountInBase, amountOutMin: minOut, fee: swapQuote.fee });
        setRealTx(tx);
        EXECUTED_PLANS.set(plan.planId, { realTx: tx, swapSendTx: null }); // durable — no re-send on remount
        setPhase('done');        onExecuted?.({ id: tx.txid, kind: plan.intentKind, status: 'completed', chainId: onMainnet && solanaSwap ? 'Solana' : solanaSwap ? 'Solana devnet' : giwaSwap ? 'GIWA Sepolia' : 'Sepolia', txid: tx.txid, explorerUrl: tx.explorerUrl });
        return;
      }
      if (canSwapSend && swapSend) {
        if (!swapQuote || minOut === null) throw new Error('Still fetching a live quote — try again in a second.');
        // Leg 1 swaps on the venue's pool (on-chain slippage floor = minOut) and WAITS for
        // confirmation; leg 2 then forwards the proceeds to the recipient, on the SAME chain.
        // swapThenSend picks the venue from the plan's own chainId — see broadcast.ts.
        const r = await swapThenSend({
          chainId: swapSend.chainId,
          fromSym: swapSend.fromSym,
          toSym: swapSend.toSym,
          amountInBase: swapSend.amountInBase,
          amountOutMin: minOut,
          recipient: swapSend.recipient,
        });
        const label = swapSend.venue === 'giwa' ? 'GIWA Sepolia' : 'Solana devnet';
        setSwapSendTx(r);
        setRealTx(r.send); // the FINAL send tx drives the "done" state; SwapSendExecView shows both legs
        recordRecipient(swapSend.recipient); // memorize the paid recipient as known-good — mirrors the transfer path, so a later poisoning lookalike of it is caught
        EXECUTED_PLANS.set(plan.planId, { realTx: r.send, swapSendTx: r }); // durable — no re-send on remount
        setPhase('done');        // Feed the shared drain ledger when the INPUT is native (ETH/SOL) — a run of auto convert-and-
        // sends that spends the native balance is the drain the guard exists to stop; recording it here
        // means the next Send-sheet or chat send sees the cumulative total.
        if (swapSend.fromSym === 'ETH' || swapSend.fromSym === 'SOL') {
          try {
            recordOutflow(swapSend.venue === 'giwa' ? 'giwa-sepolia' : 'solana-devnet', swapSend.fromSym, BigInt(swapSend.amountInBase));
          } catch {
            /* amountInBase came from the plan; ignore a re-parse edge */
          }
        }
        onExecuted?.({ id: r.swap.txid, kind: 'swap', status: 'completed', chainId: label, txid: r.swap.txid, explorerUrl: r.swap.explorerUrl });
        onExecuted?.({ id: r.send.txid, kind: 'transfer', status: 'completed', chainId: label, txid: r.send.txid, explorerUrl: r.send.explorerUrl });
        return;
      }
      if (canStake && stake) {
        // Real native stake on our SimpleStaking pool — signed in-browser, settles on-chain.
        const tx = stake.asset === 'SOL'
          ? await stakeSol({ lamportsBase: stake.amountBase })
          : await stakeEvm({ chain: stake.chain, amountBase: stake.amountBase });
        setRealTx(tx);
        EXECUTED_PLANS.set(plan.planId, { realTx: tx, swapSendTx: null }); // durable — no re-send on remount
        setPhase('done');        onExecuted?.({ id: tx.txid, kind: plan.intentKind, status: 'completed', chainId: stake.chainLabel, txid: tx.txid, explorerUrl: tx.explorerUrl });
        return;
      }
      // No fake fallback. If the on-device wallet can't REALLY sign + broadcast this plan,
      // say so honestly — nothing is simulated, nothing is reported "confirmed" that didn't
      // actually happen on-chain. (The doctrine: the device signature disposes, or nothing does.)
      throw new Error(
        plan.intentKind === 'swap'
          ? "This swap pair isn't wired for in-browser execution — ETH ⇄ gUSDC on GIWA and SOL ⇄ dUSDC on Solana devnet swap for real. Nothing was broadcast."
          : plan.intentKind === 'swap_and_send'
            ? 'Convert-and-send runs for real on the wired pools — ETH ⇄ gUSDC on GIWA, SOL ⇄ dUSDC on Solana devnet, either direction. This one needs a CROSS-CHAIN route (its two legs sit on different chains), which this wallet does not have, so it stays plan-level — nothing was signed or sent.'
            : plan.intentKind === 'stake'
              ? (plan.assets[0] ?? '').toUpperCase() === 'SOL'
                ? 'SOL staking executes for real once the Solana staking program is configured — set VITE_SOLANA_STAKING_PROGRAM. Nothing was signed or sent.'
                : 'ETH staking executes for real once SimpleStaking is deployed — set VITE_GIWA_STAKING / VITE_SEPOLIA_STAKING. Nothing was signed or sent.'
              : `This ${plan.intentKind} can't be broadcast from the browser wallet yet. Nothing was signed or sent.`,
      );
    } catch (e) {
      if (e instanceof SwapSendPartialError) {
        // The SWAP leg settled but the forward failed. Persist it as executed so a manual retry can
        // NEVER re-run the irreversible swap; show the swap receipt + tell the user their converted
        // funds are safe in their wallet (they can forward via Send).
        EXECUTED_PLANS.set(plan.planId, { realTx: e.swap, swapSendTx: null });
        setRealTx(e.swap);
        setPhase('done');
        onExecuted?.({ id: e.swap.txid, kind: 'swap', status: 'completed', chainId: swapSend?.venue === 'giwa' ? 'GIWA Sepolia' : 'Solana devnet', txid: e.swap.txid, explorerUrl: e.swap.explorerUrl });
        setErr(`Converted (swap ${e.swap.txid.slice(0, 10)}…), but forwarding to the recipient failed: ${e.reason}. Your converted funds are safe in your wallet — use Send to forward them. The swap will NOT run again.`);
      } else {
        setErr(e instanceof Error ? humanizeTxError(e.message) : 'Execution failed');
        setPhase('authorized');
      }
    } finally {
      execInFlightRef.current = false; // release the latch on success, error, or throw
      // Release the in-flight claim. On success the plan is now in EXECUTED_PLANS (which still
      // blocks a re-send); on failure this clears the way for a deliberate manual retry.
      INFLIGHT_PLAN_IDS.delete(plan.planId);
    }
  };

  // AUTO MODE — drive authorize → execute within bounds, no per-tx click. It still signs
  // in-browser and still passes the Risk/Policy gate. autoDecision() fails safe (risk-block →
  // manual). A mainnet plan can't auto-fire: execute() opens the real-funds confirm instead.
  const autoDrivenRef = useRef(false);
  const autoAuthTriedRef = useRef(false); // auto-authorize fired once
  const autoExecTriedRef = useRef(false); // auto-execute fired once — NEVER retry on failure (would loop)
  // Pass the plan's KNOWN USD value so the per-tx + daily spend caps actually bind (was null → no-op).
  const autoDec = autoDecision(usdVal, plan.risk.level);
  useEffect(() => {
    // A recipient the Sentinel has blocked (poisoning lookalike, bad checksum, burn address) must
    // NEVER be auto-signed — Auto mode is a convenience, never a bypass. And while the on-chain
    // poisoning verdict is still PENDING, hold: the check could yet flip the recipient to blocked.
    // `requiresStepUp` is a REAL gate here, not just the ⚠︎ label at the review. The planner sets it for
    // a full-balance / elevated-risk move precisely so it "can never proceed on the same silent path as a
    // benign one" — and Auto is that silent path. So Auto never auto-signs a step-up plan; it drops to
    // manual, where the human sees the warning and clicks deliberately. (Manual is unchanged.)
    if (getTxMode() !== 'auto' || !autoDec.auto || recipientBlocked || planChainChecking || autoRecipientHold || wrongCurve || plan.requiresStepUp) return;
    if (!PLAN_AUTO_ARMED.has(plan.planId)) return; // created in Manual — a later Auto switch must not fire it
    // Never auto-drive a plan the wallet can't actually execute (e.g. a SOL stake with no staking
    // program configured) — Auto would otherwise reach runExecute's honest-refusal throw. Let the
    // manual "not executable" state show instead, mirroring the manual button's gate.
    if (!(canReal || canSwap || canSwapSend || canStake)) return;
    // Already broadcast (or mid-broadcast) in this session — a remount must not re-fire it.
    if (EXECUTED_PLANS.has(plan.planId) || INFLIGHT_PLAN_IDS.has(plan.planId)) return;
    // Auto-execute already ATTEMPTED this session (durable across remounts). A failed attempt is not in
    // EXECUTED_PLANS and the try-refs reset on unmount, so without this a section-nav remount re-fires the
    // still-armed plan — re-broadcasting and re-charging the daily cap. Extends EXECUTED_PLANS' remount
    // durability to the FAILURE case.
    if (PLAN_AUTO_TRIED.has(plan.planId)) return;
    if (phase === 'planned' && !autoAuthTriedRef.current) {
      autoDrivenRef.current = true;
      autoAuthTriedRef.current = true;
      void authorize();
    } else if (phase === 'authorized' && permission?.mayProceedToSign && autoDrivenRef.current && !autoExecTriedRef.current) {
      if ((canSwap || canSwapSend) && !swapQuote) return; // a swap needs its live quote before it can sign — wait, don't consume the try
      // TOCTOU re-check: autoDec.auto was computed at RENDER against the daily spend AT THAT MOMENT.
      // Two sibling auto plans deciding in the same batch would both read the pre-batch spend, both
      // pass, then both reserve+sign — overshooting the daily cap by up to (N-1)x the per-tx cap. Re-read
      // the ledger HERE, synchronously at the reservation point, so a sibling that reserved first IS
      // observed; if this send would now breach the cap, drop to manual WITHOUT consuming the try (the
      // manual button stays available, and next render's autoDec.auto is already false → no auto-retry).
      if (usdVal != null && autoSpentTodayUsd() + usdVal > getAutoCaps().dailyUsd) return;
      autoExecTriedRef.current = true;
      PLAN_AUTO_TRIED.add(plan.planId); // durable: never auto-execute this plan again, even after a remount resets the local ref

      // Reserve the daily budget at the DECISION point (not post-settle), so a sibling auto plan
      // deciding in the same window sees this spend and the daily cap actually binds across a batch.
      // A failed tx over-counts, which errs SAFE for a cap. Only auto-driven executable plans reach
      // here (gated above), so this never records a manual send.
      if (usdVal != null) recordAutoSpendUsd(usdVal);
      void execute();
    }
    // A failed authorize/execute drops back to 'planned'/'authorized' — we do NOT auto-retry (that
    // would spin the RPC forever); the manual buttons reappear so the user can retry deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, swapQuote, permission?.mayProceedToSign, autoDec.auto, recipientBlocked, planChainChecking, autoRecipientHold, wrongCurve, plan.requiresStepUp]);

  const feeMin = Math.max(1, Math.round(plan.quote.etaSeconds / 60));
  const reasoning = [
    `${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}`,
    `${RISK[plan.risk.level].label.toLowerCase()}`,
    `~${usd(plan.quote.totalFeeMicros)} network fee`,
    `~${feeMin} min`,
  ].join(' · ');

  // 'done' (green ✓) only when the policy actually PASSED — a require_confirmation / block permission
  // must not show a reassuring checkmark on the "Authorize" step while the body says "Needs step-up".
  const authzState = permission ? (permission.mayProceedToSign ? 'done' : 'active') : phase === 'authorizing' ? 'active' : 'pending';
  const execState = realTx ? 'done' : phase === 'executing' ? 'active' : 'pending';

  // Show the SAME minimum-received everywhere the user reads it: the live on-chain
  // quote that will actually be signed — not the plan-time estimate, which can drift
  // from a thin testnet pool. Keeps the header consistent with the cost table + execute.
  const lead = (() => {
    if (!(swapQuote && minOutDisplay)) return plan.confirmation;
    let s = plan.confirmation.replace(/to at least [\d.]+ \w+/u, `to at least ${minOutDisplay} ${swapQuote.symbolOut}`);
    // Header follows the REAL venue. Include the swap-and-send case: for a compound plan there is no
    // standalone `swap` object, so `giwaSwap`/`solanaSwap` are false — without `swapSend?.venue` the plan's
    // routed label ("via Jupiter") would leak into the confirmation while the tx signs on our own AMM.
    if (giwaSwap || swapSend?.venue === 'giwa') s = s.replace(/via Uniswap v3/iu, 'via our GIWA AMM');
    if (solanaSwap || swapSend?.venue === 'solamm') s = s.replace(/via (Jupiter|HumidiFi|Orca|Raydium|Phoenix|Meteora)\b/iu, 'via our solAMM');
    return s;
  })();

  return (
    <div className="flow card">
      <div className="flow-top">
        <span className="kind">{titleCase(plan.intentKind)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {/* Only claim GIWA settlement when it IS GIWA — a solAMM compound settles on Solana. */}
          {(giwaSwap || swapSend?.venue === 'giwa' || real?.chain === 'giwa-sepolia' || stake?.chain === 'giwa-sepolia') && (
            <span style={{ color: '#7c5cf0', fontWeight: 700, fontSize: 11, letterSpacing: '0.03em' }}>⚡ SETTLES ON GIWA</span>
          )}
          {getTxMode() === 'auto' && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>⚡ AUTO</span>}
          <RiskBadge level={plan.risk.level} />
        </span>
      </div>
      <p className="flow-lead">{lead}</p>
      <p className="flow-reasoning">🧠 {reasoning}</p>

      {testnetSwapOnMainnet && (
        <p className="authz-deny err-line" role="note">
          ⚠️ You're on <b>Mainnet</b>, but this in-chat swap settles on our <b>testnet</b> pool (Solana devnet
          solAMM / GIWA AMM). For a <b>real mainnet</b> swap, open the <b>Swap</b> tab — it routes SOL · USDC ·
          ETH across chains via LI.FI + deBridge. (Or switch to Testnet in Settings to run this in chat.)
        </p>
      )}

      <div className="stages">
        <Stage i={0} icon="✦" title="Understood your intent" state="done">
          <span className="muted">
            {/* Show where it ACTUALLY executes (testnet), not the planner's raw home chain
                (which is mainnet for SOL/BTC/ETH) — otherwise the top stage says "Solana"/"Ethereum"
                while the receipt says "Solana devnet"/"GIWA Sepolia". */}
            Parsed as a <b>{plan.intentKind}</b> on{' '}
            {real?.chainLabel ??
              stake?.chainLabel ??
              (swapSend
                ? swapSend.venue === 'giwa'
                  ? 'GIWA Sepolia'
                  : 'Solana devnet'
                : giwaSwap
                  ? 'GIWA Sepolia'
                  : solanaSwap
                    ? onMainnet
                      ? 'Solana mainnet'
                      : 'Solana devnet'
                    : chainNameSettled(plan.steps[0]?.chainId ?? ''))}
            .
          </span>
        </Stage>

        <Stage i={1} icon="🛡" title="Security checked" state={recipientBlocked ? 'active' : 'done'}>
          {plan.risk.reasons.length > 0 ? (
            <ul className="reasons">
              {plan.risk.reasons.map((r, i) => (
                <li key={`${i}-${r}`}>{r}</li>
              ))}
            </ul>
          ) : recipientBlocked || recipientWarnings.length > 0 ? null : (
            <span className="muted">No threats flagged by the risk engine.</span>
          )}
          {/* On-device recipient checks (poisoning / checksum / burn). The server-side risk engine
              cannot see this wallet's contacts or history, so these run here — and they GATE the
              execute button below rather than surfacing only after a failed broadcast. Wrapped in a
              live region: the on-chain poisoning verdict resolves ASYNC and gates the button, so a
              screen-reader user must be told when a block/warning appears (not left at a silent
              disabled button). */}
          <div role="status" aria-live="polite">
            {recipientBlocks.map((b, i) => (
              <p key={`rb${i}`} className="stepup" style={{ color: '#dc2626' }}>
                ⛔ {b}
              </p>
            ))}
            {!recipientBlocked &&
              recipientWarnings.map((w, i) => (
                <p key={`rw${i}`} className="stepup">
                  ⚠ {w}
                </p>
              ))}
            {plan.requiresStepUp && <p className="stepup">⚠︎ Elevated risk — extra confirmation required before signing.</p>}
          </div>
        </Stage>

        <Stage i={2} icon="🧭" title="Best route" state="done">
          <RouteGraph plan={plan} />
        </Stage>

        <Stage i={3} icon="⛽" title="Estimated cost" state="done">
          <div className="cost">
            <div>
              <span className="cost-k">You send</span>
              {/* When the input asset is unpriced (e.g. gUSDC/dUSDC, or the price feed is down) usd()
                  returns '—' and the amount would vanish ("You send: gUSDC"). Fall back to the token
                  amount from base+decimals, mirroring the "You receive (min)" row. */}
              <span className="cost-v">
                {plan.quote.youSend.valueMicros
                  ? usd(plan.quote.youSend.valueMicros)
                  : /* EXACT amount (not fmtMinBase, which FLOORS — the wrong direction for what LEAVES the
                       wallet: it would display less than is actually signed). */
                    `${baseToDecimal(plan.quote.youSend.base, plan.quote.youSend.decimals)} ${plan.quote.youSend.symbol}`}
              </span>
            </div>
            {plan.quote.youReceiveMin && (
              <div>
                <span className="cost-k">You receive (min)</span>
                <span className="cost-v">
                  {swapQuote && minOutDisplay
                    ? `${minOutDisplay} ${swapQuote.symbolOut}`
                    : plannedMinOut
                      ? `${plannedMinOut} ${plan.quote.youReceiveMin.symbol}`
                      : plan.quote.youReceiveMin.symbol}
                </span>
              </div>
            )}
            <div>
              <span className="cost-k">Network fee</span>
              <span className="cost-v">{usd(plan.quote.totalFeeMicros)}</span>
            </div>
            <div>
              <span className="cost-k">Slippage</span>
              {/* Show the slippage ACTUALLY applied to the signed floor. When a live quote drives the
                  in-browser swap, minOut uses the interactive `slippageBps` (default 50, user-settable),
                  not the planner's route value — printing plan.quote.slippageBps here would contradict
                  the signed "You receive (min)". Fall back to the planner value when there's no live quote. */}
              <span className="cost-v">{((swapQuote ? slippageBps : plan.quote.slippageBps) / 100).toFixed(2)}%</span>
            </div>
            <div>
              <span className="cost-k">ETA</span>
              <span className="cost-v">~{feeMin} min</span>
            </div>
          </div>
        </Stage>

        <Stage i={4} icon="🔐" title="Authorize (Risk + Policy)" state={authzState}>
          {permission ? (
            <AuthzView permission={permission} />
          ) : phase === 'authorizing' ? (
            <span className="muted">Checking risk &amp; policy…</span>
          ) : (
            <span className="muted">Not yet authorized — review the plan, then authorize.</span>
          )}
        </Stage>

        <Stage i={5} icon="🚀" title="Execute (sign → broadcast → confirm)" state={execState}>
          {realTx ? (
            swapSendTx ? (
              <SwapSendExecView res={swapSendTx} />
            ) : stake ? (
              <StakeExecView tx={realTx} stake={stake} />
            ) : real ? (
              <RealExecView tx={realTx} transfer={real} />
            ) : (
              <RealSwapExecView
                tx={realTx}
                // Also derive from swapSend: on a SwapSendPartialError (swap settled, forward failed)
                // this receipt renders with swap=null, so solanaSwap/giwaSwap are both false and the
                // venue would wrongly read "Uniswap / Sepolia" for a GIWA/Solana convert-and-send.
                venue={solanaSwap ? 'solana' : giwaSwap ? 'giwa' : swapSend ? (swapSend.venue === 'giwa' ? 'giwa' : 'solana') : 'uniswap'}
              />
            )
          ) : phase === 'executing' ? (
            <span className="muted">{canReal || canSwap || canSwapSend || canStake ? 'Signing in your browser & broadcasting…' : 'Signing on device & broadcasting…'}</span>
          ) : canStake && stake ? (
            <span className="muted">
              Ready to stake · <b>{fmtAmount(Number(stake.amountBase) / 10 ** (NATIVE_DECIMALS[stake.asset] ?? 18))} {stake.asset}</b> on <b>{stake.chainLabel}</b> via SimpleStaking (signed in your browser)
            </span>
          ) : canReal && real ? (
            <span className="muted">
              Ready to sign with your wallet · your {real.asset} on {real.chainLabel}: <b>{bal ?? '…'}</b>
            </span>
          ) : canSwap && swap ? (
            <div className="swap-quote">
              <span className="muted">
                {onMainnet && solanaSwap ? 'Live aggregator quote:' : solanaSwap ? 'Live solAMM quote:' : giwaSwap ? 'Live GIWA AMM quote:' : 'Real Uniswap quote:'}{' '}
                <b>
                  {swapQuote
                    ? `${fmtAmount(Number(swapQuote.amountOut) / 10 ** swapQuote.decimalsOut)} ${swapQuote.symbolOut}`
                    : quoting
                      ? 'fetching…'
                      : '—'}
                </b>{' '}
                {onMainnet && solanaSwap ? `· via ${aggQuote?.tool ?? aggQuote?.providerId ?? 'the aggregator'} on Solana mainnet (real funds)` : solanaSwap ? '· swaps on our on-chain Solana DEX' : giwaSwap ? '· swaps on our on-chain GIWA DEX' : '· swaps in-browser on Sepolia'}
              </span>
              {swapQuote && (
                <div className="slippage">
                  <span className="slippage-label">Max slippage</span>
                  <div className="slippage-opts" role="group" aria-label="Max slippage">
                    {[10, 50, 100].map((bps) => (
                      <button
                        key={bps}
                        className={`slippage-opt${slippageBps === bps ? ' active' : ''}`}
                        aria-pressed={slippageBps === bps}
                        onClick={() => setSlippageBps(bps)}
                      >
                        {bps / 100}%
                      </button>
                    ))}
                  </div>
                  <span className="slippage-min">
                    You receive at least <b>{minOutDisplay} {swapQuote.symbolOut}</b>
                  </span>
                </div>
              )}
            </div>
          ) : canSwapSend && swapSend ? (
            <div className="swap-quote">
              <span className="muted">
                Live {swapSend.venue === 'giwa' ? 'GIWA AMM' : 'Solana solAMM'} quote:{' '}
                <b>
                  {swapQuote
                    ? `${fmtAmount(Number(swapQuote.amountOut) / 10 ** swapQuote.decimalsOut)} ${swapQuote.symbolOut}`
                    : quoting
                      ? 'fetching…'
                      : '—'}
                </b>{' '}
                · converts on our {swapSend.venue === 'giwa' ? 'GIWA DEX' : 'Solana devnet AMM'}, then forwards to{' '}
                <code className="wl-mono">{shortAddr(swapSend.recipient)}</code> — both legs on{' '}
                {swapSend.venue === 'giwa' ? 'GIWA' : 'Solana'}
              </span>
              {swapQuote && (
                <div className="slippage">
                  <span className="slippage-label">Max slippage</span>
                  <div className="slippage-opts" role="group" aria-label="Max slippage">
                    {[10, 50, 100].map((bps) => (
                      <button
                        key={bps}
                        className={`slippage-opt${slippageBps === bps ? ' active' : ''}`}
                        aria-pressed={slippageBps === bps}
                        onClick={() => setSlippageBps(bps)}
                      >
                        {bps / 100}%
                      </button>
                    ))}
                  </div>
                  <span className="slippage-min">
                    Forwards at least <b>{minOutDisplay} {swapQuote.symbolOut}</b> to the recipient
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="muted">Awaiting authorization.</span>
          )}
        </Stage>
      </div>

      {getTxMode() === 'auto' && !autoDec.auto && autoDec.reason && (phase === 'planned' || phase === 'authorized') && (
        <p className="muted" style={{ color: 'var(--medium)' }}>⚡ Auto paused — {autoDec.reason}. Confirm manually below.</p>
      )}
      <div className="flow-actions">
        {phase === 'planned' &&
          (testnetSwapOnMainnet ? (
            <button className="btn primary" disabled title="Open the Swap tab for a real mainnet swap (LI.FI + deBridge)">
              Use the Swap tab for mainnet →
            </button>
          ) : (
            <button className="btn primary" onClick={() => void authorize()}>
              Review &amp; authorize
            </button>
          ))}
        {phase === 'authorized' &&
          permission?.mayProceedToSign &&
          (canReal || canSwap || canSwapSend || canStake) &&
          (() => {
            // A swap can't be signed without its live on-chain quote. If the one-shot quote fetch
            // FAILED (not just still in flight), don't leave an enabled button that throws the same
            // "try again in a second" forever — disable it and offer a real re-quote.
            const swapNeedsQuote = (canSwap || canSwapSend) && !swapQuote;
            // Reverse testnet swap (dUSDC→SOL) selling more dUSDC than the wallet holds → the on-chain
            // SPL-Token transfer would revert with `custom program error: 0x1`. Block BEFORE signing and
            // say why. dusdcBal===null means the balance read hasn't landed / failed → don't block (the
            // on-chain revert + humanizeTxError remain the safety net; a false block is worse than a net).
            const reverseShort =
              solanaSwapReverse && !onMainnet && swap != null && dusdcBal !== null && BigInt(swap.amountInBase) > dusdcBal;
            // planCurve / wrongCurve are hoisted to component scope (so the Auto effect gates on them too).
            return (
              <>
                <button className="btn primary" onClick={() => void execute()} disabled={recipientBlocked || planChainChecking || swapNeedsQuote || wrongCurve || reverseShort}>
                  {recipientBlocked
                    ? 'Blocked by Sentinel'
                    : wrongCurve
                      ? 'Wrong account for this chain'
                      : reverseShort
                        ? 'Not enough dUSDC'
                        : planChainChecking
                          ? 'Checking recipient…'
                          : swapNeedsQuote
                            ? quoteFailed
                              ? 'Quote unavailable'
                              : 'Fetching quote…'
                            : 'Sign on device & execute'}
                </button>
                {reverseShort && swap != null && dusdcBal !== null && (
                  <p className="muted" style={{ color: 'var(--medium)' }}>
                    This sells <b>{fmtMinBase(swap.amountInBase, SOLAMM_DECIMALS)} dUSDC</b>, but this wallet holds only{' '}
                    <b>{fmtMinBase(dusdcBal, SOLAMM_DECIMALS)} dUSDC</b>. Get dUSDC first — swap SOL → USDC — then sell it back for SOL.
                    Nothing was signed.
                  </p>
                )}
                {wrongCurve && (
                  <p className="muted" style={{ color: 'var(--medium)' }}>
                    This plan settles on {planCurve === 'sol' ? 'Solana' : planCurve === 'btc' ? 'Bitcoin' : 'an EVM chain'}, but your active
                    account is an imported {importedKind === 'sol' ? 'Solana' : 'EVM'}-only key — switch to your main account (or one on this chain).
                  </p>
                )}
                {swapNeedsQuote && quoteFailed && !quoting && (
                  <button className="wl-link" onClick={() => setQuoteAttempt((n) => n + 1)}>
                    ↻ Retry quote
                  </button>
                )}
                {quoteFailed && quoteErrMsg && (
                  <p className="muted" style={{ color: 'var(--medium)', fontSize: 12, margin: '2px 0 0' }}>
                    {quoteErrMsg}
                  </p>
                )}
              </>
            );
          })()}
        {phase === 'authorized' && permission?.mayProceedToSign && !canReal && !canSwap && !canSwapSend && !canStake && (
          <span className="muted">This plan isn’t executable from the browser wallet yet — nothing will be signed or broadcast.</span>
        )}
        {phase === 'authorized' && permission && !permission.mayProceedToSign && (
          <span className="muted">Can’t proceed until the requirements above are met.</span>
        )}
      </div>

      {mainnetAsk && real && (
        <div className="mn-confirm" role="alertdialog" aria-label="Confirm real mainnet transaction">
          <p className="mn-h">⚠️ Real mainnet transaction — this moves REAL funds</p>
          <p className="mn-lead">
            Sending <b>{fmtAmount(Number(real.amountBase) / 1e18)} {real.asset}</b> on <b>Ethereum mainnet</b> to{' '}
            <code className="mn-addr">{real.to}</code>
            {real.amountUsd !== undefined && <> · ≈ <b>${real.amountUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></>}. It is
            signed on your device and cannot be undone.
          </p>
          {(real.amountUsd === undefined || real.amountUsd > 1000) && (
            <label className="mn-hv">
              <input type="checkbox" checked={hvAck} onChange={(e) => setHvAck(e.target.checked)} />{' '}
              {real.amountUsd === undefined
                ? 'This transfer is unpriced — I confirm sending it anyway (treated as a high-value transaction).'
                : 'I understand this exceeds the $1,000 mainnet spend cap.'}
            </label>
          )}
          <div className="wl-actions">
            <button
              className="btn primary wl-danger-btn"
              onClick={() => void runExecute(hvAck)}
              disabled={(real.amountUsd === undefined || real.amountUsd > 1000) && !hvAck}
            >
              Confirm &amp; sign real-funds transaction
            </button>
            <button className="wl-link" onClick={() => { setMainnetAsk(false); setHvAck(false); setPhase('authorized'); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="authz-deny err-line" role="alert">{err}</p>}
      <p className="flow-foot">
        plan {plan.planId} ·{' '}
        {canStake && stake
          ? `real ETH staking · signed in your browser (non-custodial) → ${stake.chainLabel}`
          : canReal
          ? `real signing in your browser (non-custodial) → ${real?.chainLabel ?? ''}`
          : canSwapSend
            ? `real 2-leg compound · convert + forward, both signed in your browser (non-custodial) → ${swapSend?.venue === 'giwa' ? 'GIWA Sepolia' : 'Solana devnet'}`
            : canSwap
            ? solanaSwap
              ? onMainnet
                ? 'real aggregator swap · quote + signature in your browser (non-custodial) → Solana mainnet'
                : 'real AMM swap · quote + signature in your browser (non-custodial) → Solana devnet'
              : giwaSwap
                ? 'real AMM swap · quote + signature in your browser (non-custodial) → GIWA Sepolia'
                : 'real Uniswap v3 swap · quote + signature in your browser (non-custodial) → Sepolia'
            : real || swap
              ? 'unlock your wallet to sign & broadcast this for real'
              : 'not executable in-browser yet — nothing will be signed or broadcast'}
      </p>
    </div>
  );
}

function OutcomeView({
  outcome,
  onExecuted,
  onPick,
}: {
  outcome: Outcome;
  onExecuted?: (item: ActivityItem) => void;
  /** Answer a clarify by picking one of its offered choices. */
  onPick?: (choice: string) => void;
}): JSX.Element {
  switch (outcome.kind) {
    case 'plan':
      return <PlanFlow plan={outcome.plan} {...(onExecuted ? { onExecuted } : {})} />;
    case 'clarify':
      return (
        <div className="card info">
          <span className="kind">Needs a detail</span>
          <p className="flow-lead">{outcome.question}</p>
          {outcome.options && (
            <div className="chips">
              {outcome.options.map((o) => (
                // Clickable: these were inert <span>s, so the only way to answer was to type —
                // and typing the answer did not work either (see the slot-fill in `submit`).
                <button key={o} className="chip" onClick={() => onPick?.(o)} type="button">
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case 'answer':
      return (
        <div className="card info">
          <p className="flow-lead">{outcome.question}</p>
        </div>
      );
    case 'automation': {
      // HONESTY: nothing in this build persists, schedules, or MONITORS these intents — there is no
      // price watcher or scheduler. Saying a rule "becomes" active would arm a false stop-loss. Say
      // plainly it won't fire on its own, and never call a one-shot emergency-exit "recurring".
      const isTrigger = outcome.intentKind === 'emergency_exit';
      return (
        <div className="card info">
          <span className="kind">{isTrigger ? 'Protective trigger — noted' : 'Scheduled rule — noted'}</span>
          <p className="flow-lead">
            {isTrigger
              ? 'Automated price monitoring isn’t active yet, so this won’t fire on its own — nothing is armed. Watch the market and act manually for now.'
              : 'Scheduled/recurring rules aren’t active yet, so this won’t run automatically — run it manually each time for now.'}
          </p>
        </div>
      );
    }
    case 'rejected':
      return (
        <div className="card rejected">
          <div className="flow-top">
            <span className="kind">Not possible</span>
            {/* Only surface a risk badge when risk is actually the reason — a "Low risk"
                badge on a feasibility rejection (e.g. "you don't hold any BNB") is noise. */}
            {outcome.risk.level !== 'low' && <RiskBadge level={outcome.risk.level} />}
          </div>
          <p className="flow-lead">{outcome.reason}</p>
          {outcome.risk.reasons.length > 0 && (
            <ul className="reasons">
              {outcome.risk.reasons.map((r, i) => (
                <li key={`${i}-${r}`}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      );
  }
}

interface Turn {
  q: string;
  res?: PlanResponse;
  error?: string;
  pending?: boolean;
  /** A client-side bridge intent (not a backend intent kind) — Sepolia → GIWA deposit. */
  bridge?: BridgeRoute;
}


const EXEC_STATUS_ICON: Record<ExecutionStatus, string> = {
  completed: '✓',
  parked: '⏸',
  failed: '✕',
  running: '…',
};

/** A compact, session-level transaction history of what actually executed. */
function ActivityPanel({ items }: { items: ActivityItem[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className="activity card">
      <div className="activity-head">
        <span className="activity-title">Activity</span>
        <span className="activity-count">{items.length}</span>
      </div>
      <ul className="activity-list">
        {items.map((a) => (
          <li className={`activity-row st-${a.status}`} key={a.id}>
            <span className="activity-ic">{EXEC_STATUS_ICON[a.status]}</span>
            <span className="activity-kind">{titleCase(a.kind)}</span>
            <span className="activity-chain">{chainName(a.chainId)}</span>
            {a.txid ? (
              a.explorerUrl ? (
                <a className="activity-txid" href={a.explorerUrl} target="_blank" rel="noreferrer" title={a.txid}>
                  {shortAddr(a.txid)} ↗
                </a>
              ) : (
                <span className="activity-txid" title={a.txid}>
                  {shortAddr(a.txid)}
                </span>
              )
            ) : (
              <span className="activity-txid">{a.status}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function App(): JSX.Element {
  const [online, setOnline] = useState<boolean | null>(null);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  // `entered` gates the shell. It is NOT raw isUnlocked(): createWallet unlocks the
  // vault before the write-it-down backup quiz, so AuthGate flips this only once the
  // wallet is truly ready (unlock / import / backup-confirmed). A poll flips it back
  // if the wallet locks itself (idle auto-lock) from under us.
  const [entered, setEntered] = useState(() => isUnlocked());
  const [authView, setAuthView] = useState<WalletView>('checking');

  // Live backend-health ping. A ONE-SHOT check goes stale the moment the API dies after
  // load (the dot would lie "connected"); so we re-ping on an interval AND whenever the
  // user returns to the tab — the header dot always reflects the API's ACTUAL state.
  // Latest-wins: pings fire every 5s but the status GET can take up to 30s, so several overlap;
  // without this a slow, stale result could resolve last and flip the dot to the wrong state.
  const healthReqRef = useRef(0);
  const checkHealth = useCallback(() => {
    const reqId = ++healthReqRef.current;
    void apiHealthy()
      .then((ok) => {
        if (reqId === healthReqRef.current) setOnline(ok);
      })
      .catch(() => {
        if (reqId === healthReqRef.current) setOnline(false);
      })
      .finally(() => {
        if (reqId === healthReqRef.current) setLastCheck(Date.now());
      });
  }, []);
  useEffect(() => {
    checkHealth();
    const t = setInterval(checkHealth, 5000);
    const onFocus = (): void => checkHealth();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkHealth]);
  useEffect(() => {
    // Watch for the wallet locking itself (idle auto-lock). On the unlocked → locked
    // EDGE we also revoke the SIWE session, so a warm bearer token can't outlive the
    // locked vault (the manual `doLock` already does this; this closes the auto-lock
    // path). Guarded to the edge so it fires signOut() once, not every 500ms tick.
    let wasUnlocked = isUnlocked();
    const t = setInterval(() => {
      const now = isUnlocked();
      if (!now) {
        if (wasUnlocked) void signOut();
        setEntered((e) => (e ? false : e));
      }
      wasUnlocked = now;
    }, 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // Cross-tab safety. Each tab holds its OWN in-memory keyring, but the sealed vault is shared in
    // localStorage. If the wallet is WIPED ("Remove wallet" / forgot-password reset) in another tab,
    // that tab deletes `iw.vault.v1` — but THIS tab's warm keyring would keep signing txs and SIWE
    // messages for a wallet the user just "permanently removed". React to the vault's removal by
    // locking here too, and drop the session so no warm bearer token outlives it. (key === null is a
    // whole-storage clear().)
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== null && e.key !== 'iw.vault.v1') return;
      if (localStorage.getItem('iw.vault.v1') !== null) return; // vault still present — not a wipe
      lock();
      setEntered(false);
      void signOut();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div className={`app ${entered ? 'entered' : 'landing'}`}>
      <header>
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 1.4c.7 5.6 1.6 7.4 6.6 9.1 1.5.5 1.5 2.5 0 3-5 1.7-5.9 3.5-6.6 9.1-.7-5.6-1.6-7.4-6.6-9.1-1.5-.5-1.5-2.5 0-3 5-1.7 5.9-3.5 6.6-9.1Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <h1>Intent Wallet</h1>
        </div>
        <span
          className={`status ${online ? 'up' : online === false ? 'down' : ''}`}
          onClick={checkHealth}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') checkHealth(); }}
          style={{ cursor: 'pointer' }}
          title={
            (online == null
              ? 'Checking the backend API…'
              : online
                ? 'Backend API is up (auto-checked every 5s)'
                : 'Backend API is DOWN — start it, then click to re-check') +
            (lastCheck ? ` · last checked ${new Date(lastCheck).toLocaleTimeString()}` : '')
          }
        >
          <span className="dot" />
          {/* Live region so a SR user is told when the backend goes online/offline — the parent is a
              role="button" whose name change wouldn't otherwise be re-announced. */}
          <span role="status" aria-live="polite">
            {online == null ? 'connecting…' : online ? 'API online' : 'API offline'}
          </span>
        </span>
      </header>

      {!entered ? (
        // Before login there is no dashboard and no chat — just create/unlock the
        // wallet. The organised shell (nav + sections) appears only once you're in.
        <section className="auth">
          <span className={`auth-spark${authView === 'backup' ? ' shield' : ''}`} aria-hidden="true">
            {authView === 'backup' ? (
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2l7 3v6c0 4.6-3 8.1-7 9-4-.9-7-4.4-7-9V5l7-3z" fill="currentColor" />
                <path d="M9 12l2 2 4-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 1.4c.7 5.6 1.6 7.4 6.6 9.1 1.5.5 1.5 2.5 0 3-5 1.7-5.9 3.5-6.6 9.1-.7-5.6-1.6-7.4-6.6-9.1-1.5-.5-1.5-2.5 0-3 5-1.7 5.9-3.5 6.6-9.1Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </span>
          <h2 className="auth-title">{authView === 'backup' ? 'Back up your recovery phrase' : 'Intent Wallet'}</h2>
          {authView === 'none' && (
            <p className="auth-sub">Your keys are generated and sealed on this device — they never touch a server.</p>
          )}
          <AuthGate onEntered={() => setEntered(true)} onView={setAuthView} />
        </section>
      ) : (
        <WalletShell onExit={() => setEntered(false)} />
      )}
      {/* Subtle global footer — project resources + founder links reachable from every screen
          (external links open in a new tab; rel=noopener keeps the wallet tab uncontrolled). */}
      <footer className="app-foot">
        <a href="/pitch.html" target="_blank" rel="noopener noreferrer">Pitch deck</a>
        <span className="foot-dot" aria-hidden="true">·</span>
        <a href="/docs.html" target="_blank" rel="noopener noreferrer">One-pager</a>
        <span className="foot-dot" aria-hidden="true">·</span>
        <a href="https://www.waquar.xyz/" target="_blank" rel="noopener noreferrer">Website</a>
        <span className="foot-dot" aria-hidden="true">·</span>
        <a href="https://x.com/itsjackdev" target="_blank" rel="noopener noreferrer">X</a>
        <span className="foot-dot" aria-hidden="true">·</span>
        <a href="https://t.me/BullishBlox" target="_blank" rel="noopener noreferrer">Telegram</a>
        <span className="foot-dot" aria-hidden="true">·</span>
        <a href="https://github.com/waquar213/giwa-intent-wallet" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
      {/* Privacy-friendly product analytics (Vercel): page views + the anonymous 'wallet_created' event.
          No cookies, no PII, no wallet data; a no-op off-Vercel. Enable "Analytics" in the Vercel project. */}
      <Analytics />
    </div>
  );
}
