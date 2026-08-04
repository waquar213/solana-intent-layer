/**
 * Settings — the hub, styled as a premium wallet: a gradient IDENTITY HERO (the active account
 * carrying the app's spark-glyph SparkAvatar + the brand wash) that expands to the QR + 3 addresses,
 * then icon-led grouped rows on elevated cards for Security & recovery, Preferences, Connection,
 * and the single destructive Remove-wallet.
 *
 * "Brand Spark, on real material": exactly ONE gradient surface (the hero), every other card is a
 * flat tint on lifted material, and row icons carry four EARNED semantic hues (accent / warn /
 * success / danger) — never rainbow. Addresses are NEVER shown by default — masked (••••1234) until
 * the hero is tapped. No fabricated data: a locked wallet shows an honest grey hero, no address.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as LocalAuthentication from 'expo-local-authentication';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { isLight, radius, space, type as T, useTheme, type Palette, THEME_PREFS, THEME_LABEL, getThemePref, setThemePref, type ThemePref } from './theme';
import { BrandMark, Card, Field, HeroWash, PrimaryButton, SecondaryButton, Segmented, SparkAvatar, StatusDot, TextButton, maskAddr, shortAddr, sparkShadow } from './ui';
import { MODES, MODE_LABEL, getMode, setMode, type Mode } from './mode';
import { NETWORKS, NETWORK_LABEL, getNetwork, setNetwork, isMainnet, type NetworkEnv } from './network';
import { btcActiveAddress } from './broadcast';
import { accountCount, activeAccountIndex, addAccount, currentIdentity, isUnlocked, revealMnemonic, setActiveAccount, verifyPassword, type WalletIdentity } from './wallet';
import { AUTO_LOCK_OPTIONS, getSettings, setAutoLockMinutes, getTxMode, setTxMode, getAutoCaps, setAutoCaps, autoSpentTodayUsd, type TxMode } from './settings';
import { currentSession, signIn, signOut, type Session } from './auth';

// ── row icon roles — four EARNED semantic hues, never decorative ───────────────
type Role = 'accent' | 'warn' | 'success' | 'danger' | 'neutral';
const ROLE_COLORS: Record<Role, { dark: { bg: string; fg: string }; light: { bg: string; fg: string } }> = {
  accent: { dark: { bg: 'rgba(109,102,246,0.16)', fg: '#818CF8' }, light: { bg: 'rgba(91,84,230,0.10)', fg: '#5B54E6' } },
  warn: { dark: { bg: 'rgba(245,166,35,0.15)', fg: '#F5A623' }, light: { bg: 'rgba(183,121,31,0.10)', fg: '#B7791F' } },
  success: { dark: { bg: 'rgba(52,199,123,0.15)', fg: '#34C77B' }, light: { bg: 'rgba(18,161,80,0.10)', fg: '#12A150' } },
  danger: { dark: { bg: 'rgba(248,113,113,0.14)', fg: '#F87171' }, light: { bg: 'rgba(220,59,59,0.10)', fg: '#DC3B3B' } },
  neutral: { dark: { bg: '#242429', fg: '#A3A3AE' }, light: { bg: '#ECECEF', fg: '#55555F' } },
};
const roleTile = (role: Role): { bg: string; fg: string } => ROLE_COLORS[role][isLight() ? 'light' : 'dark'];
const hexA = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// ── monochrome line icons (theme-tinted, 2.0 stroke for presence) ──────────────
type IconName = 'plus' | 'clock' | 'lock' | 'key' | 'theme' | 'sliders' | 'link' | 'info' | 'trash' | 'user' | 'globe';
function SIcon({ name, color }: { name: IconName; color: string }): React.JSX.Element {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      {name === 'plus' && (
        <>
          <Line x1={12} y1={6} x2={12} y2={18} {...p} />
          <Line x1={6} y1={12} x2={18} y2={12} {...p} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M12 7.5v5l3 2" {...p} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2} {...p} />
          <Path d="M8 11V8a4 4 0 018 0v3" {...p} />
        </>
      )}
      {name === 'key' && (
        <>
          <Circle cx={8} cy={8} r={3.4} {...p} />
          <Path d="M10.4 10.4L19 19M16 16l2-2M13.5 13.5l2-2" {...p} />
        </>
      )}
      {name === 'theme' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M12 3.5a8.5 8.5 0 000 17z" fill={color} stroke="none" />
        </>
      )}
      {name === 'sliders' && (
        <>
          <Line x1={4} y1={8} x2={20} y2={8} {...p} />
          <Line x1={4} y1={16} x2={20} y2={16} {...p} />
          <Circle cx={9} cy={8} r={2.4} fill={color} stroke="none" />
          <Circle cx={15} cy={16} r={2.4} fill={color} stroke="none" />
        </>
      )}
      {name === 'link' && <Path d="M9 15l6-6M8.5 12l-2 2a3 3 0 004.2 4.2l2-2M15.5 12l2-2a3 3 0 00-4.2-4.2l-2 2" {...p} />}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Line x1={12} y1={11} x2={12} y2={16.5} {...p} />
          <Circle cx={12} cy={8} r={0.9} fill={color} stroke="none" />
        </>
      )}
      {name === 'trash' && <Path d="M5 7h14M9 7V5h6v2M7.5 7l.8 12h7.4l.8-12M10.5 10.5v6M13.5 10.5v6" {...p} />}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...p} />
          <Path d="M5.5 19.5a6.5 6.5 0 0113 0" {...p} />
        </>
      )}
      {name === 'globe' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" {...p} />
        </>
      )}
    </Svg>
  );
}

/** The role-tinted icon tile shared by every row. */
function IconTile({ icon, role }: { icon: IconName; role: Role }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const { bg, fg } = roleTile(role);
  return (
    <View style={[styles.iconTile, { backgroundColor: bg, borderColor: hexA(fg, 0.14) }]}>
      <SIcon name={icon} color={fg} />
    </View>
  );
}

// ── small building blocks ─────────────────────────────────────────────────────

/** A quiet section header above a Card group. */
function Section({ label }: { label: string }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

/** One icon-led settings row inside a Card (tile · title/sub left, chevron/accessory right). */
function Row({
  icon,
  role = 'accent',
  title,
  sub,
  right,
  onPress,
  danger,
  first,
}: {
  icon?: IconName;
  role?: Role;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
}): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const body = (
    <View style={[styles.row, !first && styles.rowDivider]}>
      {icon ? <IconTile icon={icon} role={role} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: c.danger }]}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{body}</Pressable>;
  return body;
}

/** A one-line copy control that flips to a check for a beat. */
function CopyLine({ label, value }: { label: string; value: string }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [copied, setCopied] = useState(false);
  const onCopy = (): void => {
    // Only tick "Copied ✓" once the write resolves — never claim a copy that didn't happen (parity with
    // FlowReceive; matters most here where the value can be a sensitive address).
    void Clipboard.setStringAsync(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        /* leave un-ticked rather than falsely claim success */
      });
  };
  return (
    <View style={styles.addrLine}>
      <View style={{ flex: 1 }}>
        <Text style={styles.addrLabel}>{label}</Text>
        <Text style={styles.addrMono}>{shortAddr(value)}</Text>
      </View>
      <TextButton label={copied ? 'Copied ✓' : 'Copy'} onPress={onCopy} tone={copied ? 'muted' : 'accent'} />
    </View>
  );
}

// ── Identity hero: the active account, on the one gradient surface ─────────────

function IdentityHero({
  id,
  index,
  addFooter,
  onAddAccount,
}: {
  id: WalletIdentity | null;
  index: number;
  addFooter: boolean;
  onAddAccount: () => void;
}): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [open, setOpen] = useState(false);
  const addr = id?.evm.address;
  const tile = roleTile('accent');

  return (
    <Card elevated style={styles.heroCard}>
      <View style={styles.heroClip}>
        <HeroWash />
        <View style={styles.heroInner}>
          <Pressable style={styles.heroRow} onPress={() => id && setOpen((o) => !o)} disabled={!id}>
            <View style={[styles.heroAvatar, id ? { shadowColor: sparkShadow(addr), shadowOpacity: isLight() ? 0.2 : 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } } : null]}>
              <SparkAvatar address={addr} size={48} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroName}>{id ? `Account ${index + 1}` : 'Wallet locked'}</Text>
                {id ? (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillTxt}>ACTIVE</Text>
                  </View>
                ) : null}
                {id ? (
                  <View style={isMainnet() ? styles.netPillMain : styles.netPillTest}>
                    <Text style={isMainnet() ? styles.netPillMainTxt : styles.netPillTestTxt}>{isMainnet() ? 'MAINNET' : 'TESTNET'}</Text>
                  </View>
                ) : null}
              </View>
              {/* Masked by default — the real address only appears inside the reveal below. */}
              <Text style={styles.heroAddr}>{id ? maskAddr(addr) : 'Unlock to view your accounts'}</Text>
            </View>
            {id ? <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text> : null}
          </Pressable>

          {id && !open ? (
            <View style={styles.netStrip}>
              <View style={[styles.netDot, { backgroundColor: '#627EEA' }]} />
              <View style={[styles.netDot, { backgroundColor: '#F7931A' }]} />
              <View style={[styles.netDot, { backgroundColor: '#9945FF' }]} />
              <Text style={styles.netTxt}>3 networks · tap to view addresses</Text>
            </View>
          ) : null}

          {id && open ? (
            <View style={styles.heroReveal}>
              <View style={styles.revealPanel}>
                <View style={styles.qrWrap}>
                  <QRCode value={id.evm.address} size={132} backgroundColor="#fff" color="#000" />
                </View>
                <CopyLine label="Ethereum (EVM)" value={id.evm.address} />
                {/* BTC re-encodes per network — bc1 on mainnet, tb1 on testnet — so never copy a wrong-network
                    address. If the active-network encoding isn't derivable (e.g. locked mid-reveal), show '—'
                    rather than falling back to id.btc.address, which is always the mainnet bc1 form. */}
                <CopyLine label={isMainnet() ? 'Bitcoin (mainnet)' : 'Bitcoin (testnet)'} value={btcActiveAddress() ?? '—'} />
                <CopyLine label="Solana" value={id.sol.address} />
              </View>
            </View>
          ) : null}

          {addFooter ? (
            <Pressable style={styles.heroFooter} onPress={onAddAccount}>
              <View style={[styles.iconTile, { backgroundColor: tile.bg, borderColor: hexA(tile.fg, 0.14) }]}>
                <SIcon name="plus" color={tile.fg} />
              </View>
              <Text style={[styles.rowTitle, { flex: 1 }]}>Add account</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/** A compact non-active account row (SparkAvatar + name), tap to switch to it. */
function SecondaryAccountRow({ index, first, onActivate }: { index: number; first: boolean; onActivate: () => void }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={[styles.row, !first && styles.rowDivider]} onPress={onActivate}>
      {/* Non-active accounts aren't derived here (we never invent an address), so a neutral disc. */}
      <SparkAvatar size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{`Account ${index + 1}`}</Text>
        <Text style={styles.rowSub}>Tap to switch</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

// ── Recovery: reveal behind a password re-auth gate ────────────────────────────

function RecoverySection(): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [pw, setPw] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Block screenshots / screen-recording while the recovery phrase is on screen — a
  // captured seed (auto-synced to iCloud/Photos, or grabbed by a recorder) = full loss. (H5)
  useEffect(() => {
    if (!words) return;
    void ScreenCapture.preventScreenCaptureAsync('reveal-phrase');
    return () => void ScreenCapture.allowScreenCaptureAsync('reveal-phrase');
  }, [words]);

  const reveal = async (): Promise<void> => {
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    const ok = await verifyPassword(pw);
    if (!ok) {
      setErr('Wrong password.');
      setPw('');
      setBusy(false);
      return;
    }
    if (!isUnlocked()) {
      setErr('Wallet is locked — unlock and try again.');
      setBusy(false);
      return;
    }
    // Extra hardware gate for the single most sensitive action, WHEN the device has
    // biometrics enrolled. Degrades gracefully to password-only if not. (M7)
    try {
      if ((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())) {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to reveal your recovery phrase' });
        if (!res.success) {
          setErr('Biometric authentication is required to reveal the phrase.');
          setBusy(false);
          return;
        }
      }
    } catch {
      /* biometric module unavailable → fall through to password-gated reveal */
    }
    try {
      setWords(revealMnemonic().trim().split(/\s+/u));
    } catch {
      setErr('Couldn’t read the recovery phrase.');
    }
    setPw('');
    setBusy(false);
  };

  const hide = (): void => {
    setWords(null);
    setPw('');
    setErr(null);
  };

  useEffect(() => () => setWords(null), []); // clear on unmount

  if (words == null) {
    const tile = roleTile('warn');
    return (
      <Card elevated style={{ gap: space.md }}>
        <View style={styles.blockHead}>
          <View style={[styles.iconTile, { backgroundColor: tile.bg, borderColor: hexA(tile.fg, 0.14) }]}>
            <SIcon name="key" color={tile.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Reveal recovery phrase</Text>
            <Text style={styles.rowSub}>12 words that restore this wallet. Keep them private and offline.</Text>
          </View>
        </View>
        <Field placeholder="Wallet password" value={pw} onChangeText={setPw} secure onSubmit={() => void reveal()} />
        {err && <Text style={styles.dangerTxt}>{err}</Text>}
        <PrimaryButton label="Reveal phrase" onPress={() => void reveal()} busy={busy} disabled={!pw} />
      </Card>
    );
  }

  return (
    <Card elevated>
      <View style={styles.warnBanner}>
        <Text style={styles.warnTxt}>Never share these words. Anyone with them controls your funds. Write them down offline.</Text>
      </View>
      <View style={styles.wordGrid}>
        {words.map((w, i) => (
          <View key={`${i}-${w}`} style={styles.wordCell}>
            <Text style={styles.wordNum}>{i + 1}</Text>
            <Text style={styles.wordTxt}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: space.md }}>
        <SecondaryButton label="Hide phrase" onPress={hide} />
      </View>
    </Card>
  );
}

// ── Connection (SIWE) ──────────────────────────────────────────────────────────

function SessionSection(): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [session, setSession] = useState<Session | null>(currentSession());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
  const doSignOut = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await signOut();
      setSession(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-out failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card elevated>
      <Row
        first
        icon="link"
        role={session ? 'success' : 'accent'}
        title={session ? 'Signed in' : 'Not signed in'}
        sub={
          session
            ? `${shortAddr(session.address)} · expires ${new Date(session.expiresAt).toLocaleDateString()}`
            : 'Sync intents & history — no password, sign on-device.'
        }
        right={<StatusDot color={session ? c.success : c.text3} />}
      />
      <View style={{ marginTop: space.md }}>
        {session ? (
          <SecondaryButton label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onPress={() => void doSignOut()} />
        ) : (
          <PrimaryButton label={busy ? 'Signing in…' : 'Sign in'} busy={busy} onPress={() => void doSignIn()} />
        )}
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </Card>
  );
}

/** A preference cell: icon + title/sub header, then an inline segmented control. */
function PrefBlock<V extends string | number>({
  icon,
  title,
  sub,
  options,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  options: { label: string; value: V }[];
  value: V;
  onChange: (v: V) => void;
}): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.prefBlock}>
      <View style={styles.blockHead}>
        <IconTile icon={icon} role="accent" />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
      </View>
      <Segmented options={options} value={value} onChange={onChange} />
    </View>
  );
}

/**
 * Transaction mode — Manual (confirm every tx) vs Auto (sign on-device within caps, no per-tx
 * confirm). Testnet auto runs freely; mainnet auto is bounded by the per-tx + daily USD caps.
 */
function TxModeSection(): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [, setTick] = useState(0);
  const bump = (): void => setTick((n) => n + 1);
  const txMode = getTxMode();
  const caps = getAutoCaps();
  const [perTx, setPerTx] = useState(String(caps.perTxUsd));
  const [daily, setDaily] = useState(String(caps.dailyUsd));

  const saveCaps = (): void => {
    const p = Number(perTx);
    const d = Number(daily);
    if (Number.isFinite(p) && Number.isFinite(d) && p > 0 && d > 0) {
      setAutoCaps(p, d);
      const applied = getAutoCaps();
      setPerTx(String(applied.perTxUsd));
      setDaily(String(applied.dailyUsd));
      bump();
    }
  };

  const modeOptions: { label: string; value: TxMode }[] = [
    { label: 'Manual', value: 'manual' },
    { label: 'Auto', value: 'auto' },
  ];

  return (
    <>
      <Section label="TRANSACTION MODE" />
      <Card elevated style={txMode === 'auto' ? styles.dangerCard : undefined}>
        <PrefBlock
          icon="sliders"
          title="Mode"
          sub="Manual confirms every transaction. Auto signs on-device within your caps — no per-tx confirmation."
          options={modeOptions}
          value={txMode}
          onChange={(m: TxMode) => {
            setTxMode(m);
            bump();
          }}
        />
        {txMode === 'auto' ? (
          <View style={styles.rowDivider}>
            <Text style={styles.rowSub}>
              ⚡ Auto runs freely on testnet. On mainnet it auto-executes only up to these caps — anything larger falls back to a
              manual confirm. Risk-blocked (scam / sanctioned) transactions never auto-run.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.rowSub}>Per-tx cap (USD)</Text>
                <Field value={perTx} onChangeText={setPerTx} keyboardType="decimal-pad" onSubmit={saveCaps} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.rowSub}>Daily cap (USD)</Text>
                <Field value={daily} onChangeText={setDaily} keyboardType="decimal-pad" onSubmit={saveCaps} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm }}>
              <Text style={styles.rowSub}>
                Auto-spent today: ${autoSpentTodayUsd().toLocaleString('en-US', { maximumFractionDigits: 2 })} / ${caps.dailyUsd}
              </Text>
              <TextButton label="Save caps" onPress={saveCaps} />
            </View>
          </View>
        ) : null}
      </Card>
    </>
  );
}

// ── the screen ────────────────────────────────────────────────────────────────

export default function SettingsScreen({ onWipe, onLock }: { onWipe: () => void; onLock: () => void }): React.JSX.Element {
  const c = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [, setTick] = useState(0);
  const bump = (): void => setTick((n) => n + 1);

  const id = currentIdentity();
  const count = accountCount();
  const active = activeAccountIndex();
  const autoLock = getSettings().autoLockMinutes;
  const mode = getMode();

  const lockOptions = AUTO_LOCK_OPTIONS.map((m) => ({ label: m === 0 ? 'Never' : `${m}m`, value: m }));
  const modeOptions = MODES.map((m) => ({ label: MODE_LABEL[m], value: m }));
  const themeOptions = THEME_PREFS.map((p) => ({ label: THEME_LABEL[p], value: p }));
  const networkOptions = NETWORKS.map((n) => ({ label: NETWORK_LABEL[n], value: n }));

  const doAdd = (): void => {
    addAccount();
    bump();
  };

  // Other (non-active) accounts, shown only when there's more than one.
  const others = Array.from({ length: count }, (_, i) => i).filter((i) => i !== active);

  const confirmWipe = (): void =>
    Alert.alert(
      'Remove wallet?',
      'This permanently deletes the encrypted wallet from this device. You can only restore it with your recovery phrase — make sure you have it written down.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove wallet', style: 'destructive', onPress: onWipe },
      ],
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>Settings</Text>

      {/* IDENTITY HERO — the active account. Add-account lives in its footer when it's the only one. */}
      <IdentityHero id={id} index={active} addFooter={count === 1} onAddAccount={doAdd} />

      {/* Other accounts (only when there are more than one) */}
      {others.length > 0 ? (
        <>
          <Section label="ACCOUNTS" />
          <Card elevated>
            {others.map((i, k) => (
              <SecondaryAccountRow
                key={i}
                index={i}
                first={k === 0}
                onActivate={() => {
                  setActiveAccount(i);
                  bump();
                }}
              />
            ))}
            <Row icon="plus" role="accent" title="Add account" onPress={doAdd} />
          </Card>
        </>
      ) : null}

      {/* NETWORK — the environment every balance + send follows. Mainnet = real funds. */}
      <Section label="NETWORK" />
      <Card elevated style={isMainnet() ? styles.dangerCard : undefined}>
        <View style={styles.prefBlock}>
          <View style={styles.blockHead}>
            <IconTile icon="globe" role={isMainnet() ? 'danger' : 'accent'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Network</Text>
              <Text style={styles.rowSub}>{isMainnet() ? 'Mainnet — real funds, irreversible.' : 'Testnet — Sepolia · Solana devnet · BTC testnet.'}</Text>
            </View>
          </View>
          <Segmented
            options={networkOptions}
            value={getNetwork()}
            onChange={(n: NetworkEnv) => {
              setNetwork(n);
              bump();
            }}
          />
        </View>
        {isMainnet() ? (
          <View style={styles.netWarn}>
            <Text style={styles.netWarnTxt}>You're on MAINNET. Sends move REAL funds and can't be undone — every send asks for explicit confirmation. Swaps stay testnet-only for now.</Text>
          </View>
        ) : null}
      </Card>

      {/* SECURITY */}
      <Section label="SECURITY" />
      <Card elevated>
        <PrefBlock
          icon="clock"
          title="Auto-lock"
          sub="Applies on next unlock."
          options={lockOptions}
          value={autoLock}
          onChange={(m) => {
            setAutoLockMinutes(m);
            bump();
          }}
        />
        <View style={styles.rowDivider}>
          <Row first icon="lock" role="success" title="Lock now" onPress={onLock} />
        </View>
      </Card>

      <TxModeSection />

      <RecoverySection />

      {/* PREFERENCES */}
      <Section label="PREFERENCES" />
      <Card elevated>
        <PrefBlock
          icon="theme"
          title="Theme"
          options={themeOptions}
          value={getThemePref()}
          onChange={(p: ThemePref) => {
            setThemePref(p);
            bump();
          }}
        />
        <View style={styles.rowDivider} />
        <PrefBlock
          icon="sliders"
          title="Interface mode"
          sub="Pro shows route/gas/slippage; Developer adds a Console."
          options={modeOptions}
          value={mode}
          onChange={(m: Mode) => {
            setMode(m);
            bump();
          }}
        />
      </Card>

      {/* CONNECTION — bare card (SIWE stays, chrome trimmed) */}
      <SessionSection />

      {/* DANGER */}
      <Section label="DANGER ZONE" />
      <Card elevated style={styles.dangerCard}>
        <Row first icon="trash" role="danger" danger title="Remove wallet" sub="Deletes this device's vault. Restore only with your recovery phrase." />
        <View style={{ marginTop: space.md }}>
          <PrimaryButton label="Remove wallet" danger onPress={confirmWipe} />
        </View>
      </Card>

      {/* Brand colophon */}
      <View style={styles.footerWrap}>
        <BrandMark size={20} />
        <Text style={styles.footer}>Universal Intent Wallet · Non-custodial · scrypt + AES-256-GCM · keys never leave this device</Text>
      </View>
      <View style={{ height: space.lg }} />
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: isLight() ? '#F7F7F9' : c.canvas },
    content: { padding: space.base, paddingTop: space.lg, gap: space.sm },
    h1: { ...T.title, color: c.text, marginBottom: space.xs },

    sectionHead: { paddingTop: space.md, paddingBottom: space.xs, paddingHorizontal: space.xs },
    sectionLabel: { ...T.label, color: c.text2 },

    row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, marginTop: space.xs },
    rowTitle: { ...T.headline, color: c.text },
    rowSub: { ...T.caption, color: c.text3, marginTop: 1, lineHeight: 17 },
    dangerTxt: { ...T.caption, color: c.danger },
    chevron: { fontSize: 19, color: c.text3, fontWeight: '400' },

    iconTile: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
    blockHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    prefBlock: { gap: space.sm, paddingVertical: space.xs },

    // hero
    heroCard: { padding: 0, overflow: 'visible' },
    heroClip: { borderRadius: radius.lg, overflow: 'hidden' },
    heroInner: { padding: space.base },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    heroAvatar: { borderRadius: 24 },
    heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    heroName: { ...T.title, fontSize: 19, color: c.text },
    heroAddr: { ...T.body, color: c.text2, fontVariant: ['tabular-nums'], marginTop: 2 },
    netStrip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space.md },
    netDot: { width: 8, height: 8, borderRadius: 4 },
    netTxt: { ...T.caption, color: c.text3, marginLeft: 4 },
    heroReveal: { marginTop: space.md },
    revealPanel: { backgroundColor: c.surface2, borderRadius: radius.md, padding: space.md, gap: space.sm, alignItems: 'stretch' },
    heroFooter: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },

    activePill: { backgroundColor: c.accentSubtle, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    activePillTxt: { ...T.label, color: c.accent, fontSize: 9.5 },
    netPillTest: { backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    netPillTestTxt: { ...T.label, color: c.text3, fontSize: 9.5 },
    netPillMain: { backgroundColor: hexA('#DC3B3B', isLight() ? 0.12 : 0.18), borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    netPillMainTxt: { ...T.label, color: c.danger, fontSize: 9.5 },
    netWarn: { backgroundColor: hexA('#DC3B3B', isLight() ? 0.06 : 0.1), borderRadius: radius.md, padding: space.md, marginTop: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: hexA('#DC3B3B', 0.3) },
    netWarnTxt: { ...T.caption, color: c.danger, lineHeight: 18 },

    qrWrap: { alignSelf: 'center', backgroundColor: '#fff', padding: 10, borderRadius: radius.md, marginBottom: space.xs },
    addrLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
    addrLabel: { ...T.caption, color: c.text3 },
    addrMono: { ...T.body, color: c.text, fontVariant: ['tabular-nums'], marginTop: 1 },

    warnBanner: { backgroundColor: c.accentSubtle, borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.warn, marginBottom: space.md },
    warnTxt: { ...T.caption, color: c.warn, lineHeight: 18 },
    wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    wordCell: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface2, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, width: '31%' },
    wordNum: { ...T.caption, color: c.text3, minWidth: 16 },
    wordTxt: { ...T.body, color: c.text, fontWeight: '600' },

    dangerCard: { borderColor: isLight() ? 'rgba(220,59,59,0.35)' : 'rgba(248,113,113,0.30)', backgroundColor: isLight() ? '#FFFBFB' : '#1E1B1C' },

    footerWrap: { alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingHorizontal: space.md },
    footer: { ...T.caption, color: c.text3, textAlign: 'center', lineHeight: 17 },

    err: { ...T.caption, color: c.danger, marginTop: space.sm },
  });
