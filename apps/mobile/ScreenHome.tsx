/**
 * Home — the premium front door. The net-worth hero has FOUR honest states, and the difference
 * between them is load-bearing for the product's "never show fake/misleading data" doctrine:
 *
 *   LOADING  — a pulsing skeleton (never a broken-looking stub).
 *   ERROR    — we could NOT read the wallet (all balance reads failed, or no identity). A funded
 *              user whose network blipped must NEVER be shown "$0 / add crypto" — that reads as
 *              "your money is gone." So a failed read gets its own "couldn't reach the network"
 *              card with Retry, distinct from a genuinely-empty wallet.
 *   EMPTY    — reads genuinely SUCCEEDED and every balance is 0. A warm first-run add-funds moment.
 *   FUNDED   — real holdings. Net worth, a REAL 24h change (suppressed unless the total is trusted),
 *              and a per-asset preview showing real native amounts. If some chains/prices couldn't
 *              load, the total is annotated "some balances unavailable" and the change pill hides —
 *              a partial total is never presented as complete.
 *
 * Data comes straight from fetchLiveBalances() + fetchEvmHistory() — no fabricated number, trend,
 * or holding. fetchLiveBalances is fail-soft (a failed read is `null`, a genuine zero is `0`), so
 * Home distinguishes the two by inspecting per-asset read/price nullability.
 *
 * Refresh: pull-to-refresh and the error Retry share one load(); Home also refetches on every mount
 * (it unmounts on tab switch) and is keyed on the active account upstream.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mono, radius, space, type as T, useTheme, type Palette } from './theme';
import { Card, CardLabel, TokenIcon, fmtUsd } from './ui';
import { fetchLiveBalances, type LiveBalances } from './balances';
import { accountCount, activeAccountIndex, currentIdentity } from './wallet';
import { apiHealthy, fetchEvmHistory, type HistoryItem } from './api';
import { useMode, isPro, isDev } from './mode';

export interface RecentItem {
  dir: 'in' | 'out' | 'swap';
  label: string;
  when: string;
  failed: boolean;
}

interface HomeProps {
  onOpenSend: () => void;
  onOpenReceive: () => void;
  onGoAI: () => void;
  onSubmitIntent: (text: string) => void;
  onManageAccount: () => void;
}

const EXAMPLES = ['Swap 100 USDC for ETH', 'Send 0.1 ETH'] as const;
// Placeholder examples that cycle under the intent bar so it reads as a live, alive input.
const HINTS = ['swap 100 USDC for ETH', 'send 0.1 ETH to alice', 'stake 1 ETH', 'what can I do here?'] as const;
const DIR_GLYPH: Record<RecentItem['dir'], string> = { in: '↓', out: '↑', swap: '⇄' };
const DIR_WORD: Record<RecentItem['dir'], string> = { in: 'Received', out: 'Sent', swap: 'Swap' };
const dirTint = (c: Palette): Record<RecentItem['dir'], string> => ({ in: c.success, out: c.text2, swap: c.accent });

/** Trim a native amount to a readable precision (more dp for dust). FLOORS — toLocaleString's
 *  maximumFractionDigits rounds half-up (0.999996 → "1"), which would OVERSTATE the holding on the
 *  primary screen and show more than is sendable (the send path floors). Mirrors ScreenPortfolio/fmtHeld. */
const fmtAmt = (n: number): string => {
  const dp = n !== 0 && Math.abs(n) < 0.001 ? 8 : 5;
  const floored = Math.floor(n * 10 ** dp) / 10 ** dp;
  return floored.toLocaleString('en-US', { maximumFractionDigits: dp });
};

/** Map real EVM (Sepolia) history into the last few Recent rows. */
function toRecent(items: HistoryItem[], address: string): RecentItem[] {
  const me = address.toLowerCase();
  return items.slice(0, 3).map((it) => {
    const sent = it.from.toLowerCase() === me;
    let eth = 0;
    try {
      eth = Number(BigInt(it.valueWei)) / 1e18; // BigInt first — no pre-divide precision loss, guards junk input
    } catch {
      eth = 0;
    }
    return {
      dir: sent ? 'out' : 'in',
      label: `${fmtAmt(eth)} ETH`,
      when: new Date(it.timeStamp * 1000).toLocaleDateString(),
      failed: it.failed,
    };
  });
}

/** A gently-pulsing skeleton — reads as "loading", never as a broken/redacted field. Honors Reduce Motion. */
function Skeleton({ width, height }: { width: number; height: number }): React.JSX.Element {
  const c = useTheme();
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    const start = (): void => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(op, { toValue: 0.8, duration: 750, useNativeDriver: true }),
          Animated.timing(op, { toValue: 0.35, duration: 750, useNativeDriver: true }),
        ]),
      );
      loop.start();
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) op.setValue(0.5);
        else start();
      })
      .catch(() => !cancelled && start());
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [op]);
  // Decorative — the loading wrapper carries the single busy announcement (see the hero).
  return <Animated.View importantForAccessibility="no" style={{ width, height, borderRadius: radius.sm, backgroundColor: c.surface2, opacity: op }} />;
}

function Action({ glyph, label, onPress, accent }: { glyph: string; label: string; onPress: () => void; accent?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={s.action} onPress={onPress} accessibilityRole="button" accessibilityLabel={accent ? `${label}, powered by AI` : label}>
      <View style={[s.actionCircle, accent && s.actionCircleAccent]}>
        <Text style={[s.actionGlyph, accent && { color: c.accent }]} importantForAccessibility="no" accessibilityElementsHidden>
          {glyph}
        </Text>
      </View>
      <Text style={s.actionLabel} importantForAccessibility="no">
        {label}
      </Text>
    </Pressable>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A placeholder that softly cross-fades through example intents, so the intent bar feels alive. */
function CyclingHint(): React.JSX.Element {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [i, setI] = useState(0);
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(op, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setI((x) => (x + 1) % HINTS.length);
        Animated.timing(op, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 2800);
    return () => clearInterval(id);
  }, [op]);
  return (
    <Animated.Text style={[s.commandSub, { opacity: op }]} numberOfLines={1} importantForAccessibility="no">
      “{HINTS[i]}”
    </Animated.Text>
  );
}

export default function Home({ onOpenSend, onOpenReceive, onGoAI, onSubmitIntent, onManageAccount }: HomeProps): React.JSX.Element {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const tint = useMemo(() => dirTint(c), [c]);
  const [data, setData] = useState<LiveBalances | null | undefined>(undefined);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A monotonic run id makes load() concurrency-safe: only the LATEST invocation commits state,
  // so a slow response can't clobber a newer one, out-of-order Recent can't stick, and an unmount
  // (Home unmounts on every tab switch) invalidates any in-flight load — no setState-after-unmount.
  const runId = useRef(0);
  const load = useCallback(async (isRefresh: boolean): Promise<void> => {
    const my = ++runId.current;
    if (isRefresh) setRefreshing(true);
    else setData(undefined); // skeleton on first load + Retry
    const me = currentIdentity();
    const [bal, health] = await Promise.all([
      fetchLiveBalances(isRefresh).catch(() => null), // pull-to-refresh forces a fresh fetch; a tab-visit serves cache
      apiHealthy().catch(() => false),
    ]);
    if (isRefresh) setRefreshing(false); // always clear our own spinner, even if superseded
    if (my !== runId.current) return; // a newer load (or an unmount) superseded this one
    setData(bal);
    setOnline(health);
    // Recent is secondary + best-effort: a failure here shows an honest empty list, never an error.
    if (me?.evm.address) {
      const addr = me.evm.address;
      fetchEvmHistory(addr)
        .then((items) => {
          if (my === runId.current) setRecent(toRecent(items, addr));
        })
        .catch(() => {
          if (my === runId.current) setRecent([]);
        });
    } else {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      runId.current++; // invalidate any in-flight load on unmount
    };
  }, [load]);

  const mode = useMode();
  const pro = isPro(mode); // pro OR developer
  const dev = isDev(mode); // developer only
  const greeting = greetingFor(new Date().getHours());
  const network = 'Mainnet'; // the hero is computed from a.mainnet.* — the chip must match the numbers

  // ── honest state derivation ──────────────────────────────────────────────────
  const assets = data?.assets ?? [];
  const readOk = assets.some((a) => a.mainnet.amount != null); // at least one balance read succeeded
  const allReadOk = assets.length > 0 && assets.every((a) => a.mainnet.amount != null);
  const priceOk = assets.some((a) => a.priceUsd != null); // ANY asset priced — only for dev diagnostics
  const held = assets.filter((a) => (a.mainnet.amount ?? 0) > 0);
  const hasFunds = held.length > 0;
  const heldPriced = held.every((a) => a.priceUsd != null); // EVERY held asset priced → total is complete
  const totalUsd = data?.totalUsd ?? null;
  const chgPct = data?.change24hPct ?? null;
  const chgUsd = data?.change24hUsd ?? null;
  const up = (chgPct ?? 0) >= 0;
  // Trustworthy only if every chain read AND every HELD asset is priced. balances.ts sums only
  // priced+read assets, so a held-but-unpriced asset silently under-counts the total — never
  // present that as complete (show a warning + suppress the change pill instead).
  const trustworthy = allReadOk && heldPriced;

  const loading = data === undefined;
  const funded = !loading && hasFunds;
  const emptyGenuine = !loading && !hasFunds && allReadOk; // reads succeeded AND everything is truly 0
  const partialEmpty = !loading && !funded && !emptyGenuine && readOk; // some chains read, some failed, no funds seen
  const errored = !loading && !funded && !emptyGenuine && !readOk; // data===null or EVERY read failed (total outage)

  // change pill only when the total is real, trusted, AND rounds to a visible (≥ $0.01) figure —
  // never "$0 ▲ 2.3%" (dust rounding) and never on a partial/under-counted total.
  const totalRounded = totalUsd != null ? Math.round(totalUsd * 100) / 100 : 0;
  const showChange = funded && trustworthy && chgPct != null && totalRounded >= 0.01;
  const degradedNote = funded && !trustworthy ? (!allReadOk ? 'Some balances couldn’t load — pull to refresh' : 'Live prices unavailable — pull to refresh') : null;
  const netWorthLabel = totalUsd != null ? fmtUsd(totalUsd) : '—';
  // Announce what's actually DISPLAYED: '$0' in the genuine-empty case (the row shows '$0'), and
  // "unavailable" only when a funded wallet's total is truly unknown (the row shows '—').
  const displayedWorth = funded ? netWorthLabel : '$0';
  const heroA11y = `Net worth ${displayedWorth === '—' ? 'unavailable' : displayedWorth}${showChange && chgPct != null ? `, ${up ? 'up' : 'down'} ${Math.abs(chgPct).toFixed(2)} percent past 24 hours` : ''}`;
  const acctA11y = `Account ${activeAccountIndex() + 1}${accountCount() > 1 ? ` of ${accountCount()}` : ''}, ${network}, ${online == null ? 'checking connection' : online ? 'service connected' : 'service offline'}`;

  // Developer-mode diagnostics — all REAL reads, never fabricated.
  const readCount = assets.filter((a) => a.mainnet.amount != null).length;
  const failedChains = assets.filter((a) => a.mainnet.amount == null).map((a) => a.symbol);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.canvas }}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={c.text2} colors={[c.accent]} />}
    >
      {/* header: greeting + account chip. Simple mode hides the network/connection plumbing;
          Pro/Developer surface the network label + live connection dot. */}
      <View style={s.header}>
        <Text style={s.greeting}>{greeting}</Text>
        <Pressable
          style={s.acctChip}
          onPress={onManageAccount}
          accessibilityRole="button"
          accessibilityLabel={`${pro ? acctA11y : `Account ${activeAccountIndex() + 1}${accountCount() > 1 ? ` of ${accountCount()}` : ''}`}. Manage accounts.`}
        >
          {pro && <View style={[s.statusDot, { backgroundColor: online == null ? c.text3 : online ? c.success : c.danger }]} importantForAccessibility="no" />}
          <Text style={s.acctTxt} importantForAccessibility="no">
            Account {activeAccountIndex() + 1}
            {accountCount() > 1 ? ` of ${accountCount()}` : ''}
            {pro ? ` · ${network}` : ''}
          </Text>
          <Text style={s.acctChevron} importantForAccessibility="no">
            ›
          </Text>
        </Pressable>
      </View>

      {/* NET WORTH — straight on the canvas, no boxy card. Big, clean, airy. */}
      <View style={s.hero}>
        <CardLabel>NET WORTH</CardLabel>

        {loading && (
          <View style={{ marginTop: space.xs, gap: space.sm }} accessible accessibilityLabel="Loading your balance" accessibilityState={{ busy: true }}>
            <Skeleton width={188} height={46} />
            <Skeleton width={120} height={13} />
          </View>
        )}

        {(funded || emptyGenuine) && (
          <View style={s.nwRow} accessible accessibilityLabel={heroA11y}>
            <Text style={s.netWorth} numberOfLines={1} adjustsFontSizeToFit importantForAccessibility="no">
              {funded ? netWorthLabel : '$0'}
            </Text>
            {showChange && chgPct != null && (
              <View style={[s.changePill, { backgroundColor: up ? 'rgba(52,199,123,0.14)' : 'rgba(248,113,113,0.14)' }]} importantForAccessibility="no">
                <Text style={[s.changeTxt, { color: up ? c.success : c.danger }]}>
                  {up ? '▲' : '▼'} {chgUsd != null ? `${fmtUsd(Math.abs(chgUsd))} ` : ''}
                  {Math.abs(chgPct).toFixed(2)}%
                </Text>
              </View>
            )}
          </View>
        )}
        {funded && degradedNote ? (
          <Text style={s.warnNote}>{degradedNote}</Text>
        ) : funded && showChange ? (
          <Text style={s.nwSub}>Past 24 hours</Text>
        ) : null}

        {partialEmpty && (
          <>
            <Text style={s.netWorth}>$0</Text>
            <Text style={s.warnNote}>We couldn’t read some of your balances — pull to refresh.</Text>
          </>
        )}
        {errored && (
          <>
            <Text style={s.errorTitle}>Couldn’t reach the network</Text>
            <Text style={s.nwSub}>We couldn’t read your balances — your funds are safe.</Text>
          </>
        )}
        {(errored || partialEmpty) && (
          <Pressable style={s.retryBtn} onPress={() => void load(false)} accessibilityRole="button" accessibilityLabel="Retry loading balances">
            <Text style={s.retryTxt}>Try again  ↻</Text>
          </Pressable>
        )}
      </View>

      {/* funded holdings — a clean list on the canvas, rows + hairline dividers */}
      {funded && (
        <View style={s.holdings}>
          {held.map((a, i) => {
            const amount = a.mainnet.amount ?? 0;
            const value = a.priceUsd != null ? amount * a.priceUsd : null;
            const chg = a.change24hPct;
            return (
              <View key={a.symbol} style={[s.holdRow, i > 0 && s.divider]}>
                <TokenIcon symbol={a.symbol} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.holdSym}>{a.symbol}</Text>
                  <Text style={s.holdName}>
                    {fmtAmt(amount)} {a.symbol}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.holdVal}>{value != null ? fmtUsd(value) : '—'}</Text>
                  {value != null && chg != null && (
                    <Text style={{ ...T.caption, color: chg >= 0 ? c.success : c.danger }}>
                      {chg >= 0 ? '+' : ''}
                      {chg.toFixed(2)}%
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* developer-mode diagnostics — real reads, honestly labelled */}
      {dev && !loading && (
        <Card style={s.devCard}>
          <Text style={s.devLine}>api service · {online == null ? 'checking' : online ? 'connected' : 'offline'}</Text>
          <Text style={s.devLine}>
            balances · {readCount}/{assets.length} chains read{failedChains.length ? ` · failed: ${failedChains.join(', ')}` : ''}
          </Text>
          <Text style={s.devLine}>prices · {priceOk ? 'live (coingecko)' : 'unavailable'}</Text>
        </Card>
      )}

      {/* one quiet actions row — Receive is the natural first move at $0; Send/Swap stay available. */}
      {!loading && !errored && (
        <View style={s.actions}>
          <Action glyph="↑" label="Send" onPress={onOpenSend} />
          <Action glyph="↓" label="Receive" onPress={onOpenReceive} />
          <Action glyph="⇄" label="Swap" onPress={() => onSubmitIntent('Swap ')} />
        </View>
      )}

      {/* the intent bar — the hero of the app. A live-feeling command surface (spark + cycling
          placeholder) with its suggestion chips CONNECTED into the same card as one unit. */}
      <Pressable onPress={onGoAI} accessibilityRole="button" accessibilityLabel="Open the AI command bar — tell your wallet what to do">
        <Card style={s.intentCard}>
          <View style={s.intentTop}>
            <View style={s.commandGlyphBox}>
              <Text style={s.commandGlyph} importantForAccessibility="no">
                ✦
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.commandTitle}>Tell your wallet what to do</Text>
              <CyclingHint />
            </View>
            <Text style={s.commandArrow} importantForAccessibility="no">
              →
            </Text>
          </View>
          <View style={s.intentChips}>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} style={s.exChip} onPress={() => onSubmitIntent(ex)} accessibilityRole="button" accessibilityLabel={`Prefill the AI bar with: ${ex}`}>
                <Text style={s.exChipTxt}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      </Pressable>

      {/* recent activity — only when there IS real history; no empty-state filler on Home */}
      {recent.length > 0 && (
        <View style={s.recentSection}>
          <CardLabel>RECENT · SEPOLIA</CardLabel>
          <Card style={{ paddingVertical: space.xs }}>
            {recent.map((r, i) => (
              <View key={`${r.dir}-${r.label}-${i}`} style={[s.recentRow, i > 0 && s.divider]}>
                <View style={s.recentIcon}>
                  <Text style={[s.recentGlyph, { color: r.failed ? c.danger : tint[r.dir] }]} importantForAccessibility="no">
                    {DIR_GLYPH[r.dir]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.holdSym, r.failed && { color: c.danger }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text style={s.holdName}>
                    {r.failed ? 'Failed · ' : ''}
                    {DIR_WORD[r.dir]} · {r.when}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  content: { padding: space.base, paddingTop: space.base, paddingBottom: space.xxl, gap: space.lg },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { ...T.title, color: c.text },
  acctChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  acctTxt: { ...T.caption, color: c.text2 },
  acctChevron: { ...T.caption, color: c.text3, marginLeft: -2, marginTop: -1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },

  hero: { gap: space.sm, paddingTop: space.sm },
  nwRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  netWorth: { fontSize: 46, fontWeight: '800', letterSpacing: -1.5, color: c.text, flexShrink: 1, fontVariant: ['tabular-nums'] },
  changePill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  changeTxt: { fontSize: 13, fontWeight: '700' },
  nwSub: { ...T.caption, color: c.text3, lineHeight: 18 },
  warnNote: { ...T.caption, color: c.warn, lineHeight: 18 },
  errorTitle: { ...T.title, color: c.text, marginTop: space.xs },
  retryBtn: { alignSelf: 'flex-start', marginTop: space.md, borderRadius: radius.pill, paddingHorizontal: space.base, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: c.accent, backgroundColor: 'rgba(109,102,246,0.08)' },
  retryTxt: { ...T.caption, color: c.accent, fontWeight: '700' },

  holdings: { gap: 2 },
  holdRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  holdSym: { ...T.headline, color: c.text },
  holdName: { ...T.caption, color: c.text3, marginTop: 1 },
  holdVal: { ...T.headline, color: c.text, fontVariant: ['tabular-nums'] },

  devCard: { paddingVertical: space.md, gap: 4, backgroundColor: c.surface2 },
  devLine: { fontFamily: mono, fontSize: 11.5, color: c.text3 },

  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space.xs },
  action: { alignItems: 'center', gap: 7 },
  actionCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  actionCircleAccent: { backgroundColor: c.accentSubtle, borderColor: c.accent },
  actionGlyph: { fontSize: 22, fontWeight: '600', color: c.text },
  actionLabel: { ...T.caption, color: c.text2 },

  intentCard: { gap: space.md, borderColor: 'rgba(109,102,246,0.4)', backgroundColor: 'rgba(109,102,246,0.05)' },
  intentTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  intentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(109,102,246,0.18)', paddingTop: space.md },
  commandGlyphBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSubtle, alignItems: 'center', justifyContent: 'center' },
  commandGlyph: { fontSize: 20, color: c.accent },
  commandTitle: { ...T.headline, color: c.text },
  commandSub: { ...T.caption, color: c.text3, marginTop: 2 },
  commandArrow: { fontSize: 20, color: c.text3 },
  exChip: { backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  exChipTxt: { ...T.caption, color: c.text2 },

  recentSection: { gap: space.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  recentIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 },
  recentGlyph: { fontSize: 16, fontWeight: '700' },
});
