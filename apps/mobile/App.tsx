/**
 * Intent Wallet — mobile shell. This file is intentionally thin: it owns the GATE
 * (create / import / unlock / back-up-with-verify) and the unlocked 5-tab shell that ties the
 * redesign together. Every screen's content lives in its own sibling file; App.tsx only wires
 * them and hoists the Send / Receive sheets so they can open over any tab.
 *
 * Progressive disclosure: the tab bar is 5 tabs in Simple/Pro and grows a 6th "Console" tab in
 * Developer mode. Center "AI" tab is emphasized — the app's differentiator and the one primary
 * action from Home. No fabricated data: the Console shows only real config + honest live reads.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenCapture from 'expo-screen-capture';
import Svg, { Path } from 'react-native-svg';

import { isLight, radius, space, type as T, useTheme, type Palette } from './theme';
import { BrandMark, Card, CardLabel, Field, PrimaryButton, SecondaryButton, TextButton, TabBar, type TabDef } from './ui';
import { isDev, useMode } from './mode';
import {
  activeAccountIndex,
  createWallet,
  currentIdentity,
  hasWallet,
  importWallet,
  resetWallet,
  isUnlocked,
  lock,
  onAccountChange,
  unlock,
  wipeWallet,
  type WalletIdentity,
} from './wallet';
import { signOut } from './auth';
import { clearSessionOutflow } from './drain';
import { hydrateStorage } from './storage';
import { API_BASE } from './config';
import { apiHealthy } from './api';
import { btcActiveAddress } from './broadcast';
import { isMainnet, netCfg } from './network';

import Home from './ScreenHome';
import AiScreen from './ScreenAI';
import Portfolio from './ScreenPortfolio';
import ActivityScreen from './ScreenActivity';
import SettingsScreen from './ScreenSettings';
import SendFlow from './FlowSend';
import ReceiveFlow from './FlowReceive';

// ── gate state machine ──────────────────────────────────────────────────────────
type Gate = 'checking' | 'none' | 'create' | 'import' | 'backup' | 'locked' | 'unlocked';
type Tab = 'home' | 'portfolio' | 'ai' | 'activity' | 'settings' | 'console';

const BASE_TABS: TabDef[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'portfolio', label: 'Portfolio', icon: '◈' },
  { key: 'ai', label: 'AI', icon: '✦' },
  { key: 'activity', label: 'Activity', icon: '↗' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];
const CONSOLE_TAB: TabDef = { key: 'console', label: 'Console', icon: '⌥' };

/** A shield-check glyph for the backup step's warning header. */
function ShieldCheck({ color, size = 22 }: { color: string; size?: number }): React.JSX.Element {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" {...p} />
      <Path d="M9 12l2.2 2.2L15.2 10" {...p} />
    </Svg>
  );
}

/** rgba tint from a hex + alpha (for theme-reactive translucent fills). */
const tint = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function App(): React.JSX.Element {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [hydrated, setHydrated] = useState(false);
  const [gate, setGate] = useState<Gate>('checking');
  const [identity, setIdentity] = useState<WalletIdentity | null>(null);

  // gate inputs
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [resetMode, setResetMode] = useState(false); // "Forgot password?" → restore-from-phrase (replaces the local vault)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // backup + 2-word verify quiz
  const [phrase, setPhrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [verifyIdx, setVerifyIdx] = useState<[number, number]>([0, 1]);
  const [verifyWords, setVerifyWords] = useState<{ a: string; b: string }>({ a: '', b: '' });

  // shell
  const [tab, setTab] = useState<Tab>('home');
  const [pendingIntent, setPendingIntent] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState<'send' | 'receive' | null>(null);

  const mode = useMode();
  const showConsole = isDev(mode);
  const tabs: TabDef[] = showConsole ? [...BASE_TABS, CONSOLE_TAB] : BASE_TABS;

  // Block screenshots / screen-recording while the recovery phrase is on screen during first-time BACKUP —
  // a captured seed (auto-synced to iCloud/Photos, or grabbed by a recorder) = full loss. The Settings
  // re-reveal already does this (H5); the primary backup gate did NOT, leaving the most common capture point
  // (the user photographing the words to "save" them) fully exposed on Android (no FLAG_SECURE).
  useEffect(() => {
    if (gate !== 'backup') return;
    void ScreenCapture.preventScreenCaptureAsync('backup-phrase');
    return () => void ScreenCapture.allowScreenCaptureAsync('backup-phrase');
  }, [gate]);

  // Hydrate persisted storage (contacts/settings/session cache) before first use, then resolve the gate.
  useEffect(() => {
    void (async () => {
      await hydrateStorage();
      setHydrated(true);
      if (isUnlocked()) {
        setIdentity(currentIdentity());
        setGate('unlocked');
        return;
      }
      const exists = await hasWallet().catch(() => false);
      setGate(exists ? 'locked' : 'none');
    })();
  }, []);

  // Keep the shell's cached identity in sync when the active account changes in Settings, so Home,
  // Activity, Console and the Send FROM-account all reflect the newly-active account immediately.
  useEffect(() => onAccountChange(() => setIdentity(currentIdentity())), []);

  // Lock the wallet the instant the app is backgrounded, so a walk-away / app-switch can't
  // be resumed into an unlocked wallet and no sensitive screen lingers behind the app. (M7)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && isUnlocked()) {
        lock();
        clearSessionOutflow(); // a new session starts from zero cumulative outflow
        setIdentity(null);
        setGate('locked');
      }
    });
    return () => sub.remove();
  }, []);

  const resetGateInputs = (): void => {
    setPw('');
    setPw2('');
    setImportPhrase('');
    setErr(null);
  };

  const doCreate = async (): Promise<void> => {
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    setBusy(true);
    setErr(null);
    try {
      const { mnemonic, identity: id } = await createWallet(pw);
      const words = mnemonic.split(' ');
      // Ask for two RANDOM distinct positions each time (not the old fixed 1/3 & 2/3, which was
      // always #5 & #9 for a 12-word phrase — memorisable without ever writing the phrase down).
      // Sorted ascending so the prompts read #3 then #8, etc.
      const a = Math.floor(Math.random() * words.length);
      let b = Math.floor(Math.random() * words.length);
      while (b === a) b = Math.floor(Math.random() * words.length);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setPhrase(mnemonic);
      setIdentity(id);
      setVerifyIdx([lo, hi]);
      setVerifyWords({ a: '', b: '' });
      setSaved(false);
      resetGateInputs();
      setGate('backup');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create wallet.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (): Promise<void> => {
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    setErr(null);
    try {
      // Reset mode REPLACES the existing vault (resetWallet wipes only after the phrase validates);
      // plain import is only reached when no wallet exists.
      setIdentity(await (resetMode ? resetWallet : importWallet)(importPhrase, pw));
      resetGateInputs();
      setResetMode(false);
      setGate('unlocked');
    } catch {
      setErr('Invalid recovery phrase — check the words and try again.');
    } finally {
      setBusy(false);
    }
  };

  const doUnlock = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      setIdentity(await unlock(pw));
      resetGateInputs();
      setGate('unlocked');
    } catch {
      setErr('Wrong password.');
    } finally {
      setBusy(false);
    }
  };

  const resetShell = (): void => {
    setIdentity(null);
    setTab('home');
    setPendingIntent(undefined);
    setSheet(null);
  };

  const doLock = (): void => {
    lock();
    clearSessionOutflow();
    resetShell();
    setGate('locked');
  };

  const doWipe = async (): Promise<void> => {
    void signOut(); // revoke + drop this wallet's SIWE session server-side; wipeWallet clears only the keystore
    clearSessionOutflow(); // the new wallet must not inherit the old one's cumulative-drain total
    await wipeWallet();
    resetShell();
    setGate('none');
  };

  // Home → AI hand-off: switch tab and optionally seed the composer.
  const goAI = (prefill?: string): void => {
    setPendingIntent(prefill);
    setTab('ai');
  };

  const phraseWords = phrase.split(' ');
  const verifyOk =
    verifyWords.a.trim().toLowerCase() === phraseWords[verifyIdx[0]]?.toLowerCase() &&
    verifyWords.b.trim().toLowerCase() === phraseWords[verifyIdx[1]]?.toLowerCase();

  // ── Gate ────────────────────────────────────────────────────────────────────
  if (gate !== 'unlocked') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style={isLight() ? 'dark' : 'light'} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.gateScroll} keyboardShouldPersistTaps="handled">
            {/* The big brand belongs on the entry screens, not the functional backup step. */}
            {gate !== 'backup' && (
              <>
                <View style={styles.brandWrap}>
                  <BrandMark size={80} />
                </View>
                <Text style={styles.brand}>Intent Wallet</Text>
              </>
            )}

            {(gate === 'checking' || !hydrated) && <ActivityIndicator color={c.accent} style={{ marginTop: space.lg }} />}

            {gate === 'none' && (
              <View style={styles.gateBody}>
                <Text style={styles.lead}>Your keys are generated and sealed on this device — they never touch a server.</Text>
                <PrimaryButton label="Create new wallet" onPress={() => { resetGateInputs(); setGate('create'); }} />
                <SecondaryButton label="Import recovery phrase" onPress={() => { resetGateInputs(); setResetMode(false); setGate('import'); }} />
              </View>
            )}

            {gate === 'create' && (
              <View style={styles.gateBody}>
                <Text style={styles.lead}>Set a password to encrypt your wallet on this device.</Text>
                <Field placeholder="Password (min 8 chars)" value={pw} onChangeText={setPw} secure />
                <Field placeholder="Confirm password" value={pw2} onChangeText={setPw2} secure />
                <PrimaryButton label="Generate wallet" onPress={() => void doCreate()} busy={busy} />
                <TextButton label="Cancel" tone="muted" onPress={() => { resetGateInputs(); setGate('none'); }} />
              </View>
            )}

            {gate === 'import' && (
              <View style={styles.gateBody}>
                <Text style={styles.lead}>
                  {resetMode
                    ? 'Reset by restoring from your recovery phrase, then set a new password.'
                    : 'Restore a wallet from its 12/24-word recovery phrase.'}
                </Text>
                {resetMode && (
                  <View style={styles.warnCard}>
                    <Text style={styles.warnCardTxt}>
                      This replaces the wallet on this device. You need its 12/24-word recovery phrase — without it,
                      the wallet and its funds can’t be recovered. There is no password reset without the phrase.
                    </Text>
                  </View>
                )}
                <Field
                  placeholder="Recovery phrase (space-separated words)"
                  value={importPhrase}
                  onChangeText={setImportPhrase}
                  multiline
                />
                <Field placeholder="New password for this device" value={pw} onChangeText={setPw} secure />
                <PrimaryButton label={resetMode ? 'Restore & set new password' : 'Import wallet'} onPress={() => void doImport()} busy={busy} disabled={!importPhrase.trim()} />
                <TextButton label="Cancel" tone="muted" onPress={() => { resetGateInputs(); setGate(resetMode ? 'locked' : 'none'); }} />
              </View>
            )}

            {gate === 'backup' && (
              <View style={styles.backupBody}>
                <View style={styles.backupHead}>
                  <View style={styles.shieldTile}>
                    <ShieldCheck color={c.warn} size={26} />
                  </View>
                  <Text style={styles.backupTitle}>Back up your recovery phrase</Text>
                </View>

                <View style={styles.warnCard}>
                  <Text style={styles.warnCardTxt}>
                    These 12 words are the ONLY way to restore your wallet. Write them down and keep them offline — nobody,
                    not even us, can recover them for you.
                  </Text>
                </View>

                <View style={styles.phraseCard}>
                  <View style={styles.phrase}>
                    {phraseWords.map((w, i) => (
                      <View key={i} style={styles.word}>
                        <Text style={styles.wordN}>{i + 1}</Text>
                        <Text style={styles.wordTxt}>{w}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <Pressable style={styles.check} onPress={() => setSaved((sv) => !sv)}>
                  <View style={[styles.checkBox, saved && styles.checkBoxOn]}>{saved ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                  <Text style={styles.checkTxt}>I've written it down and stored it safely.</Text>
                </Pressable>

                {saved && (
                  <View style={styles.verifyBlock}>
                    <Text style={styles.verifyLead}>Quick check — enter these two words to confirm:</Text>
                    {(['a', 'b'] as const).map((slot, i) => {
                      const wordN = verifyIdx[i];
                      const val = verifyWords[slot];
                      const good = val.trim().toLowerCase() === phraseWords[wordN]?.toLowerCase();
                      const bad = val.length > 0 && !good;
                      return (
                        <View key={slot} style={styles.verifyRow}>
                          <Text style={styles.verifyNum}>#{wordN + 1}</Text>
                          <TextInput
                            style={[styles.verifyInput, bad && { borderColor: c.danger }, good && { borderColor: c.success }]}
                            value={val}
                            onChangeText={(t) => setVerifyWords((v) => ({ ...v, [slot]: t }))}
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder={`Word #${wordN + 1}`}
                            placeholderTextColor={c.text3}
                          />
                          <Text style={[styles.verifyCheck, { color: good ? c.success : 'transparent' }]}>✓</Text>
                        </View>
                      );
                    })}
                    <PrimaryButton
                      label="Continue"
                      disabled={!verifyOk}
                      onPress={() => {
                        setPhrase('');
                        setVerifyWords({ a: '', b: '' });
                        setGate('unlocked');
                      }}
                    />
                  </View>
                )}
              </View>
            )}

            {gate === 'locked' && (
              <View style={styles.gateBody}>
                <Text style={styles.lead}>Your wallet is locked. Enter your password to unlock it.</Text>
                <Field placeholder="Password" value={pw} onChangeText={setPw} secure onSubmit={() => void doUnlock()} />
                <PrimaryButton label="Unlock" onPress={() => void doUnlock()} busy={busy} disabled={!pw} />
                {/* Non-custodial: a forgotten password can't be "reset" into the same vault — the only
                    recovery is restoring from the 12/24-word recovery phrase and setting a new one. */}
                <TextButton
                  label="Forgot password?"
                  tone="accent"
                  onPress={() => {
                    resetGateInputs();
                    setResetMode(true);
                    setGate('import');
                  }}
                />
              </View>
            )}

            {err && <Text style={styles.err}>{err}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Unlocked shell ────────────────────────────────────────────────────────────
  const id = identity ?? currentIdentity();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={isLight() ? 'dark' : 'light'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          {tab === 'home' && (
            <Home
              key={`home-${activeAccountIndex()}`}
              onOpenSend={() => setSheet('send')}
              onOpenReceive={() => setSheet('receive')}
              onGoAI={() => goAI()}
              onSubmitIntent={(text) => goAI(text)}
              onManageAccount={() => setTab('settings')}
            />
          )}
          {tab === 'portfolio' && <Portfolio key={`pf-${activeAccountIndex()}`} />}
          {/* key on the pending intent so a fresh hand-off remounts the composer with the seed */}
          {tab === 'ai' && <AiScreen key={pendingIntent ?? '∅'} initialInput={pendingIntent} />}
          {tab === 'activity' && <ActivityScreen key={`act-${activeAccountIndex()}`} address={id?.evm.address} />}
          {tab === 'settings' && <SettingsScreen onWipe={() => void doWipe()} onLock={doLock} />}
          {tab === 'console' && showConsole && <ConsoleScreen key={`con-${activeAccountIndex()}`} id={id} />}
        </View>

        <TabBar
          tabs={tabs}
          active={tab}
          onChange={(k) => {
            const nk = k as Tab;
            // Plain tab navigation clears any stale AI seed, so returning to AI via the tab bar
            // opens a fresh composer instead of re-seeding old chip/Swap text. A real goAI()
            // hand-off (from Home) still seeds correctly because it sets pendingIntent itself.
            if (nk !== 'ai') setPendingIntent(undefined);
            setTab(nk);
          }}
          center="ai"
        />
      </KeyboardAvoidingView>

      {sheet === 'send' && <SendFlow onClose={() => setSheet(null)} />}
      {sheet === 'receive' && <ReceiveFlow onClose={() => setSheet(null)} />}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Console — Developer-mode only. Real config + honest live reads, never fabricated.
// ═══════════════════════════════════════════════════════════════════════════════
function ConsoleScreen({ id }: { id: WalletIdentity | null }): React.JSX.Element {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  // undefined = probing, true/false = last real result.
  const [health, setHealth] = useState<boolean | undefined>(undefined);
  const btc = btcActiveAddress();

  const probe = (): void => {
    setHealth(undefined);
    apiHealthy().then(setHealth).catch(() => setHealth(false));
  };
  // Liveness-guarded mount probe — the Console tab unmounts on tab switch; don't setState after that.
  useEffect(() => {
    let live = true;
    setHealth(undefined);
    apiHealthy()
      .then((h) => live && setHealth(h))
      .catch(() => live && setHealth(false));
    return () => {
      live = false;
    };
  }, []);

  const healthLabel = health === undefined ? 'checking…' : health ? 'reachable' : 'unreachable';
  const healthColor = health === undefined ? c.text3 : health ? c.success : c.danger;

  return (
    <ScrollView style={styles.consoleScroll} contentContainerStyle={styles.consoleContent}>
      <Text style={styles.consoleTitle}>Console</Text>
      <Text style={styles.consoleSub}>Developer diagnostics — real values only.</Text>

      <Card>
        <CardLabel>API</CardLabel>
        <KV k="Base URL" v={API_BASE} mono />
        <View style={styles.kvRow}>
          <Text style={styles.kvK}>Health</Text>
          <View style={styles.kvInline}>
            <View style={[styles.statusDot, { backgroundColor: healthColor }]} />
            <Text style={[styles.kvV, { color: healthColor }]}>{healthLabel}</Text>
          </View>
        </View>
        <View style={styles.kvAction}>
          <TextButton label="Re-check health" onPress={probe} />
        </View>
      </Card>

      <Card>
        <CardLabel>WALLET</CardLabel>
        <KV k="Unlocked" v={isUnlocked() ? 'yes' : 'no'} />
        <KV k={`EVM (${netCfg().evm.chain})`} v={id?.evm.address ?? '—'} mono />
        <KV k={isMainnet() ? 'Bitcoin (mainnet)' : 'Bitcoin (testnet)'} v={btc ?? id?.btc.address ?? '—'} mono />
        <KV k={`Solana (${netCfg().sol.cluster})`} v={id?.sol.address ?? '—'} mono />
      </Card>

      <Card>
        <CardLabel>DERIVATION PATHS</CardLabel>
        <KV k="EVM" v={id?.evm.path ?? '—'} mono />
        <KV k="BTC" v={id?.btc.path ?? '—'} mono />
        <KV k="SOL" v={id?.sol.path ?? '—'} mono />
      </Card>

      <Card>
        <CardLabel>PLATFORM</CardLabel>
        <KV k="OS" v={`${Platform.OS} ${String(Platform.Version)}`} />
        <View style={styles.kvAction}>
          <TextButton label="Open API base in browser ↗" onPress={() => void Linking.openURL(API_BASE)} />
        </View>
      </Card>

      <View style={{ height: space.xxl }} />
    </ScrollView>
  );
}

function KV({ k, v, mono: isMono }: { k: string; v: string; mono?: boolean }): React.JSX.Element {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={[styles.kvV, isMono ? styles.kvMono : null]} numberOfLines={1} ellipsizeMode="middle">
        {v}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  flex: { flex: 1 },

  // gate
  gateScroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.md },
  brandWrap: { alignItems: 'center' },
  brand: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: c.text, textAlign: 'center', marginTop: space.base },
  gateBody: { gap: space.md, marginTop: space.lg },
  lead: { ...T.body, color: c.text2, textAlign: 'center', lineHeight: 22 },
  flabel: { ...T.label, color: c.text3 },
  verifyInput: {
    flex: 1,
    backgroundColor: c.surface2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  err: { ...T.caption, color: c.danger, textAlign: 'center', marginTop: space.sm },

  // recovery phrase backup (premium)
  backupBody: { gap: space.md, marginTop: space.sm },
  backupHead: { alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  shieldTile: { width: 48, height: 48, borderRadius: 14, backgroundColor: tint(c.warn, 0.14), alignItems: 'center', justifyContent: 'center' },
  backupTitle: { ...T.title, color: c.text, textAlign: 'center' },
  warnCard: { backgroundColor: tint(c.warn, 0.1), borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: tint(c.warn, 0.35) },
  warnCardTxt: { ...T.caption, color: c.warn, lineHeight: 18, textAlign: 'center' },
  phraseCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  phrase: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: c.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 9,
    width: '31%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  wordN: { ...T.caption, color: c.accent, minWidth: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  wordTxt: { ...T.body, color: c.text, fontWeight: '600' },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.text3, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  checkTxt: { ...T.body, color: c.text2, flex: 1 },
  verifyBlock: { gap: space.md, marginTop: space.sm },
  verifyLead: { ...T.caption, color: c.text2, marginBottom: space.xs },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  verifyNum: { ...T.caption, color: c.text3, width: 30, fontVariant: ['tabular-nums'], fontWeight: '700' },
  verifyCheck: { fontSize: 18, fontWeight: '800', width: 18, textAlign: 'center' },

  // console
  consoleScroll: { flex: 1, backgroundColor: c.canvas },
  consoleContent: { padding: space.base, gap: space.md, paddingTop: space.lg },
  consoleTitle: { ...T.title, color: c.text },
  consoleSub: { ...T.caption, color: c.text3, marginBottom: space.xs },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.xs,
  },
  kvInline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kvAction: { marginTop: space.sm },
  kvK: { ...T.caption, color: c.text3 },
  kvV: { ...T.body, color: c.text, flexShrink: 1, textAlign: 'right' },
  kvMono: { fontVariant: ['tabular-nums'] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
