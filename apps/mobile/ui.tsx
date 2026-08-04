/**
 * The reusable component system for the redesign — cards, buttons, inputs, chips, bottom
 * sheets, segmented control, progress dots, risk badge, sparkline, allocation ring, and the
 * bottom tab bar. Everything composes from ./theme tokens so the whole app stays coherent.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme, isLight, mono, radius, space, type as T, RISK, type Palette } from './theme';

/** The brand's signature "intent spark" glyph on a 72×72 canvas — shared by BrandMark + SparkAvatar. */
export const SPARK_PATH =
  'M36 6 C 39 27 45 33 66 36 C 45 39 39 45 36 66 C 33 45 27 39 6 36 C 27 33 33 27 36 6 Z';

/** Deterministic HSL→hex (react-native-svg color parsing is platform-dependent; we resolve to hex). */
function hslHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number): string => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// ── formatters + address masking ─────────────────────────────────────────────
export const fmtUsd = (n?: number | null, dp = 2): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: dp })}`;
export const usdFromMicros = (m?: string | null): string => (m == null ? '—' : fmtUsd(Number(m) / 1e6));
export const shortAddr = (a?: string): string => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? '');
export const maskAddr = (a?: string): string => (a ? `••••${a.slice(-4)}` : '');

// ── primitives ───────────────────────────────────────────────────────────────
export function CardLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return <Text style={s.cardLabel}>{children}</Text>;
}

export function Card({ children, style, onPress, elevated }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; elevated?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const elev = elevated ? (isLight() ? s.cardElevatedLight : s.cardElevatedDark) : null;
  if (onPress) return <Pressable style={[s.card, elev, style]} onPress={onPress}>{children}</Pressable>;
  return <View style={[s.card, elev, style]}>{children}</View>;
}

/**
 * BrandMark — the brand's signature "intent spark": a single 4-point glyph filled with the
 * indigo→violet gradient over a soft radial glow. Vector, so it stays crisp at any size and is
 * the one anchor mark for the wallet (gate, splash, empty states). No other random iconography.
 */
export function BrandMark({ size = 76 }: { size?: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" accessibilityRole="image" accessibilityLabel="Wallet logo">
      <Defs>
        <RadialGradient id="bmGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.4" />
          <Stop offset="0.7" stopColor="#6366F1" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#6366F1" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="bmFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#818CF8" />
          <Stop offset="0.5" stopColor="#6366F1" />
          <Stop offset="1" stopColor="#8B5CF6" />
        </LinearGradient>
      </Defs>
      <Circle cx={36} cy={36} r={36} fill="url(#bmGlow)" />
      <Path d={SPARK_PATH} fill="url(#bmFill)" />
    </Svg>
  );
}

/**
 * SparkAvatar — a deterministic gradient identity disc that carries the app's own spark glyph.
 * The gradient hue is derived (FNV-1a) from the address but CLAMPED to the indigo→violet arc, so
 * every account is unique yet unmistakably this wallet — never a rainbow identicon. With no
 * address (locked wallet) it renders an honest flat-grey disc; it never invents an identity.
 */
export function SparkAvatar({ address, size = 48 }: { address?: string; size?: number }): React.JSX.Element {
  const c = useTheme();
  const light = isLight();
  const ring = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)';
  const k = (0.46 * size) / 60; // spark spans ~60u on its 72u canvas, centered at 36
  const t = size / 2 - 36 * k;
  const sparkTf = `translate(${t}, ${t}) scale(${k})`;

  if (!address) {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityRole="image" accessibilityLabel="Locked account">
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={c.surface2} />
        <Path d={SPARK_PATH} fill={c.text2} transform={sparkTf} />
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} stroke={ring} strokeWidth={1} fill="none" />
      </Svg>
    );
  }

  let u = 2166136261;
  const a = address.toLowerCase();
  for (let i = 0; i < a.length; i++) {
    u ^= a.charCodeAt(i);
    u = Math.imul(u, 16777619);
  }
  u >>>= 0;
  const baseHue = 222 + (u % 60);
  const secondHue = (baseHue + 26 + ((u >> 8) % 16)) % 360;
  const gid = `sa${u}`; // unique per address — shared ids make multiple SVG gradients mis-render

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityRole="image" accessibilityLabel="Account avatar">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={hslHex(baseHue, 72, 62)} />
          <Stop offset="1" stopColor={hslHex(secondHue, 64, 54)} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gid})`} />
      <Circle cx={size * 0.35} cy={size * 0.3} r={size * 0.16} fill="#FFFFFF" opacity={0.18} />
      <Path d={SPARK_PATH} fill="#FFFFFF" opacity={0.9} transform={sparkTf} />
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} stroke={ring} strokeWidth={1} fill="none" />
    </Svg>
  );
}

/** The self-color shadow tint for a hero SparkAvatar (matches its gradient's base hue). */
export function sparkShadow(address?: string): string {
  if (!address) return '#000000';
  let u = 2166136261;
  const a = address.toLowerCase();
  for (let i = 0; i < a.length; i++) {
    u ^= a.charCodeAt(i);
    u = Math.imul(u, 16777619);
  }
  u >>>= 0;
  return hslHex(222 + (u % 60), 72, 50);
}

/**
 * HeroWash — the ONE gradient surface of the redesign: a top-down brand membrane plus a top-right
 * violet glow, filling its parent (the identity hero). Whisper-soft in light, present in dark.
 */
export function HeroWash(): React.JSX.Element {
  const light = isLight();
  const washTop = light ? 0.09 : 0.14;
  const glow0 = light ? 0.14 : 0.22;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="herowash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6366F1" stopOpacity={washTop} />
          <Stop offset="1" stopColor="#6366F1" stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="heroglow" cx="88%" cy="0%" r="60%">
          <Stop offset="0" stopColor="#8B5CF6" stopOpacity={glow0} />
          <Stop offset="0.7" stopColor="#6366F1" stopOpacity={0.06} />
          <Stop offset="1" stopColor="#6366F1" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#herowash)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroglow)" />
    </Svg>
  );
}

export function PrimaryButton({ label, onPress, disabled, busy, grow, danger }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; grow?: boolean; danger?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[s.primary, danger && { backgroundColor: c.danger }, grow && { flex: 1 }, (disabled || busy) && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, grow }: { label: string; onPress: () => void; disabled?: boolean; grow?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[s.secondary, grow && { flex: 1 }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={s.secondaryTxt}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'accent' | 'muted' | 'danger' }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const color = tone === 'danger' ? c.danger : tone === 'muted' ? c.text2 : c.accent;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[s.textBtn, { color }]} importantForAccessibility="no">
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  mono?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  onSubmit?: () => void;
  autoFocus?: boolean;
}): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <TextInput
      style={[s.input, props.mono && { fontFamily: mono }, props.multiline && { minHeight: 76, textAlignVertical: 'top' }]}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={c.text3}
      secureTextEntry={props.secure}
      multiline={props.multiline}
      keyboardType={props.keyboardType}
      autoCapitalize="none"
      autoCorrect={false}
      autoFocus={props.autoFocus}
      onSubmitEditing={props.onSubmit}
    />
  );
}

export function Chip({ label, onPress, active }: { label: string; onPress?: () => void; active?: boolean }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={[s.chip, active && s.chipActive]} onPress={onPress} disabled={!onPress}>
      <Text style={[s.chipTxt, active && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: { options: { label: string; value: V }[]; value: V; onChange: (v: V) => void }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.segmented}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          style={[s.segItem, value === o.value && s.segActive]}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityLabel={String(o.label)}
          accessibilityState={{ selected: value === o.value }}
        >
          <Text style={[s.segTxt, value === o.value && { color: c.text, fontWeight: '700' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ProgressDots({ count, active }: { count: number; active: number }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.dot, { backgroundColor: i <= active ? c.accent : c.surface2, width: i === active ? 18 : 6 }]} />
      ))}
    </View>
  );
}

export function RiskBadge({ level }: { level: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const r = RISK[level] ?? RISK.low;
  return (
    <View style={[s.riskBadge, { borderColor: r.color }]}>
      <Text style={[s.riskTxt, { color: r.color }]}>{r.label}</Text>
    </View>
  );
}

export function StatusDot({ color }: { color: string }): React.JSX.Element {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

// ── token marks (crisp SVG, no bundled assets) ───────────────────────────────
const TOKEN_BG: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#0B0E13' };
/** A coin-chip token mark: brand-colored disc + vector logo. Recognizable at 32–40px. */
export function TokenIcon({ symbol, size = 38 }: { symbol: string; size?: number }): React.JSX.Element {
  const c = useTheme();
  const bg = TOKEN_BG[symbol] ?? c.surface2;
  const wrap = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: bg };
  if (symbol === 'BTC') {
    return (
      <View style={wrap}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.54 }}>₿</Text>
      </View>
    );
  }
  if (symbol === 'ETH') {
    return (
      <View style={wrap}>
        <Svg width={size * 0.44} height={size * 0.62} viewBox="0 0 32 48">
          <Polygon points="16,0 16,17.5 30,24" fill="#fff" opacity={0.55} />
          <Polygon points="16,0 2,24 16,17.5" fill="#fff" />
          <Polygon points="16,19.5 30,26 16,48" fill="#fff" opacity={0.55} />
          <Polygon points="16,48 2,26 16,19.5" fill="#fff" />
        </Svg>
      </View>
    );
  }
  if (symbol === 'SOL') {
    return (
      <View style={wrap}>
        <Svg width={size * 0.56} height={size * 0.5} viewBox="0 0 100 88">
          <Defs>
            <LinearGradient id="solg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#9945FF" />
              <Stop offset="1" stopColor="#14F195" />
            </LinearGradient>
          </Defs>
          <Path d="M12 6 H88 L76 22 H0 Z" fill="url(#solg)" />
          <Path d="M12 36 H88 L76 52 H0 Z" fill="url(#solg)" />
          <Path d="M12 66 H88 L76 82 H0 Z" fill="url(#solg)" />
        </Svg>
      </View>
    );
  }
  return (
    <View style={wrap}>
      <Text style={{ color: c.text2, fontWeight: '700', fontSize: size * 0.4 }}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

/** A whisper-soft top-down accent wash to give a hero card real presence (fills its parent). */
export function AccentWash(): React.JSX.Element {
  const c = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="accentwash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accent} stopOpacity={0.1} />
          <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#accentwash)" />
    </Svg>
  );
}

// ── charts (SVG) ──────────────────────────────────────────────────────────────
export function Sparkline({ data, color, width = 220, height = 44 }: { data: number[]; color?: string; width?: number; height?: number }): React.JSX.Element | null {
  const c = useTheme();
  const stroke = color ?? c.accent;
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** A stacked-stroke donut. slices weights need not sum to 1 (normalized here). */
export function AllocationRing({ slices, size = 120, stroke = 14 }: { slices: { key: string; weight: number; color: string }[]; size?: number; stroke?: number }): React.JSX.Element {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const total = slices.reduce((a, b) => a + b.weight, 0) || 1;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke={c.surface2} strokeWidth={stroke} fill="none" />
      {slices.map((sl) => {
        const frac = sl.weight / total;
        const dash = frac * circ;
        const el = (
          <Circle
            key={sl.key}
            cx={cx}
            cy={cy}
            r={r}
            stroke={sl.color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += dash;
        return el;
      })}
    </Svg>
  );
}

// ── bottom sheet ──────────────────────────────────────────────────────────────
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TextButton label="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.base, gap: space.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── bottom tab bar ────────────────────────────────────────────────────────────
export interface TabDef {
  key: string;
  label: string;
  icon: string;
}
export function TabBar({ tabs, active, onChange, center }: { tabs: TabDef[]; active: string; onChange: (k: string) => void; center?: string }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.tabBar}>
      {tabs.map((t) => {
        const on = active === t.key;
        const isCenter = center === t.key;
        return (
          <Pressable
            key={t.key}
            style={s.tabItem}
            onPress={() => onChange(t.key)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
          >
            <View style={isCenter ? s.tabCenter : undefined}>
              <Text
                style={[s.tabIcon, isCenter && s.tabIconCenter, { color: isCenter ? '#fff' : on ? c.accent : c.text3 }]}
                importantForAccessibility="no"
              >
                {t.icon}
              </Text>
            </View>
            {!isCenter && <Text style={[s.tabLabel, { color: on ? c.accent : c.text3 }]} importantForAccessibility="no">{t.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  cardLabel: { ...T.label, color: c.text3 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.base, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  // Opt-in material depth — white cards floating on an off-white canvas (light) / lifted off-black
  // panels with a lit top edge (dark). Brand-tinted (not black) shadow in light so it reads clean.
  cardElevatedLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAEAEF',
    shadowColor: '#5B54E6',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardElevatedDark: {
    backgroundColor: '#1C1C21',
    borderColor: '#34343C',
    borderTopColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primary: { backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface },
  secondaryTxt: { color: c.text, fontSize: 15, fontWeight: '600' },
  textBtn: { fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: c.surface2, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, color: c.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  chip: { backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  chipActive: { backgroundColor: c.accent, borderColor: c.accent },
  chipTxt: { color: c.text2, fontSize: 13 },
  segmented: { flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.pill },
  segActive: { backgroundColor: c.surface },
  segTxt: { color: c.text3, fontSize: 12.5 },
  dot: { height: 6, borderRadius: 3 },
  riskBadge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  riskTxt: { fontSize: 11, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.canvas, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  sheetTitle: { ...T.headline, color: c.text },
  tabBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 8, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.canvas },
  tabItem: { alignItems: 'center', gap: 3, minWidth: 56 },
  tabCenter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    shadowColor: c.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  tabIcon: { fontSize: 18 },
  tabIconCenter: { fontSize: 24 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
