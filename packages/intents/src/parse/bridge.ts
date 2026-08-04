/**
 * Bridge utterance parsing — every route the wallet can actually bridge, in any direction.
 *
 * Deliberately NOT part of `parseDeterministic`: a bridge is not one of the planner's intent kinds
 * (there is no server-side route/quote to plan), it is driven client-side. It lives here anyway so
 * the rules stay pure, exported, and covered by this package's suite rather than buried in a
 * component.
 *
 * SCOPE — this mirrors what the wallet can execute, no more:
 *   Sepolia ⇄ GIWA (ETH) · Solana ⇄ either (SOL) · Bitcoin ⇄ either (BTC)
 * Only each chain's NATIVE asset crosses, so "bridge 100 USDC to giwa" is correctly not a bridge.
 * A parser that accepted routes the executor refuses would only move the dead end later.
 *
 * Disambiguation: a message naming a concrete RECIPIENT is an ordinary transfer *unless* the verb
 * is explicitly "bridge" — plain sends already settle on GIWA, so "send 1 ETH to 0x… on giwa" must
 * stay a transfer. When it IS an explicit bridge, that address is carried through as the
 * destination recipient and never dropped: a silently discarded recipient is exactly how a wallet
 * ends up moving funds somewhere the user did not ask for.
 */

/** The chains the wallet can bridge between — ids match `BRIDGE_CHAINS` in the web app. */
export type BridgeChainId = 'sepolia' | 'giwa' | 'solana' | 'bitcoin';
export type BridgeAsset = 'ETH' | 'SOL' | 'BTC';

/** Each chain's native asset — the only thing that can leave it through the bridge. */
const CHAIN_ASSET: Record<BridgeChainId, BridgeAsset> = {
  sepolia: 'ETH',
  giwa: 'ETH',
  solana: 'SOL',
  bitcoin: 'BTC',
};

/**
 * Names each chain answers to, most specific FIRST so "giwa sepolia" reads as GIWA and never as
 * Sepolia. `\bbtc\b` deliberately cannot match "wbtc" — a different asset, not a chain.
 */
const CHAIN_NAMES: [BridgeChainId, RegExp][] = [
  ['giwa', /\bgiwa(?:\s+sepolia)?\b|\bl2\b/iu],
  ['solana', /\bsolana(?:\s+devnet)?\b|\bsol\b|솔라나|솔라/iu],
  ['bitcoin', /\bbitcoin(?:\s+testnet)?\b|\bbtc\b|비트코인|비트코/iu],
  ['sepolia', /\b(?:eth(?:ereum)?\s+)?sepolia\b|\bl1\b|\bethereum\b|이더리움/iu],
];

/** An address-shaped token anywhere in the text — EVM, Bitcoin, Solana, or ENS. */
const HAS_RECIPIENT =
  /(0x[0-9a-fA-F]{40}|(?:bc1|tb1)[0-9a-z]{20,80}|[1-9A-HJ-NP-Za-km-z]{32,44}|[a-zA-Z0-9][a-zA-Z0-9-]*\.eth)/u;

/** Verbs meaning "move my own funds across" — wide, because the destination carries the meaning. */
const BRIDGE_VERB = /\b(bridge|bridged|bridging|deposit|move|send|transfer|top\s?up|fund|withdraw|shift)\b/iu;
const BRIDGE_VERB_KO = /브릿지|브리지|입금|보내|전송|출금/u;
const BRIDGE_VERB_HI = /\b(bhejo|bhej\s?do|bhejdo|vejo|daal\s?do|daalo|dalo|bhejna|kro|karo|krdo|kardo)\b/iu;
/** The ONLY verbs unambiguous enough to keep an explicit recipient (see the header). */
const EXPLICIT_BRIDGE = /\b(bridge|bridged|bridging)\b|브릿지|브리지/iu;

/** Assets the wallet holds that can NEVER cross this bridge — naming one ends the match. */
const NON_BRIDGE_ASSET = /\b(usdc|usdt|dai|gusdc|dusdc|wbtc|weth|pol|matic|bnb)\b/iu;

/** Names a chain as the SOURCE rather than the destination ("withdraw from giwa", "giwa se"). */
const FROM_MARK = /\b(?:from|se|outta|out\s+of)\b|에서/iu;
/** Markers that introduce a DESTINATION (EN / Hinglish / Korean). */
const TO_MARK = /\b(?:to|into|onto|towards?)\b|→|->|\bpe\b|\bpar\b|로\b|으로/iu;

export interface BridgeRoute {
  fromId: BridgeChainId;
  toId: BridgeChainId;
  /** The SOURCE chain's native asset — what actually leaves the wallet. */
  asset: BridgeAsset;
  /** Decimal amount of `asset`, or null when the route is clear but the amount is not. */
  amount: string | null;
  /** An explicitly named destination address; absent ⇒ the user's own address on `toId`. */
  recipient?: string;
}

/** Every chain named in the text, in the order they appear. */
function chainHits(q: string): { id: BridgeChainId; at: number }[] {
  const hits: { id: BridgeChainId; at: number }[] = [];
  for (const [id, re] of CHAIN_NAMES) {
    const m = re.exec(q);
    if (m) hits.push({ id, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * The asset the user named outright, if any — TICKERS ONLY.
 *
 * Chain names are deliberately excluded: "…from giwa to bitcoin" names bitcoin as a DESTINATION
 * CHAIN, and reading that as the asset BTC made the route look self-contradictory (ETH leaving
 * GIWA, asset BTC) and killed a valid bridge. Where a chain name really does imply the asset,
 * `CHAIN_ASSET[fromId]` already supplies it.
 */
function namedAsset(q: string): BridgeAsset | null {
  if (/\bsol\b|솔라나/iu.test(q)) return 'SOL';
  if (/\bbtc\b|비트코인/iu.test(q)) return 'BTC';
  if (/\beth\b|이더\b/iu.test(q)) return 'ETH';
  return null;
}

/** The first chain named AFTER `marker` — how an explicit "from X" / "to Y" is read. */
function chainAfter(text: string, marker: RegExp): BridgeChainId | null {
  const m = marker.exec(text);
  if (!m) return null;
  const hits = chainHits(text.slice(m.index + m[0].length));
  return hits.length > 0 ? (hits[0] as { id: BridgeChainId }).id : null;
}

/** The other end of a route when the user named only one side. */
function counterpart(known: BridgeChainId, asset: BridgeAsset | null): BridgeChainId {
  if (asset === 'SOL' && known !== 'solana') return 'solana';
  if (asset === 'BTC' && known !== 'bitcoin') return 'bitcoin';
  return known === 'giwa' ? 'sepolia' : 'giwa';
}

/** Where an asset must leave FROM when the user named only a destination. */
function sourceForAsset(asset: BridgeAsset, dest: BridgeChainId): BridgeChainId | null {
  if (asset === 'SOL') return dest === 'solana' ? null : 'solana';
  if (asset === 'BTC') return dest === 'bitcoin' ? null : 'bitcoin';
  if (dest === 'giwa') return 'sepolia'; // ETH lives on both EVM chains — the source is the other
  if (dest === 'sepolia') return 'giwa';
  return 'sepolia'; // bridging ETH out to Solana/Bitcoin starts on L1
}

/**
 * Parse a bridge request into a concrete route. Null when this isn't a bridge at all;
 * `amount: null` when the route is unambiguous but the amount still has to be asked for, so the UI
 * can ASK instead of dead-ending on "I couldn't understand that".
 */
export function parseBridgeUtterance(q: string): BridgeRoute | null {
  const explicit = EXPLICIT_BRIDGE.test(q);
  const addr = HAS_RECIPIENT.exec(q);
  if (addr && !explicit) return null; // concrete recipient + ambiguous verb ⇒ ordinary transfer
  if (!BRIDGE_VERB.test(q) && !BRIDGE_VERB_KO.test(q) && !BRIDGE_VERB_HI.test(q)) return null;
  if (NON_BRIDGE_ASSET.test(q)) return null;

  // Blank the address before looking for chain names: base58 can contain "sol"/"btc" runs, and a
  // recipient must never be read as a route.
  const scan = addr ? q.replace(addr[0], ' ') : q;
  const hits = chainHits(scan);
  if (hits.length === 0) return null;

  const asset = namedAsset(scan);
  const positional = hits.map((h) => h.id);

  // An EXPLICIT "from X" / "to Y" always wins over word order. Position alone read the asset in
  // "bridge 5 SOL from sepolia to giwa" as the source chain (SOL ⇒ solana) and happily produced
  // solana→giwa, ignoring the "from sepolia" the user actually typed.
  const explicitFrom = chainAfter(scan, FROM_MARK);
  const explicitTo = chainAfter(scan, TO_MARK);

  let toId: BridgeChainId | null =
    explicitTo ??
    (explicitFrom
      ? positional.find((id) => id !== explicitFrom) ?? null
      : positional[positional.length - 1] ?? null);
  let fromId: BridgeChainId | null = explicitFrom ?? (toId ? positional.find((id) => id !== toId) ?? null : null);

  // Only one side stated — fill the other in.
  if (fromId && !toId) toId = counterpart(fromId, asset); // "withdraw 0.05 from giwa"
  if (toId && !fromId) fromId = sourceForAsset(asset ?? CHAIN_ASSET[toId], toId); // "top up giwa with 0.01 ETH"
  if (!fromId || !toId || fromId === toId) return null;

  // The asset is whatever leaves the SOURCE chain. A user naming a different one describes a route
  // the executor would refuse ("bridge 5 SOL from sepolia"), so null beats a doomed plan.
  const routeAsset = CHAIN_ASSET[fromId];
  if (asset !== null && asset !== routeAsset) return null;

  // Prefer an asset-qualified amount, then a bare number ("bridge 0.5 to giwa").
  const qualified = new RegExp(`(\\d+(?:\\.\\d+)?|\\.\\d+)\\s*(?:${routeAsset}\\b|이더|솔라나|비트코인)`, 'iu');
  const m = qualified.exec(scan) ?? /(\d+(?:\.\d+)?|\.\d+)/u.exec(scan);
  const raw = m?.[1];
  const amount = raw === undefined ? null : raw.startsWith('.') ? `0${raw}` : raw;
  return { fromId, toId, asset: routeAsset, amount, ...(addr ? { recipient: addr[0] } : {}) };
}
