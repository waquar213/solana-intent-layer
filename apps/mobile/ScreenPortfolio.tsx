/**
 * Portfolio — the real net-worth view, read straight from the wallet's own on-chain balances.
 *
 * DESIGN LAW: mostly-monochrome, one accent; big number + small gray labels; mechanism
 * (per-chain / testnet detail) hidden unless Pro. NO FABRICATED DATA — every figure comes from
 * fetchLiveBalances(). We have a current value but NO time-series, so we OMIT any trend/sparkline
 * rather than invent one. Allocation weights are computed from the real mainnet USD values only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchLiveBalances, type AssetLive, type LiveBalances } from './balances';
import { isPro, useMode } from './mode';
import { radius, space, type as T, useTheme, type Palette } from './theme';
import { AllocationRing, Card, CardLabel, fmtUsd, StatusDot } from './ui';

/** Fixed palette for allocation slices — accent + two neutral-state colors, in asset order. */
const slicePalette = (c: Palette) => [c.accent, c.success, c.warn] as const;

/** Real mainnet USD value of an asset, or null when price/amount is unavailable (never faked). */
function mainnetUsd(a: AssetLive): number | null {
  return a.priceUsd != null && a.mainnet.amount != null ? a.mainnet.amount * a.priceUsd : null;
}

/** Native amount formatter — compact but honest ("—" when the chain read failed). */
function fmtAmount(n: number | null, symbol: string): string {
  if (n == null) return '—';
  // FLOOR at 6 dp (never round up) so a holding is never displayed LARGER than it is — mirrors web's
  // fmtHeld. toLocaleString's maximumFractionDigits rounds half-up (1.99996 → "2", 0.9999995 → "1"), and
  // the old dp=4-for-≥1 branch overstated further. Showing ≤ the true amount is the safe direction.
  const floored = n === 0 ? 0 : Math.floor(n * 1e6) / 1e6;
  return `${floored.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${symbol}`;
}

export default function Portfolio(): React.JSX.Element {
  const c = useTheme();
  const st = React.useMemo(() => makeStyles(c), [c]);
  const SLICE_PALETTE = React.useMemo(() => slicePalette(c), [c]);
  const mode = useMode();
  const pro = isPro(mode);

  const [data, setData] = useState<LiveBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Monotonic run id — only the latest load commits; unmount invalidates in-flight work.
  const runId = useRef(0);

  const load = useCallback(async (isRefresh: boolean): Promise<void> => {
    const my = ++runId.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await fetchLiveBalances(isRefresh).catch(() => null); // pull-to-refresh forces; tab-visit serves cache
    // Superseded (a newer load started, or unmounted): do nothing — the WINNER owns both spinners
    // and will clear them. Clearing here would either hide a spinner mid-flight (refresh case) or,
    // worse, leave `loading` stuck true forever when an initial load is superseded by a refresh.
    if (my !== runId.current) return;
    setData(res);
    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      runId.current++;
    };
  }, [load]);

  // ── honest state derivation — a network failure must NEVER render as "No holdings yet" ──
  // fetchLiveBalances is fail-soft: a failed read is `null`, a genuine zero is `0`. Distinguish them.
  const assets = data?.assets ?? [];
  const readOk = assets.some((a) => a.mainnet.amount != null); // at least one balance read succeeded
  const allReadOk = assets.length > 0 && assets.every((a) => a.mainnet.amount != null);
  const held = assets.filter((a) => (a.mainnet.amount ?? 0) > 0);
  const hasFunds = held.length > 0;
  const heldPriced = held.every((a) => a.priceUsd != null);
  const totalUsd = data?.totalUsd ?? null;
  const trustworthy = allReadOk && heldPriced; // total reflects every chain + every held asset

  const errored = !loading && (data === null || !readOk); // no identity, or EVERY read failed
  const funded = !loading && !errored && hasFunds;
  const emptyGenuine = !loading && !errored && !hasFunds && allReadOk; // reads succeeded, truly zero
  const partialEmpty = !loading && !errored && !hasFunds && !allReadOk; // some reads failed, rest zero
  const degradedNote = funded && !trustworthy ? (!allReadOk ? 'Some balances couldn’t load — pull to refresh' : 'Live prices unavailable — pull to refresh') : null;

  // Allocation slices from REAL mainnet USD values only. Assets with no priced value are omitted.
  const slices = assets
    .map((a, i) => ({ key: a.symbol, weight: mainnetUsd(a) ?? 0, color: SLICE_PALETTE[i % SLICE_PALETTE.length] }))
    .filter((sl) => sl.weight > 0);

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={st.scroll}
      contentContainerStyle={st.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={c.text3} colors={[c.accent]} />}
    >
      {errored ? (
        <Card style={st.stateCard}>
          <Text style={st.stateTitle}>Couldn’t reach the network</Text>
          <Text style={st.stateBody}>We couldn’t read your balances. Your funds are safe — this is only a display issue.</Text>
          <Pressable style={st.retry} onPress={() => void load(false)} accessibilityRole="button" accessibilityLabel="Retry loading balances">
            <Text style={st.retryTxt}>Try again  ↻</Text>
          </Pressable>
        </Card>
      ) : partialEmpty ? (
        <Card style={st.stateCard}>
          <Text style={st.stateTitle}>Some balances unavailable</Text>
          <Text style={st.stateBody}>We couldn’t read some of your balances — pull to refresh. Your funds are safe.</Text>
          <Pressable style={st.retry} onPress={() => void load(false)} accessibilityRole="button" accessibilityLabel="Retry loading balances">
            <Text style={st.retryTxt}>Try again  ↻</Text>
          </Pressable>
        </Card>
      ) : (
        <>
          {/* ── Net worth hero — the one big number, no invented trend ── */}
          <View style={st.hero}>
            <CardLabel>NET WORTH</CardLabel>
            <Text style={st.heroValue}>{fmtUsd(totalUsd)}</Text>
            {degradedNote ? <Text style={st.warnNote}>{degradedNote}</Text> : <Text style={st.heroSub}>Mainnet holdings · live prices</Text>}
          </View>

          {!funded ? (
            <Card style={st.empty}>
              <Text style={st.emptyTitle}>No holdings yet</Text>
              <Text style={st.emptyBody}>Fund an address to see your portfolio.</Text>
            </Card>
          ) : (
            <>
          {/* ── Pro-only allocation ring, from real USD weights ── */}
          {pro && slices.length > 0 && (
            <Card>
              <CardLabel>ALLOCATION</CardLabel>
              <View style={st.allocRow}>
                <AllocationRing slices={slices} size={116} stroke={16} />
                <View style={st.legend}>
                  {slices.map((sl) => {
                    const pct = totalUsd && totalUsd > 0 ? (sl.weight / totalUsd) * 100 : 0;
                    return (
                      <View key={sl.key} style={st.legendRow}>
                        <StatusDot color={sl.color} />
                        <Text style={st.legendSym}>{sl.key}</Text>
                        <Text style={st.legendPct}>{pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </Card>
          )}

          {/* ── Asset list ── */}
          {assets.map((a, i) => {
            const usd = mainnetUsd(a);
            const dotColor = SLICE_PALETTE[i % SLICE_PALETTE.length];
            return (
              <Card key={a.symbol}>
                <View style={st.assetHead}>
                  <View style={st.assetIdent}>
                    <StatusDot color={dotColor} />
                    <View>
                      <Text style={st.assetSym}>{a.symbol}</Text>
                      <Text style={st.assetName}>{a.name}</Text>
                    </View>
                  </View>
                  <View style={st.assetRight}>
                    <Text style={st.assetUsd}>{fmtUsd(usd)}</Text>
                    <Text style={st.assetPrice}>{a.priceUsd != null ? `${fmtUsd(a.priceUsd)} / ${a.symbol}` : 'price —'}</Text>
                  </View>
                </View>

                <View style={st.divider} />

                {/* Simple mode: mainnet + testnet amounts. Pro: labeled per-chain detail. */}
                {!pro ? (
                  <View style={st.amountRow}>
                    <View style={st.amountCol}>
                      <Text style={st.amountLabel}>Mainnet</Text>
                      <Text style={st.amountVal}>{fmtAmount(a.mainnet.amount, a.symbol)}</Text>
                    </View>
                    <View style={[st.amountCol, st.amountColRight]}>
                      <Text style={st.amountLabel}>{a.testnet.network}</Text>
                      <Text style={st.amountVal}>{fmtAmount(a.testnet.amount, a.symbol)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={st.proDetail}>
                    <ChainLine label="Mainnet" amount={fmtAmount(a.mainnet.amount, a.symbol)} address={a.mainnet.address} />
                    <ChainLine label={a.testnet.network} amount={fmtAmount(a.testnet.amount, a.symbol)} address={a.testnet.address} />
                  </View>
                )}
              </Card>
            );
          })}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** One per-chain row in Pro detail: network label, native amount, and the address it's read from. */
function ChainLine({ label, amount, address }: { label: string; amount: string; address: string }): React.JSX.Element {
  const c = useTheme();
  const st = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={st.chainLine}>
      <View style={st.chainTop}>
        <Text style={st.chainLabel}>{label}</Text>
        <Text style={st.chainAmount}>{amount}</Text>
      </View>
      <Text style={st.chainAddr} numberOfLines={1} ellipsizeMode="middle">
        {address || '—'}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.canvas },
  content: { padding: space.base, gap: space.md, paddingBottom: space.xxl },
  center: { flex: 1, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' },

  hero: { paddingVertical: space.lg, paddingHorizontal: space.xs, gap: space.xs },
  heroValue: { ...T.display, color: c.text },
  heroSub: { ...T.caption, color: c.text3 },
  warnNote: { ...T.caption, color: c.warn },

  stateCard: { gap: space.sm, marginTop: space.lg },
  stateTitle: { ...T.title, color: c.text },
  stateBody: { ...T.body, color: c.text2, lineHeight: 21 },
  retry: { marginTop: space.sm, backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  retryTxt: { ...T.body, color: '#fff', fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: space.xl, gap: space.xs },
  emptyTitle: { ...T.headline, color: c.text },
  emptyBody: { ...T.body, color: c.text2, textAlign: 'center' },

  allocRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md },
  legend: { flex: 1, gap: space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legendSym: { ...T.headline, color: c.text, flex: 1 },
  legendPct: { ...T.body, color: c.text2, fontVariant: ['tabular-nums'] },

  assetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assetIdent: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  assetSym: { ...T.headline, color: c.text },
  assetName: { ...T.caption, color: c.text3 },
  assetRight: { alignItems: 'flex-end' },
  assetUsd: { ...T.title, color: c.text },
  assetPrice: { ...T.caption, color: c.text3 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: space.md },

  amountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountCol: { gap: 2 },
  amountColRight: { alignItems: 'flex-end' },
  amountLabel: { ...T.label, color: c.text3 },
  amountVal: { ...T.body, color: c.text },

  proDetail: { gap: space.md },
  chainLine: { gap: 3 },
  chainTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chainLabel: { ...T.label, color: c.text3 },
  chainAmount: { ...T.body, color: c.text },
  chainAddr: { ...T.caption, color: c.text3, backgroundColor: c.surface2, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
});
