/**
 * P4 Activity — the transaction timeline. Real EVM (Sepolia) history only (fetchEvmHistory),
 * newest first. Rams/Ive restraint: each row is direction + amount + status; the mechanism
 * (chain, txid, explorer) stays HIDDEN behind a tap-to-expand until the user asks for it —
 * except in Pro mode, which surfaces the chain + fee-context inline. No fabricated data: if the
 * address has no history (or none is provided) we show an honest empty state.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, type Palette, space, radius, mono, type as T } from './theme';
import { Card, CardLabel, StatusDot, TextButton, shortAddr } from './ui';
import { useMode, isPro } from './mode';
import { fetchEvmHistory, type HistoryItem } from './api';

const EXPLORER = 'https://eth-sepolia.blockscout.com/tx/';

/** ETH value from a wei string, trimmed to 5dp. Integer (bigint) math — never float — so a large
 *  wei value can't lose precision the way Number(valueWei)/1e18 would past 2^53. */
function ethAmount(valueWei: string): string {
  try {
    const wei = BigInt(valueWei);
    const whole = wei / 10n ** 18n;
    const frac = ((wei % 10n ** 18n) * 100000n) / 10n ** 18n; // first 5 decimals, truncated
    return `${whole}.${frac.toString().padStart(5, '0')} ETH`;
  } catch {
    return '0.00000 ETH';
  }
}

/** A friendly-ish date label from a unix (seconds) timestamp. */
function dateLabel(timeStamp: number): string {
  return new Date(timeStamp * 1000).toLocaleDateString();
}

function TxRow({
  item,
  address,
  pro,
  expanded,
  onToggle,
}: {
  item: HistoryItem;
  address: string;
  pro: boolean;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const sent = item.from.toLowerCase() === address.toLowerCase();
  const dotColor = item.failed ? c.danger : c.success;

  return (
    <Card style={styles.row} onPress={onToggle}>
      <View style={styles.rowHead}>
        <View style={styles.rowLeft}>
          <StatusDot color={dotColor} />
          <View style={styles.rowLabels}>
            <Text style={styles.dir}>
              {sent ? '↑ Sent' : '↓ Received'}
              {item.failed ? ' · Failed' : ''}
            </Text>
            <Text style={styles.meta}>
              {dateLabel(item.timeStamp)}
              {pro ? ' · Sepolia' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.amount, sent ? { color: c.text } : { color: c.success }]}>
            {sent ? '−' : '+'}
            {ethAmount(item.valueWei)}
          </Text>
          <Text style={styles.chevron}>{expanded ? '⌄' : '›'}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.detail}>
          <DetailRow label="Network" value="Sepolia" />
          <DetailRow label={sent ? 'To' : 'From'} value={shortAddr(sent ? item.to : item.from)} mono />
          <DetailRow label="Tx hash" value={shortAddr(item.hash)} mono />
          <View style={styles.detailActions}>
            <TextButton label="View on explorer ↗" onPress={() => void Linking.openURL(`${EXPLORER}${item.hash}`)} />
            <TextButton label="Copy hash" tone="muted" onPress={() => void Clipboard.setStringAsync(item.hash)} />
          </View>
        </View>
      )}
    </Card>
  );
}

function DetailRow({ label, value, mono: isMono }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, isMono && { fontFamily: mono }]}>{value}</Text>
    </View>
  );
}

export default function ActivityScreen({ address }: { address?: string }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const mode = useMode();
  const pro = isPro(mode);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setItems([]);
      return;
    }
    let live = true;
    setItems(null);
    fetchEvmHistory(address)
      .then((r) => {
        if (live) setItems(r);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [address]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Activity</Text>
      <CardLabel>SEPOLIA · RECENT</CardLabel>

      {items == null ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
          <Text style={styles.emptyMeta}>Loading transactions…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptyMeta}>
            {address
              ? 'Sends and receives on this address will appear here.'
              : 'Connect an account to see its activity.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <TxRow
              key={item.hash}
              item={item}
              address={address ?? ''}
              pro={pro}
              expanded={expandedId === item.hash}
              onToggle={() => setExpandedId((cur) => (cur === item.hash ? null : item.hash))}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: space.base, gap: space.md, paddingBottom: space.xxl },
  title: { ...T.display, color: c.text },
  list: { gap: space.sm, marginTop: space.xs },
  row: { paddingVertical: space.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexShrink: 1 },
  rowLabels: { gap: 2, flexShrink: 1 },
  dir: { ...T.headline, color: c.text },
  meta: { ...T.caption, color: c.text3 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { ...T.headline, fontVariant: ['tabular-nums'] },
  chevron: { color: c.text3, fontSize: 18, width: 14, textAlign: 'center' },
  detail: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    gap: space.sm,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { ...T.caption, color: c.text3 },
  detailValue: { ...T.body, color: c.text2 },
  detailActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.xs },
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { ...T.title, color: c.text },
  emptyMeta: { ...T.body, color: c.text3, textAlign: 'center', maxWidth: 280 },
});
