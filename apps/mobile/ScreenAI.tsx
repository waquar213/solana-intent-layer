/**
 * The AI screen — the app's differentiator. A ChatGPT-like conversation: a scrolling feed of
 * turns (a right-aligned user bubble, then the assistant's response) over a sticky bottom
 * composer. Each utterance is planned via the same intent pipeline the rest of the app uses
 * (planIntent), and the assistant's turn is an <OutcomeView/> that carries the full
 * authorize → execute flow. Contacts are substituted client-side so "send 0.1 ETH to alice"
 * reaches the planner as a concrete address.
 *
 * Premium empty state ("Brand Spark, on real material"): a spark glow badge, three trust pills,
 * icon-led elevated starter cards, and a unified composer pill. Calm and monochrome — one accent,
 * one primary action (send), generous spacing, honest empty + error states, never fabricated.
 */
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { isLight, useTheme, type Palette, radius, space, type as T } from './theme';
import { BrandMark, Card, CardLabel, SPARK_PATH } from './ui';
import { planIntent } from './api';
import { substituteContacts } from './contacts';
import { OutcomeView } from './chat';
import type { PlanResponse } from './types';

interface Turn {
  q: string;
  res?: PlanResponse;
  error?: string;
  pending?: boolean;
}

type SugIconName = 'send' | 'swap' | 'spark' | 'wallet';
/** A few concrete starting points — shown only on an empty feed to seed the conversation. */
const EXAMPLES: readonly { text: string; icon: SugIconName }[] = [
  { text: 'Send 0.01 ETH to alice', icon: 'send' },
  { text: 'Swap 0.05 ETH to USDC', icon: 'swap' },
  { text: 'What can this wallet do?', icon: 'spark' },
  { text: "What's my balance?", icon: 'wallet' },
];

/** Small monochrome starter-card icons (theme-tinted, no assets). */
function SugIcon({ name, color }: { name: SugIconName; color: string }): React.JSX.Element {
  const p = { stroke: color, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {name === 'send' && <Path d="M7 17L17 7M8.5 7H17v8.5" {...p} />}
      {name === 'swap' && (
        <>
          <Path d="M4 8.5h12.5M13 5l3.5 3.5L13 12" {...p} />
          <Path d="M20 15.5H7.5M11 12l-3.5 3.5L11 19" {...p} />
        </>
      )}
      {name === 'spark' && <Path d={SPARK_PATH} fill={color} stroke="none" transform="scale(0.333)" />}
      {name === 'wallet' && (
        <>
          <Rect x={3} y={6} width={18} height={13} rx={2.5} {...p} />
          <Path d="M3 10h18M16.5 14.5h1.5" {...p} />
        </>
      )}
    </Svg>
  );
}

export default function AiScreen({ initialInput }: { initialInput?: string }): React.JSX.Element {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState<string>(initialInput ?? '');
  const [loading, setLoading] = React.useState<boolean>(false);
  const feedRef = React.useRef<ScrollView>(null);
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);

  const scrollToEnd = React.useCallback((): void => {
    setTimeout(() => feedRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const submit = React.useCallback(
    async (text: string): Promise<void> => {
      const q = text.trim();
      if (!q || loading) return;
      setInput('');
      setLoading(true);
      let idx = 0;
      setTurns((t) => {
        idx = t.length;
        return [...t, { q, pending: true }];
      });
      scrollToEnd();
      try {
        const res = await planIntent(substituteContacts(q));
        setTurns((t) => t.map((turn, i) => (i === idx ? { q, res } : turn)));
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong. Try again.';
        setTurns((t) => t.map((turn, i) => (i === idx ? { q, error: message } : turn)));
      } finally {
        setLoading(false);
        scrollToEnd();
      }
    },
    [loading, scrollToEnd],
  );

  const empty = turns.length === 0;
  const canSend = input.trim().length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        ref={feedRef}
        style={styles.feed}
        contentContainerStyle={[styles.feedContent, empty && styles.feedEmpty]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <View style={styles.hero}>
            <View style={styles.sparkBadge}>
              <BrandMark size={58} />
            </View>
            <Text style={styles.heroTitle}>Ask for anything</Text>
            <Text style={styles.heroLead}>Tell me what you want to do, in plain words.</Text>
            <View style={styles.trustRow} accessible accessibilityLabel="I plan it, show the risk, and you authorize before anything moves">
              {['Plan', 'Risk shown', 'You authorize'].map((t) => (
                <View key={t} style={styles.trustPill}>
                  <View style={styles.trustDot} />
                  <Text style={styles.trustItem}>{t}</Text>
                </View>
              ))}
            </View>
            <View style={styles.sugGrid}>
              {EXAMPLES.map((ex) => (
                <Pressable
                  key={ex.text}
                  style={styles.sCard}
                  onPress={() => void submit(ex.text)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask: ${ex.text}`}
                >
                  <View style={styles.sIconTile}>
                    <SugIcon name={ex.icon} color={c.accent} />
                  </View>
                  <Text style={styles.sCardText}>{ex.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          turns.map((t, i) => (
            <View key={i} style={styles.turn}>
              <View style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{t.q}</Text>
                </View>
              </View>

              {t.pending && (
                <View style={styles.assistantRow}>
                  <View style={styles.pendingBubble}>
                    <ActivityIndicator color={c.accent} size="small" />
                    <Text style={styles.pendingText}>Planning…</Text>
                  </View>
                </View>
              )}

              {t.error != null && (
                <View style={styles.assistantRow}>
                  <Card elevated style={styles.errorCard}>
                    <CardLabel>Couldn't plan that</CardLabel>
                    <Text style={styles.errorText}>{t.error}</Text>
                  </Card>
                </View>
              )}

              {t.res && (
                <View style={styles.assistantRow}>
                  <OutcomeView outcome={t.res.outcome} />
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.composerWrap}>
        <View style={styles.composerPill}>
          <TextInput
            style={styles.composerInput}
            value={input}
            onChangeText={setInput}
            placeholder="Message your wallet…"
            placeholderTextColor={c.text3}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            onSubmitEditing={() => void submit(input)}
          />
          <Pressable
            style={[styles.send, !canSend && styles.sendDisabled]}
            onPress={() => void submit(input)}
            disabled={!canSend}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendGlyph}>↑</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => {
  const light = isLight();
  const cardShadow = light
    ? { shadowColor: '#5B54E6', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 1 }
    : { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: light ? '#F7F7F9' : c.canvas },

    feed: { flex: 1 },
    feedContent: { padding: space.base, paddingBottom: space.lg, gap: space.lg },
    feedEmpty: { flexGrow: 1, justifyContent: 'center' },

    hero: { alignItems: 'center', paddingHorizontal: space.base, gap: space.base },
    sparkBadge: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: light ? 'rgba(91,84,230,0.06)' : 'rgba(129,140,248,0.08)' },
    heroTitle: { fontSize: 25, fontWeight: '700', letterSpacing: -0.4, color: c.text, marginTop: -space.xs },
    heroLead: { ...T.body, color: c.text2, textAlign: 'center', lineHeight: 22, maxWidth: 300 },

    trustRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.xs, flexWrap: 'wrap', justifyContent: 'center' },
    trustPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: light ? '#FFFFFF' : c.surface, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 5 },
    trustDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent },
    trustItem: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2, color: c.text2 },

    sugGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md, marginTop: space.md, width: '100%', maxWidth: 400 },
    sCard: {
      width: '48%',
      backgroundColor: light ? '#FFFFFF' : '#1C1C21',
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: light ? '#EAEAEF' : '#34343C',
      padding: space.md,
      gap: space.sm,
      ...cardShadow,
    },
    sIconTile: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSubtle },
    sCardText: { fontSize: 14, fontWeight: '600', color: c.text, lineHeight: 19 },

    turn: { gap: space.md },

    userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    userBubble: {
      maxWidth: '86%',
      backgroundColor: c.accent,
      borderRadius: radius.lg,
      borderBottomRightRadius: radius.sm,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
    },
    userText: { ...T.body, color: '#fff', lineHeight: 21 },

    assistantRow: { alignItems: 'stretch' },

    pendingBubble: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderBottomLeftRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
    },
    pendingText: { ...T.body, color: c.text2 },

    errorCard: { borderColor: c.danger, gap: space.xs },
    errorText: { ...T.body, color: c.text, lineHeight: 21, marginTop: space.xs },

    composerWrap: {
      backgroundColor: light ? '#F7F7F9' : c.canvas,
      paddingHorizontal: space.base,
      paddingTop: space.sm,
      paddingBottom: space.md,
    },
    composerPill: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space.sm,
      backgroundColor: light ? '#FFFFFF' : c.surface,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingLeft: space.base,
      paddingRight: 6,
      paddingVertical: 6,
      ...cardShadow,
    },
    composerInput: { flex: 1, color: c.text, fontSize: 16, lineHeight: 21, paddingVertical: 8, maxHeight: 120 },
    send: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
    sendDisabled: { backgroundColor: c.surface2 },
    sendGlyph: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: -1 },
  });
};
