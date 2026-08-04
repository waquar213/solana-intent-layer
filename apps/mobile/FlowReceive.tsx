/**
 * Receive — a ./ui Sheet that shows the wallet's real address per chain as a scannable QR
 * plus the full address to copy. One job per screen: give someone your address. The chain
 * (Ethereum·Sepolia / Solana·devnet / Bitcoin·testnet) is a quiet tab switch; the address and
 * its QR are the hero. Copy is the single affordance. No balances, no history, no invention —
 * every value is the real on-device address or an honest "no address" state.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useTheme, type Palette, radius, space, mono, type as T } from './theme';
import { Sheet } from './ui';
import { currentIdentity } from './wallet';
import { btcActiveAddress } from './broadcast';
import { netCfg, useNetwork } from './network';

type ChainKey = 'evm' | 'sol' | 'btc';

interface ChainDef {
  key: ChainKey;
  tab: string;
  network: string;
  address: string | null;
}

const QR_SIZE = 224;

export default function ReceiveFlow({ onClose }: { onClose(): void }): React.JSX.Element {
  const c = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const id = currentIdentity();
  useNetwork(); // re-render on a Mainnet⇄Testnet switch so addresses + labels follow it
  const cfg = netCfg();
  // EVM/SOL addresses are network-agnostic; only the LABEL changes. BTC re-encodes: bc1 on mainnet,
  // tb1 on testnet (btcActiveAddress) — never hand out a wrong-network receive address.
  const chains: ChainDef[] = [
    { key: 'evm', tab: 'Ethereum', network: cfg.evm.chain === 'ethereum' ? 'Ethereum · Mainnet' : 'Ethereum · Sepolia', address: id?.evm.address ?? null },
    { key: 'sol', tab: 'Solana', network: cfg.sol.cluster === 'mainnet' ? 'Solana · Mainnet' : 'Solana · devnet', address: id?.sol.address ?? null },
    { key: 'btc', tab: 'Bitcoin', network: cfg.btc.network === 'mainnet' ? 'Bitcoin · Mainnet' : 'Bitcoin · testnet', address: btcActiveAddress() },
  ];

  const [active, setActive] = useState<ChainKey>('evm');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chain = chains.find((ch) => ch.key === active) ?? chains[0];

  // Reset the "Copied" state whenever the chain changes so the label reflects the shown address.
  useEffect(() => {
    setCopied(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [active]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (): Promise<void> => {
    if (!chain.address) return;
    // Only claim success once the clipboard write actually resolves — never show "Copied ✓" (or
    // announce it) for a copy that silently failed.
    try {
      await Clipboard.setStringAsync(chain.address);
    } catch {
      AccessibilityInfo.announceForAccessibility('Copy failed');
      return;
    }
    AccessibilityInfo.announceForAccessibility(`${chain.network} address copied`);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet title="Receive" onClose={onClose}>
      {/* Chain tabs — quiet mechanism, not the point of the screen. */}
      <View style={s.tabs}>
        {chains.map((ch) => {
          const on = ch.key === active;
          return (
            <Pressable
              key={ch.key}
              style={[s.tab, on && s.tabOn]}
              onPress={() => setActive(ch.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Show ${ch.network} address`}
            >
              <Text style={[s.tabTxt, on && { color: c.text, fontWeight: '700' }]} importantForAccessibility="no">
                {ch.tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {chain.address ? (
        <>
          <View style={s.qrWrap}>
            <View style={s.qrCard}>
              <QRCode value={chain.address} size={QR_SIZE} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
            </View>
          </View>

          <View style={s.addrBlock}>
            <Text style={s.addrLabel}>{chain.network}</Text>
            <Text style={s.addr} selectable>
              {chain.address}
            </Text>
          </View>

          <Pressable
            style={[s.copyBtn, copied && s.copyBtnDone]}
            onPress={() => void copy()}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${chain.network} address`}
            accessibilityState={{ busy: copied }}
          >
            <Text style={[s.copyTxt, copied && { color: c.success }]}>{copied ? 'Copied ✓' : 'Copy address'}</Text>
          </Pressable>

          <Text style={s.warn}>Only send {chain.network} assets to this address.</Text>
        </>
      ) : (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No {chain.tab} address</Text>
          <Text style={s.emptyBody}>Unlock your wallet to reveal your {chain.network} receiving address.</Text>
        </View>
      )}
    </Sheet>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.pill, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  tabOn: { backgroundColor: c.surface },
  tabTxt: { ...T.caption, color: c.text3 },

  qrWrap: { alignItems: 'center', marginTop: space.sm },
  qrCard: { backgroundColor: '#FFFFFF', padding: space.base, borderRadius: radius.lg },

  addrBlock: { alignItems: 'center', gap: space.xs },
  addrLabel: { ...T.label, color: c.text3, textTransform: 'uppercase' },
  addr: { fontFamily: mono, fontSize: 13, lineHeight: 20, color: c.text, textAlign: 'center', paddingHorizontal: space.sm },

  copyBtn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: c.accent,
  },
  copyBtnDone: { backgroundColor: c.accentSubtle, borderWidth: StyleSheet.hairlineWidth, borderColor: c.success },
  copyTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  warn: { ...T.caption, color: c.text3, textAlign: 'center', paddingHorizontal: space.base },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  emptyTitle: { ...T.headline, color: c.text },
  emptyBody: { ...T.body, color: c.text2, textAlign: 'center', paddingHorizontal: space.base },
});
