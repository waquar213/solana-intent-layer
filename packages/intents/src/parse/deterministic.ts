/**
 * Deterministic pre-parser — the free, instant fast-path for the highest-
 * frequency utterance shapes (ADR-0014). It returns a typed `Intent` when it is
 * confident, a `clarify` intent when it recognizes the shape but is missing a
 * field, or `null` to defer to the LLM. Every value it extracts is exact and
 * testable — no model, no network, sub-millisecond.
 */
import type { Intent } from '../schema.js';
import { detectAsset, extractAmountAndAsset } from '../amount.js';

const STABLE = /\b(stable|stables|stablecoin|stablecoins|usdc|usdt|dai)\b/u;

/** The action verbs a message can open with — used to un-glue "swap10"/"send5" typos. */
const VERB = 'send|transfer|pay|wire|swap|convert|change|exchange|trade|buy|sell|stake|bridge|deposit|move|put|shift';

/**
 * Chain / network names that are NOT also asset tickers we know — so a trailing
 * "… on arbitrum" / "… to giwa" is safely read as a settlement hint and stripped,
 * never mistaken for the swap's destination asset. (POL/MATIC/BNB are deliberately
 * absent: they're assets here, so "convert ETH to MATIC" must keep MATIC as the target.)
 */
const CHAIN_WORDS =
  'giwa(?: sepolia)?|sepolia|arbitrum(?: one)?|arbitrum|arb|optimism|base|avalanche|avax|gnosis|linea|scroll|zksync|zk ?sync|blast|mantle|celo|fantom|ftm|mainnet|testnet|devnet|l2';
const CHAIN_SUFFIX = new RegExp(
  `\\s+(?:on|to|via|using|over|through|onto|in)\\s+(?:the\\s+)?(?:${CHAIN_WORDS})(?:\\s+(?:chain|network|mainnet|testnet|l2))?\\s*$`,
  'iu',
);

/**
 * Korean asset NAMES → tickers. `detectAsset` reads Latin symbols only, so Hangul asset
 * names must be surfaced as tickers first ("비트코인을 이더리움으로" → "BTC 을 ETH 으로"). Only
 * unambiguous crypto names are mapped. Spaces are added so the ticker splits off any particle.
 */
const KO_NAMES: [RegExp, string][] = [
  [/비트코인|비트코/gu, ' BTC '],
  [/이더리움/gu, ' ETH '],
  [/솔라나/gu, ' SOL '],
  [/테더/gu, ' USDT '],
  [/폴리곤/gu, ' POL '],
];

/**
 * Chain-qualified stablecoin names → their OWN ticker, before any parser sees the text.
 *
 * gUSDC (GIWA) and dUSDC (Solana devnet) are different tokens on different chains from plain
 * USDC. Left as two words, `detectAsset` — which matches whole words — drops "giwa" as an
 * unknown and returns USDC, so "10 giwa usdc to sol" was priced and routed through Solana's
 * pool while the UI echoed back exactly what the user typed. Same fix as KO_NAMES: rewrite the
 * name to its ticker first, and let one asset mean one token.
 *
 * "sol usdc" is deliberately NOT an alias — it collides with the connector-less "swap SOL USDC".
 */
const QUALIFIED_STABLES: [RegExp, string][] = [
  [/\bgiwa\s+usdc?\b/giu, ' GUSDC '],
  [/\b(?:solana\s+)?devnet\s+usdc\b/giu, ' DUSDC '],
];

/**
 * Cheap, loss-tolerant normalization applied before any pattern matches:
 *   1. map Korean asset names → tickers (so the Latin-only asset detector can see them),
 *   2. map chain-qualified stablecoin names → their own tickers (gUSDC / dUSDC ≠ USDC),
 *   3. un-glue an action verb stuck to its amount ("swap10" → "swap 10", "SEND5" → "SEND 5"),
 *   4. collapse runs of whitespace.
 * Case is preserved (recipient addresses are case-sensitive); only structure is fixed.
 */
/**
 * Strip invisible/format characters and apply compatibility (NFKC) normalization — the SHARED pre-pass
 * for both this file's normalize() AND the engine's injection veto (looksLikeInjection), so the two can
 * never disagree. A zero-width space / soft-hyphen / BOM / word-joiner / bidi control spliced INTO a word
 * ("ig<U+200B>nore", "inst<U+200B>ructions", "don<U+200B>t") silently breaks every \b/word matcher — the
 * injection cue, the negation gate, ticker detection — so a declined or injected fund move would sign
 * confidently. NFKC also folds full-width/compatibility digits and letters to ASCII ("５ ETH" → "5 ETH").
 * Addresses are ASCII (hex / bech32 / base58) and pass through unchanged.
 */
// Latin-lookalike homoglyphs (Cyrillic + Greek) a fund/cue word could be spelled with to slip past BOTH
// the negation gate AND the injection veto \u2014 e.g. "\u043Everride" with a Cyrillic '\u043E' (U+043E) reads as ASCII
// "override" to a human but NFKC leaves it untouched, so neither cue detector matched. Folded to their
// ASCII twin so both layers see the real word. Legit tickers/amounts/addresses are ASCII (never in these
// ranges), so this can't corrupt them; an unsaved Cyrillic recipient name still fails to resolve \u2192 clarify.
const CONFUSABLES: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u0455': 's', '\u0456': 'i', '\u0458': 'j', '\u043E': 'o',
  '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u04BB': 'h',
  '\u03B1': 'a', '\u03B5': 'e', '\u03BA': 'k', '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p', '\u03C5': 'u', '\u03C7': 'x',
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'gu');

export function canonicalizeText(text: string): string {
  return text
    .normalize('NFKD') // decompose so a combining mark separates from its base letter (\u00E9 -> e + U+0301)
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu, '') // strip invisible/format chars
    .replace(/\p{M}/gu, '') // strip combining marks so a diacritic can't hide a gate word ("d\u00F3n't" -> "don't", "n\u00E1" -> "na")
    .replace(/[\u2010-\u2015\u2043\u2212\u02D7\u2796]/gu, '-') // fold Unicode dash/minus glyphs -> ASCII '-' so the range/sign guards match ("5\u201010" -> "5-10", "\u22125" -> "-5")
    .replace(/\u066B/gu, '.') // Arabic DECIMAL separator -> '.' so "0\u066B5 ETH" parses as 0.5, not "5" (a 10x over-send)
    .replace(/\u066C/gu, ',') // Arabic THOUSANDS separator -> ',' so it takes the ASCII grouped-thousands path
    .normalize('NFKC') // recompose Hangul syllables + fold remaining compatibility forms (fullwidth -> ASCII)
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c); // fold Cyrillic/Greek homoglyphs -> ASCII twin (see above)
}

// A zero-width / bidi / format char, or a token that MIXES Latin with Cyrillic/Greek, is a pure
// OBFUSCATION marker — a legitimate command is single-script ASCII (tickers/amounts/addresses) with no
// format chars. Tested on the RAW input (before the strip/fold), this catches the whole class that the
// strip+fold alone cannot: (1) a zero-width char BETWEEN two cue words glues them ("ignore<ZWSP>previous"
// -> "ignoreprevious", which the strip can't un-glue and \s+/\b then miss), and (2) a homoglyph OUTSIDE
// the confusables map (e.g. Cyrillic т U+0442). Both injection layers + the deterministic parser consult
// this, so an obfuscated fund command DEFERS/vetoes on every layer instead of confidently signing.
// A format char is an obfuscation threat ONLY when adjacent to a LETTER \u2014 it's splicing/gluing a word
// ("ig<ZWSP>nore", "ignore<ZWSP>previous"). A ZWJ/ZWNJ (U+200C/200D, inside this range) BETWEEN PICTOGRAPHS
// is just a compound emoji (family/profession/flag), never an attack \u2014 so requiring a letter neighbour
// clears every legit emoji while still catching every word-splice. (Without the \p{L} anchor, a legit
// "send 1 ETH to dev \uD83D\uDC68\u200D\uD83D\uDCBB" was refused as injection \u2014 an over-block worse than the bug.)
const FORMAT_ADJACENT =
  /\p{L}[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]\p{L}/u;
// The scripts with ASCII-Latin LOOKALIKES an attacker uses for homoglyphs (Cyrillic/Greek/Armenian/
// Cherokee/Coptic). NOT Hangul/Han/Arabic/Hebrew — those look nothing like Latin, so a legit "1 ETH 보내"
// (Latin ticker + Hangul) must never flag.
const MIXED_SCRIPT =
  /\p{Script=Latin}[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\p{Script=Coptic}]|[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\p{Script=Coptic}]\p{Script=Latin}/u;
export function looksObfuscated(input: string): boolean {
  return FORMAT_ADJACENT.test(input) || MIXED_SCRIPT.test(input); // homoglyphs caught by MIXED_SCRIPT regardless
}

function normalize(text: string): string {
  // Strip invisibles + NFKC FIRST (see canonicalizeText) so no gate word can be split by a hidden char.
  // Then canonicalize smart/curly apostrophes (U+2018/2019/02BC/FF07) to a straight quote — iOS/macOS
  // auto-substitute a typed "'" into "’" (U+2019), which would otherwise slip "don’t"/"won’t"/"can’t"
  // past the negation gate and every other apostrophe-sensitive matcher below.
  let t = canonicalizeText(text).replace(/[‘’ʼ＇]/gu, "'");
  for (const [re, sym] of KO_NAMES) t = t.replace(re, sym);
  for (const [re, sym] of QUALIFIED_STABLES) t = t.replace(re, sym);
  return t
    .replace(new RegExp(`^\\s*(${VERB})(\\d)`, 'iu'), '$1 $2')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Chain names for CAPTURE ONLY. This never modifies the text, so it can be broader than
 * `CHAIN_SUFFIX`'s vocabulary with zero risk to how intents parse. Multi-word forms are listed
 * first so "giwa sepolia" is captured whole and "ethereum mainnet" is not reduced to a bare
 * "mainnet". A bare "ethereum" is deliberately ABSENT — "convert ethereum to usdc" names the
 * asset, not the chain, and capturing it there would break a working utterance.
 */
const CHAIN_MENTION = new RegExp(
  `\\b(?:giwa\\s+sepolia|ethereum\\s+sepolia|ethereum\\s+mainnet|` +
    `arbitrum\\s+one|solana\\s+devnet|bitcoin\\s+testnet|${CHAIN_WORDS})\\b`,
  'iu',
);
// No "eth sepolia" / "eth mainnet" alias here on purpose. Those swallow the ASSET ticker in
// "swap 1 USDC for ETH SEPOLIA" — the very utterance that shipped a wrong-chain swap — capturing
// "eth sepolia" and putting an asset word inside a chain hint. Bare "sepolia"/"mainnet" already
// carry the whole meaning, so the smaller vocabulary is both safer and sufficient.

const normChain = (s: string): string => s.trim().toLowerCase().replace(/\s+/gu, ' ');

export interface ChainHint {
  /** The utterance with a trailing settlement hint removed — the same value this always returned. */
  text: string;
  /** The chain the user named ("giwa sepolia", "arbitrum", "mainnet"), or null if none. */
  requestedChain: string | null;
}

/**
 * Drops a trailing settlement hint ("… on giwa", "… to arbitrum") so the asset parsers see a clean
 * "<verb> <amount> <asset> [for <asset>]" body — AND reports which chain was named.
 *
 * The hint used to be dropped and forgotten. Nothing consumed it, so "swap 1 USDC for ETH on
 * sepolia" and "swap 1 USDC for ETH" produced byte-identical intents and the swap silently settled
 * on GIWA. There are TWO ways a chain leaks out, and both are captured here:
 *
 *   A. a trailing hint — "… on sepolia". `CHAIN_SUFFIX` removes it from the text, as before.
 *   B. a chain named INLINE with no preposition to anchor it — "swap 1 USDC TO SEPOLIA ETH".
 *      `CHAIN_SUFFIX` cannot see this (it requires on/to/via *directly* before the chain), so the
 *      word fell through to `detectAsset`, which read "SEPOLIA ETH" as ETH and dropped "SEPOLIA".
 *      Fixing only (A) would have left the exact case that shipped a wrong-chain swap today.
 *
 * Case B is captured WITHOUT touching the text, so parsing is provably unchanged by this reporting.
 */
function stripChainSuffix(text: string): ChainHint {
  const suffix = CHAIN_SUFFIX.exec(text);
  const stripped = text.replace(CHAIN_SUFFIX, '').trim();
  const named = CHAIN_MENTION.exec(suffix ? suffix[0] : stripped);
  return { text: stripped, requestedChain: named ? normChain(named[0]) : null };
}

/** The chain a user named in their message, or null. Exported so the rule is testable on its own. */
export function parseChainHint(input: string): string | null {
  if (input.trim().length === 0) return null;
  return stripChainSuffix(normalize(input)).requestedChain;
}

/**
 * An address-shaped token ANYWHERE in the utterance — not just at the tail like
 * `trailingRecipient`. Verb-final languages put the send verb AFTER the address
 * ("… convert kar ke <addr> bhejo"), so a recipient can sit mid-sentence.
 * The ENS branch demands a letter in the label so "send 1.eth" isn't read as a name.
 */
const ADDRESS_ANYWHERE =
  // ENS branch: a BOUNDED lookahead requires a letter in the label (so "1.eth" isn't a name) WITHOUT the
  // two overlapping unbounded stars the old form had — those caused catastrophic backtracking (a crafted
  // ~6k-char non-matching string hung the parser ~51s). Safe on its own now, not just behind a length cap.
  /0x[0-9a-fA-F]{40}|(?:bc1|tb1)[0-9a-z]{20,80}|[1-9A-HJ-NP-Za-km-z]{32,44}|(?=[a-zA-Z0-9-]{0,80}[a-zA-Z])[a-zA-Z0-9-]{1,80}\.eth/u;

/** The only two intent kinds that have anywhere to PUT a recipient (see schema.ts). */
const CARRIES_RECIPIENT = new Set(['transfer', 'swap_and_send']);
/** Kinds that move no funds — an address inside them is a topic, not a destination. */
const NO_FUNDS_MOVED = new Set(['clarify', 'query', 'unsupported']);

/**
 * SAFETY NET — a recipient must NEVER be silently dropped.
 *
 * Every parser here extracts the fields it recognizes and ignores the rest, which is fine until
 * the ignored part is an ADDRESS: the wallet then executes something materially different from
 * what was asked (a bare swap instead of convert-and-send) and reports it as "✓ done" with the
 * destination gone. `parseLooseConvert` shows how easily it happens — an address becomes one long
 * "filler" word, and filler is tolerated whenever an explicit amount was found.
 *
 * So this runs LAST, over whatever was parsed: if the user wrote an address and the intent has
 * nowhere to hold it, we refuse to guess and ask. A phrasing hole now costs a clarify, never a
 * wrong transaction — and it holds for holes nobody has found yet, not just the known ones.
 */
function guardDroppedRecipient(text: string, intent: Intent | null): Intent | null {
  if (!intent) return null;
  if (CARRIES_RECIPIENT.has(intent.kind) || NO_FUNDS_MOVED.has(intent.kind)) return intent;
  const addr = ADDRESS_ANYWHERE.exec(text);
  if (!addr) return intent;
  return {
    kind: 'clarify',
    question: `You included an address (${addr[0]}) but I read this as a plain ${intent.kind.replace(/_/gu, ' ')}, which has no destination — so I stopped instead of guessing. Do you want the result sent there? Try: “… and send to ${addr[0]}”.`,
  };
}

/** Intent kinds whose settlement chain a user can meaningfully name (see `RequestedChain`). */
const ACCEPTS_CHAIN = new Set(['transfer', 'swap', 'swap_and_send']);

/**
 * Attach the chain the user named to the parsed intent — at ONE point, after every parser has run.
 * Threading it through each of the fifteen parsers individually would guarantee that some return
 * path eventually forgot it, which is the exact bug being fixed.
 */
function withRequestedChain(intent: Intent | null, chain: string | null): Intent | null {
  if (intent === null || chain === null || !ACCEPTS_CHAIN.has(intent.kind)) return intent;
  return { ...intent, chain } as Intent;
}

/**
 * True when an utterance NEGATES or merely QUESTIONS its command ("don't swap 1 ETH", "should I
 * change 1 ETH to USDC?", Hinglish "…ko mat bhejo", Korean "…보내지 마"). The loose parsers tolerate
 * stray filler around an explicit amount, so without this veto they latch onto the amount and would
 * sign the very action the user REJECTED. A declined/questioned move must defer (to the LLM or a
 * clarify), never a confident sign. Exported so a fund path that runs OUTSIDE parseDeterministic
 * (e.g. the client-side bridge parser) enforces the IDENTICAL veto instead of silently skipping it.
 * (cancel/stop/undo are deliberately NOT here — those are legitimate emergency-exit commands.)
 */
export function looksNegatedOrDeferred(input: string): boolean {
  const text = normalize(input);
  return text.length > 0 && negatedGate(text);
}

/** The negation/deferral test over ALREADY-normalized text — the shared core of looksNegatedOrDeferred. */
function negatedGate(text: string): boolean {
  // Mask ENS names before testing, so an unsaved recipient like "never.eth" / "wont.eth" isn't read as
  // a negation word and over-deferred. (Saved contacts are already substituted to addresses upstream.)
  const gateText = text.toLowerCase().replace(/\b[a-z0-9-]+\.eth\b/giu, ' ');
  return (
    /\b(?:don'?t|do not|never|shouldn'?t|wouldn'?t|won'?t|can'?t|cannot|instead of|should i|shall i|rather\s+not|forget|nvm|not\s+(?:now|yet)|leave\s+it)\b/iu.test(gateText) ||
    // Ambiguous deferral words (skip/avoid/hold off/no need) ALSO appear as benign modifiers AFTER the
    // verb — "swap 1 ETH to USDC, avoid high fees". Treat them as a deferral ONLY when an action
    // verb/gerund follows (through an optional particle), else a trailing modifier over-defers.
    /\b(?:skip|avoid|hold\s?off|no\s+need)\b\s+(?:to\s+|on\s+|the\s+|about\s+)*(?:swap|send|transfer|convert|buy|sell|stake|bridge|pay|move|exchange|swapping|sending|transferring|converting|buying|selling|staking|bridging|paying|moving|exchanging)\b/iu.test(gateText) ||
    // Negation is NOT English-only: the loose parsers read Hinglish (bhejo/badlo/…) and Korean
    // (보내/바꿔/…), so a negated command there must defer too. Anchor the Hinglish negators to a
    // following verb so a recipient literally named "mat" isn't over-deferred; Korean uses the
    // prohibitive "-지 말다" — the elided imperative 마 AND every stem 말고/말아/말아줘/말라/말자 (both
    // 마 U+B9C8 and 말 U+B9D0, hence [마말]), plus 마세요 and the "안" prefix before a fund verb. Korean
    // is tested on the original text (Hangul survives lower-casing; the ENS mask is Latin-only).
    // Hinglish, BOTH orders + an optional intervening particle (hi/toh/bhi): "mat bhejo", "mat hi bhejo",
    // AND the very common post-verb form "bhejo mat" / "bhejo mat yaar" (a declined send that used to sign).
    /\b(?:mat|mt|nahi|nahin|nako|na)\s+(?:hi\s+|toh\s+|bhi\s+)?(?:bhej|bhij|vej|bej|badl|kar|kr|karo|kro|bech|le|lo|de|do|banao|bana|kharido|khareedo|swap|send|convert|buy|sell|stake|transfer|pay|move|change|exchange)/iu.test(gateText) ||
    /\b(?:bhej|bhij|vej|bej|badl|karo|kro|bech|banao|bana|kharido|khareedo|swap|send|convert|buy|sell|stake|transfer|pay|change|exchange)\w*\s+(?:hi\s+|toh\s+|bhi\s+)?(?:mat|mt|nahi|nahin|nako)\b/iu.test(gateText) ||
    /지\s?[마말]|지\s?않|마세요|안\s?(?:보내|송금|전송|부쳐|송신|바꾸|바꿔|스왑|교환|전환|팔|사|구매|스테이킹|예치)|(?:보내|송금|전송|부쳐|송신|바꾸|바꿔|스왑|교환|전환|팔|사|구매|스테이킹|예치)\s?안(?![가-힣])/u.test(text)
  );
}

export function parseDeterministic(input: string): Intent | null {
  if (input.trim().length === 0) return null;
  // Obfuscated input (a zero-width/format char, or a Latin+Cyrillic/Greek mixed-script token) is never a
  // legitimate command — DEFER it rather than risk a confident parse of a cue-word the strip/fold can't
  // fully un-hide (a zero-width GLUING two words, an out-of-map homoglyph). The LLM path has its own
  // defense, and the engine's injection veto (which shares looksObfuscated) is the backstop.
  if (looksObfuscated(input)) return null;
  const { text, requestedChain } = stripChainSuffix(normalize(input));
  const lower = text.toLowerCase();
  if (text.length === 0) return null;

  // Never emit a CONFIDENT deterministic action for an utterance that NEGATES or merely QUESTIONS the
  // command ("don't swap 1 ETH", "should I change 1 ETH to USDC?"). The loose parsers tolerate stray
  // filler around an explicit amount, so without this they'd latch onto the amount and sign the very
  // action the user rejected. The gate is shared (looksNegatedOrDeferred) so the client bridge path
  // enforces the identical veto. (cancel/stop/undo stay OUT — legitimate emergency-exit commands.)
  if (negatedGate(text)) return null;

  // A vulgar-fraction glyph (½, ¼, ⅒ …) NFKC-folds to "N⁄M" (U+2044 FRACTION SLASH). We can't represent it
  // as an amount and the matchers latch onto the DENOMINATOR ("½ ETH" → 2 ETH). Clarify UNIFORMLY across
  // every intent (transfer/swap/stake/convert) — the amount-level guard alone would let swap/stake fall
  // back to "all". Ask for a plain decimal instead.
  if (/[\u2044\u2215\u29F8\u00F7]/u.test(text)) {
    return { kind: 'clarify', question: 'Please write the amount as a decimal (e.g. 0.5 ETH), not a fraction symbol like ½.' };
  }

  // "all but N" / "everything except N" names a RESERVE the deterministic parser can't represent — it has
  // no "whole balance minus a remainder" amount. Left to fall through, "convert all but 2 ETH to USDC" is
  // misread as a whole-PORTFOLIO rebalance (liquidating BTC+SOL+ETH) or a convert-ALL-ETH — both auto-
  // signable, both far more than asked. Ask for the exact amount rather than guess a partial the user
  // never confirmed. (The \d requirement keeps "all butter"/"convert all, but first…" from matching.)
  if (/\b(?:all|everything)\s+(?:but|except)\s+(?:for\s+)?\d/u.test(lower)) {
    return {
      kind: 'clarify',
      question: 'I can move your whole balance or a specific amount — not "all but" a remainder. How much exactly would you like to move?',
    };
  }

  return withRequestedChain(
    guardDroppedRecipient(
    text,
    parseRecurring(lower) ??
    parseEmergencyExit(lower) ??
    parseRebalance(lower) ??
    parseTransfer(text, lower) ??
    parseSwapAndSend(text, lower) ??
    parseVerbFinalConvertAndSend(text) ??
    parseSwap(lower) ??
    parseSell(lower) ??
    parseBuy(lower) ??
    parseStake(lower) ??
    parseHelp(lower) ??
    parseQuery(lower) ??
    parseLooseSend(text, lower) ??
    parseLooseBuy(lower) ??
    parseLooseStake(lower) ??
    parseLooseConvert(lower) ??
    null,
    ),
    requestedChain,
  );
}

/**
 * A bare greeting or a "what can you do / help" ask → a query the planner answers with a
 * capability guide (instant + free, no LLM round-trip). Anchored to the WHOLE utterance so a
 * request that merely contains "help" ("help me send 5 ETH to bob") still routes to the
 * action parsers / LLM instead of being swallowed as a help request.
 */
const GREETING = /^(hi|hello|hey|yo|gm|gn|sup|hiya|hola|namaste|greetings)( there| friend| buddy| all| everyone| ya)?[\s!.?]*$/u;
const HELP = /^(help|menu|options|commands?|start|get started|getting started|what can (you|i) do\??|what can this do\??|how does this work\??|how do i (use|start)( this)?\??)[\s!.?]*$/u;

function parseHelp(lower: string): Intent | null {
  if (GREETING.test(lower) || HELP.test(lower)) return { kind: 'query', question: lower };
  return null;
}

/** An address-shaped recipient at the END of the text — EVM (0x…40 hex), Bitcoin
 *  (bc1/tb1…), Solana (base58, 32–44), or an ENS name. Case is preserved (addresses
 *  are case-sensitive). Null if the tail isn't clearly an address. */
function trailingRecipient(text: string): string | null {
  const m = text.match(/(0x[0-9a-fA-F]{40}|(?:bc1|tb1)[0-9a-z]{20,80}|[1-9A-HJ-NP-Za-km-z]{32,44}|[a-zA-Z0-9][a-zA-Z0-9-]*\.eth)\s*$/u);
  return m ? (m[1] as string) : null;
}

/**
 * True when a fragment names TWO OR MORE distinct amount/asset clauses ("half my BTC and ETH", "5 USDC
 * or 3 DAI", "5 ETH and 3 SOL", "1/2 ETH"). extractAmountAndAsset reads only the FIRST amount+asset, so
 * any action parser that skips this check silently DROPS every later clause from the signed plan (the
 * user believes two assets moved; only one did). Split on " and "/" or "/",<space>"/"/" — a bare "," is a
 * thousands separator and must NOT split "1,000". A clause "bears" if it carries an amount, a known
 * asset, or (once a real connector already split it) a bare number.
 */
function hasMultipleBearingClauses(fragment: string): boolean {
  const clauses = fragment.split(/\s+and\s+|\s+or\s+|\s+plus\s+|\s+along\s+with\s+|\s+together\s+with\s+|\s+as\s+well\s+as\s+|,\s+|\s*[&+/]\s*/u).filter((c) => c.trim().length > 0);
  return (
    clauses.length > 1 &&
    clauses.filter((c) => extractAmountAndAsset(c) !== null || detectAsset(c) !== undefined || /\d/u.test(c)).length > 1
  );
}

function finishTransfer(amountAsset: string, recipient: string): Intent {
  const frag = amountAsset.trim().toLowerCase();
  // A COMPOUND amount ("half my ETH and 2 SOL", "5 USDC or 3 DAI", "1/2 ETH") must not silently collapse
  // to its FIRST clause — the rest would vanish from the signed transfer. Mirror the parseSwap guard.
  if (hasMultipleBearingClauses(frag)) {
    return { kind: 'clarify', question: 'I can send one asset at a time — which would you like to send?' };
  }
  const parsed = extractAmountAndAsset(frag);
  if (!parsed) return { kind: 'clarify', question: 'How much do you want to send?' };
  if (!parsed.asset) return { kind: 'clarify', question: 'Which asset do you want to send?' };
  return { kind: 'transfer', asset: parsed.asset, amount: parsed.amount, recipient: recipient.trim() };
}

/**
 * "send $100 USDT to Rahul" / "transfer 0.5 ETH to bc1q…" / "pay 20 USDC to alice"
 * — and, without a "to", "send 1 USDC 0x…" when the tail is a bare address/ENS
 * (unambiguous, so no "to" is needed). A bare NAME still needs "to" to disambiguate.
 */
function parseTransfer(original: string, lower: string): Intent | null {
  if (!/^(?:send|transfer|pay|wire)\b/u.test(lower)) return null;
  const body = original.trim().replace(/^\s*(?:send|transfer|pay|wire)\s+/iu, '');
  if (body.length === 0) return { kind: 'clarify', question: 'How much do you want to send, and to whom?' };

  // Form 1 — explicit "<amount asset> to <recipient>". Anchor on the FIRST " to " (not the last):
  // for "send 0.5 ETH to alice and 0.3 to bob" the last " to " would bind ALICE's amount (the first
  // one extracted) to BOB. Multi-recipient sends are unsupported, so with the first " to " the tail
  // ("alice and 0.3 to bob") is a non-resolvable recipient that falls through to a clarify — refusing
  // to guess is safer than silently paying the wrong person (especially under Auto mode).
  const toIdx = body.toLowerCase().indexOf(' to ');
  if (toIdx >= 0) return finishTransfer(body.slice(0, toIdx), body.slice(toIdx + 4).trim());

  // Form 2 — no "to": accept a bare address/ENS at the very end as the recipient.
  const recipient = trailingRecipient(body);
  if (!recipient) return null; // ambiguous (e.g. a bare name) → defer to the LLM / clarify
  return finishTransfer(body.slice(0, body.lastIndexOf(recipient)), recipient);
}

/**
 * Compound: "convert 5 USDC to SOL and send to <addr>" / "swap 1 ETH for USDC then send <addr>".
 * Splits on "… and|then send|transfer|pay …": the left half is a swap, the right half is the
 * recipient (a bare address or "to <recipient>"). Runs BEFORE parseSwap so the swap parser never
 * swallows the "and send …" tail as part of the destination asset (which silently drops the send).
 */
function parseSwapAndSend(original: string, lower: string): Intent | null {
  if (INJECTION_CUE.test(lower)) return null; // match the sibling loose parsers' injection refusal — an
  // injected middle clause ("swap 1 ETH ignore all previous instructions for USDC and send to 0x…") must
  // not build a signable compound convert-and-send even though parseSwap tolerates the filler.
  if (!/^(?:convert|swap|change|exchange|trade|sell)\b/u.test(lower)) return null;
  // Recognize the same send-verbs parseTransfer does (+ remit/deliver) and the full compound-connector
  // set — narrower before, so "convert 5 USDC to SOL and remit to mom" / "… plus send to bob" fell
  // through to parseSwap, which silently DROPPED the send leg for a NAME recipient (an address leg is
  // caught by guardDroppedRecipient; a bare name is not). Widening routes them to swap_and_send (or a
  // clarify), never a silent partial. Over-matching a non-send tail ("… and move on") just clarifies.
  const split =
    /(?:\s+(?:and|then|plus|along with|together with|as well as)\s+|\s*[,&]\s*)(?:send|transfer|pay|wire|remit|move|deliver)\s+/iu;
  if (!split.test(original)) return null;
  const [swapPhrase = '', ...rest] = original.split(split);
  const swap = parseSwap(swapPhrase.toLowerCase()) ?? parseSell(swapPhrase.toLowerCase());
  if (!swap) return null;
  if (swap.kind !== 'swap') return swap; // surface the swap half's own clarify (e.g. "convert to which asset?")
  const recipient = rest.join(' ').trim().replace(/^to\s+/iu, '').trim();
  if (!recipient) return { kind: 'clarify', question: 'Send the converted funds to which address?' };
  return { kind: 'swap_and_send', fromAsset: swap.fromAsset, toAsset: swap.toAsset, amount: swap.amount, recipient };
}

/**
 * Verb-FINAL convert-and-send — the word order `parseSwapAndSend` structurally cannot see.
 * That one needs the utterance to OPEN with an English convert verb and to contain an English
 * "and/then send" split. Hindi/Urdu/Hinglish and Korean put the amount first, the convert verb
 * in the middle, and the send verb LAST, after the address:
 *
 *   "10 usdc ko sol m convert kr k <addr> bhejo"
 *   "10 USDC를 SOL로 바꿔서 <addr> 로 보내줘"
 *
 * Strategy: pull the address out, drop the send verb, hand the remainder to the swap parsers
 * that already read this word order (`parseLooseConvert`), then re-attach the recipient. Reusing
 * them means no second dialect of convert-parsing to keep in sync.
 */
function parseVerbFinalConvertAndSend(text: string): Intent | null {
  const addr = ADDRESS_ANYWHERE.exec(text);
  if (!addr) return null;
  const lower = text.toLowerCase();
  // Needs BOTH halves stated — a convert cue and a send cue. A bare "<addr> bhejo" is a plain
  // transfer (parseLooseSend's job), and a convert with no send cue must not invent a recipient.
  const hasSend = HI_SEND.test(lower) || KO_SEND.test(text);
  const hasConvert = CONVERT_CUE.test(lower) || KO_CONVERT.test(text);
  if (!hasSend || !hasConvert) return null;
  if (INJECTION_CUE.test(lower)) return null; // same refusal as the other loose parsers

  const swapPhrase = lower.replace(addr[0].toLowerCase(), ' ').replace(HI_SEND, ' ').replace(/\s+/gu, ' ').trim();
  const swap = parseSwap(swapPhrase) ?? parseSell(swapPhrase) ?? parseLooseConvert(swapPhrase);
  if (!swap) return null;
  if (swap.kind !== 'swap') return swap; // surface the swap half's own clarify ("convert to which asset?")
  return { kind: 'swap_and_send', fromAsset: swap.fromAsset, toAsset: swap.toAsset, amount: swap.amount, recipient: addr[0] };
}

/**
 * "convert my BTC to ETH" / "swap 500 USDT for ETH" — and, WITHOUT a connector, the terse
 * "swap 10 USDC ETH" / "convert BTC ETH" where two assets sit adjacent (the last known asset
 * is the destination, the rest is the amount + source). The explicit-connector form is tried
 * first so "swap 10 USDC to ETH" is never mis-split.
 */
function parseSwap(lower: string): Intent | null {
  if (!/^(?:convert|swap|change|exchange|trade)\b/u.test(lower)) return null;
  const verbStripped = lower.replace(/^(?:convert|swap|change|exchange|trade)\s+(?:my |all my )?/u, '');

  // Form 1 — explicit connector: "<amount source> to|into|for <dest>".
  const m = lower.match(/^(?:convert|swap|change|exchange|trade)\s+(?:my |all my )?(.+?)\s+(?:to|into|for)\s+(.+)$/u);
  if (m) {
    const toAsset = detectAsset(m[2] as string);
    if (!toAsset) return { kind: 'clarify', question: `Convert to which asset?` };
    // A destination naming TWO alternatives ("… for USDC or DAI", "… to USDC/DAI") can't be silently
    // resolved to the FIRST — the user named a choice and expects to make it. detectAsset returns only
    // the first hit, so without this the second option is dropped and a confident swap to USDC is signed.
    const destAlts = [
      ...new Set(
        (m[2] as string)
          .split(/\s+or\s+|,\s+|\s*\/\s*/u)
          .map((p) => detectAsset(p))
          .filter((a): a is string => a !== undefined),
      ),
    ];
    if (destAlts.length > 1) {
      return { kind: 'clarify', question: `Convert to which asset — ${destAlts.join(' or ')}?`, options: destAlts };
    }
    // A COMPOUND source ("5 ETH and 3 USDC", "0.1 ETH and 0.2 ETH") must not silently collapse to its
    // FIRST clause — extractAmountAndAsset reads only the first amount+asset, so the rest would vanish
    // from the signed plan. If the source splits on a connector into 2+ clauses that each carry an
    // amount or a known asset, ask which one (mirrors the multi-recipient guard in parseTransfer)
    // rather than converting a partial amount the user never confirmed.
    // Split on " and " or a comma FOLLOWED BY whitespace — a bare "," is a thousands separator ("1,000")
    // and must NOT split a single amount into clauses. detectAsset returns string|undefined (never null),
    // so the second predicate compares against undefined; otherwise it is always-true and every
    // comma-grouped amount would false-clarify.
    const srcClauses = (m[1] as string).split(/\s+and\s+|\s+or\s+|\s+plus\s+|\s+along\s+with\s+|\s+together\s+with\s+|\s+as\s+well\s+as\s+|,\s+|\s*[&+/]\s*/u).filter((c) => c.trim().length > 0);
    // A clause "bears" if it carries an amount+asset, a known asset, OR a bare number ("5 and 3 ETH").
    // The bare-number arm is only reached once a real " and "/", " connector already split the source
    // into 2+ clauses — a single amount ("1,000 USDC") stays ONE clause under the `,\s+` split, so the
    // `length > 1` gate never fires for it and no false-clarify is reintroduced.
    if (srcClauses.length > 1 && srcClauses.filter((c) => extractAmountAndAsset(c) !== null || detectAsset(c) !== undefined || /\d/u.test(c)).length > 1) {
      return { kind: 'clarify', question: 'I can convert one asset at a time — which one would you like to convert?' };
    }
    const parsed = extractAmountAndAsset(m[1] as string);
    const fromAsset = parsed?.asset ?? detectAsset(m[1] as string);
    if (!fromAsset) return { kind: 'clarify', question: 'Convert from which asset?' };
    const amount = parsed?.amount ?? { kind: 'all' as const };
    return { kind: 'swap', fromAsset, toAsset, amount };
  }

  // Form 2 — no connector: the LAST token is the destination asset, the rest holds amount + source.
  const toks = verbStripped.split(/\s+/u).filter(Boolean);
  if (toks.length >= 2) {
    const toAsset = detectAsset(toks[toks.length - 1] as string);
    const rest = toks.slice(0, -1).join(' ');
    if (toAsset) {
      const parsed = extractAmountAndAsset(rest);
      const fromAsset = parsed?.asset ?? detectAsset(rest);
      if (fromAsset && fromAsset !== toAsset) {
        const amount = parsed?.amount ?? { kind: 'all' as const };
        return { kind: 'swap', fromAsset, toAsset, amount };
      }
    }
  }

  // Form 3 — the shape is a swap of ONE known asset with NO destination ("swap 100 usdc",
  // "convert my BTC"). Nothing is missing from the parser's understanding, only from the message,
  // so ASK. Returning null here surfaced the useless "I couldn't understand that" instead — and no
  // LLM could recover a destination the user never typed.
  const only = detectAsset(verbStripped);
  if (only) {
    return {
      kind: 'clarify',
      question: `Convert your ${only} to which asset?`,
      options: SWAP_TARGETS.filter((t) => t !== only),
    };
  }
  return null;
}

/** Common destinations offered when a convert names a source but no target. */
const SWAP_TARGETS = ['ETH', 'USDC', 'BTC', 'SOL'];

/**
 * "sell 5 ETH for USDC" → swap; bare "sell 5 ETH" cashes out to USDC (the common intent).
 * "sell my ETH" sells the whole balance. Kept separate from parseSwap so the cash-out default
 * only applies to the explicit "sell" verb, never to "convert/swap".
 */
function parseSell(lower: string): Intent | null {
  const m = lower.match(/^sell\s+(?:my |all my )?(.+?)(?:\s+(?:for|to|into)\s+(.+))?$/u);
  if (!m) return null;
  if (hasMultipleBearingClauses(m[1] as string)) return { kind: 'clarify', question: 'I can sell one asset at a time — which would you like to sell?' };
  const parsed = extractAmountAndAsset(m[1] as string);
  const fromAsset = parsed?.asset ?? detectAsset(m[1] as string);
  if (!fromAsset) return { kind: 'clarify', question: 'Sell which asset?' };
  const toAsset = m[2] ? detectAsset(m[2] as string) : 'USDC'; // bare "sell X" → cash out to USDC
  if (!toAsset) return { kind: 'clarify', question: 'Sell for which asset?' };
  if (toAsset === fromAsset) return { kind: 'clarify', question: 'Sell for which asset?' };
  const amount = parsed?.amount ?? { kind: 'all' as const };
  return { kind: 'swap', fromAsset, toAsset, amount };
}

/** Conversion cue words — English verbs + common Hinglish forms (badlo/krdo/kardo/bana do). */
const CONVERT_CUE = /\b(convert|swap|exchange|change|badlo|badal|krdo|kardo|kar\s?do|bana\s?do|banao|banado)\b/u;
/** Korean verb-at-end cues (no \b — CJK has no word boundaries). Assets stay Latin (BTC/USDC). */
const KO_CONVERT = /바꿔|바꾸|바까|교환|전환|스왑|컨버트|체인지/u;
const KO_SEND = /보내|전송|송금|부쳐|송신/u;
// Transliteration varies a lot for this verb — Hindi भेजो reaches the keyboard as bhejo / vejo /
// bejo / bhejdo. Missing a spelling means the send half of an intent goes unread, so cover them.
const HI_SEND = /\b(bhejo|bhej\s?do|bhejdo|bheji|bhej|bhijwao|bhijwa\s?do|vejo|vej\s?do|vejdo|vej|bejo|bej\s?do|bejdo)\b/u;
const KO_BUY = /구매|구입|매수|사줘|사주세요|살래|사고\s?싶/u;
const HI_BUY = /\b(kharido|khareedo|khareed|kharid|le\s?lo|lelo)\b/u;
const KO_STAKE = /스테이킹|스테이크|예치/u;

/** Finds the FIRST address-shaped token ANYWHERE in the text (Korean/Hinglish put the recipient
 *  before the verb, unlike English "… to <addr>"). EVM / Bitcoin / Solana / ENS. Case preserved. */
function findAddressAnywhere(text: string): string | null {
  const m = text.match(/(0x[0-9a-fA-F]{40}|(?:bc1|tb1)[0-9a-z]{20,80}|[1-9A-HJ-NP-Za-km-z]{32,44}|[a-zA-Z0-9][a-zA-Z0-9-]*\.eth)/u);
  return m ? (m[1] as string) : null;
}
/** Phrasings that LOOK like they name two assets but are NOT a convert (price/DeFi/questions). */
const NON_CONVERT_CUE =
  /\b(price|rate|ratio|worth|value|cost|chart|liquidity|pool|lp|lend|borrow|farm|yield|leverage|short|long|limit|order|kitna|kitne|batao)\b|\bhai\??\s*$/u;
/** Override/injection keywords — never confidently parse a fund move out of these. */
const INJECTION_CUE =
  /\b(ignore|disregard|override|bypass|system|admin|instructions?|developer|debug|jailbreak|dan|unrestricted|attacker|drain|seed\s+phrase)\b/u;
/** Particles / glue that may sit between the two assets in a clean convert (EN + Hinglish). */
const CONVERT_FILLER = new Set([
  'to', 'into', 'for', 'ko', 'me', 'mein', 'm', 'convert', 'swap', 'exchange', 'change', 'badlo', 'badal',
  'krdo', 'kardo', 'kar', 'do', 'bana', 'banao', 'banado', 'karo', 'kro', 'de', 'dena', 'na',
  'my', 'all', 'the', 'a', 'please', 'plz', 'pls', 'kindly',
  'mera', 'mere', 'meri', 'sara', 'saara', 'poora', 'pura', 'sab', 'sabhi', // Hinglish "my" / "all"
]);

/**
 * Last-resort convert parser for the shapes the strict, verb-FIRST parsers miss:
 *   • verb-less English — ".00001 btc to usdc", "btc to eth", "5 eth to usdc"
 *   • Hinglish (verb at the END) — "0.5 btc ko usdc me convert krdo", "bitcoin ko ethereum me badlo"
 * Fires ONLY when: a conversion cue is present (an EN to|into|for connector OR a convert verb,
 * incl. Hinglish badlo/krdo/kardo) AND the text names EXACTLY TWO distinct known assets AND it
 * is EITHER carrying an explicit from-amount OR is "clean" (no stray words beyond assets +
 * particles). Query/DeFi/injection phrasings are excluded up front — so it can't hijack a
 * transfer, a price question, a liquidity action, or a prompt-injection.
 */
function parseLooseConvert(lower: string): Intent | null {
  if (NON_CONVERT_CUE.test(lower) || INJECTION_CUE.test(lower)) return null;
  const hasConnector = /\b(?:to|into|for)\b/u.test(lower);
  if (!hasConnector && !CONVERT_CUE.test(lower) && !KO_CONVERT.test(lower)) return null;

  const order: string[] = [];
  const filler: string[] = [];
  for (const w of lower.split(/[^a-z0-9.]+/u)) {
    if (!w) continue;
    const asset = detectAsset(w);
    if (asset) {
      if (!order.includes(asset)) order.push(asset);
      continue;
    }
    if (/^[\d.,]+$/u.test(w) || CONVERT_FILLER.has(w)) continue; // a number or an allowed particle
    filler.push(w); // a stray word → the utterance isn't a clean two-asset convert
  }
  if (order.length !== 2) return null; // need exactly a FROM and a TO
  const [fromAsset, toAsset] = order as [string, string];

  const parsed = extractAmountAndAsset(lower);
  const explicit = parsed !== null && parsed.asset === fromAsset ? parsed : null;
  if (!explicit && filler.length > 0) return null; // vague + wordy → defer to the LLM
  const amount = explicit ? explicit.amount : ({ kind: 'all' } as const);
  return { kind: 'swap', fromAsset, toAsset, amount };
}

/**
 * Korean / Hinglish SEND (verb at the end): "0x…에게 0.5 ETH 보내줘", "0.5 ETH 0x… ko bhejo".
 * Requires a Korean/Hinglish send cue (English "send" is parseTransfer's job, anchored to the
 * start — so an injection's mid-sentence "send" can't leak here) AND an UNAMBIGUOUS address
 * recipient (a bare name is ambiguous → defer). The address is stripped before amount parsing.
 */
function parseLooseSend(original: string, lower: string): Intent | null {
  // English "send" is parseTransfer's job when it LEADS the sentence. It reaches here only when the
  // address came first ("0x… send 0.5 ETH") — an ordinary copy-paste order that must still work.
  const englishSendAfterAddress = /^\s*(?:0x[0-9a-fA-F]{40}|(?:bc1|tb1)[0-9a-z]{20,80}|[1-9A-HJ-NP-Za-km-z]{32,44}|[a-zA-Z0-9][a-zA-Z0-9-]*\.eth)\b/u.test(original.trim()) && /\b(?:send|transfer|pay|wire)\b/u.test(lower);
  if (!KO_SEND.test(original) && !HI_SEND.test(lower) && !englishSendAfterAddress) return null;
  if (INJECTION_CUE.test(lower)) return null;
  const recipient = findAddressAnywhere(original);
  if (!recipient) return null; // no address → ambiguous recipient → let the LLM handle it
  const body = lower.replace(recipient.toLowerCase(), ' ');
  if (hasMultipleBearingClauses(body)) return { kind: 'clarify', question: 'I can send one asset at a time — which would you like to send?' };
  const parsed = extractAmountAndAsset(body);
  if (!parsed) return { kind: 'clarify', question: 'How much do you want to send?' };
  if (!parsed.asset) return { kind: 'clarify', question: 'Which asset do you want to send?' };
  return { kind: 'transfer', asset: parsed.asset, amount: parsed.amount, recipient };
}

/** Korean / Hinglish BUY (verb at the end): "1 ETH 구매", "5 SOL kharido", "$50 어치 SOL 사줘". */
function parseLooseBuy(lower: string): Intent | null {
  if (!KO_BUY.test(lower) && !HI_BUY.test(lower)) return null;
  if (INJECTION_CUE.test(lower)) return null;
  if (hasMultipleBearingClauses(lower)) return { kind: 'clarify', question: 'I can buy one asset at a time — which would you like to buy?' };
  const parsed = extractAmountAndAsset(lower);
  const asset = parsed?.asset ?? detectAsset(lower);
  if (!asset) return { kind: 'clarify', question: 'Which asset do you want to buy?' };
  if (!parsed) return { kind: 'clarify', question: 'How much do you want to buy?' };
  return { kind: 'buy', asset, amount: parsed.amount };
}

/** Korean STAKE (verb at the end): "10 SOL 스테이킹", "ETH 예치". */
function parseLooseStake(lower: string): Intent | null {
  if (!KO_STAKE.test(lower)) return null;
  if (INJECTION_CUE.test(lower)) return null; // match the sibling loose parsers' injection refusal
  if (hasMultipleBearingClauses(lower)) return { kind: 'clarify', question: 'I can stake one asset at a time — which would you like to stake?' };
  const parsed = extractAmountAndAsset(lower);
  const asset = parsed?.asset ?? detectAsset(lower);
  if (!asset) return { kind: 'clarify', question: 'Which asset do you want to stake?' };
  return { kind: 'stake', asset, amount: parsed?.amount ?? { kind: 'all' } };
}

/** "buy $50 of SOL" / "buy 2 ETH" / "buy ₹50,000 of SOL" */
function parseBuy(lower: string): Intent | null {
  const m = lower.match(/^buy\s+(.+)$/u);
  if (!m) return null;
  if (hasMultipleBearingClauses(m[1] as string)) return { kind: 'clarify', question: 'I can buy one asset at a time — which would you like to buy?' };
  const parsed = extractAmountAndAsset(m[1] as string);
  const asset = parsed?.asset ?? detectAsset(m[1] as string);
  if (!asset) return { kind: 'clarify', question: 'Which asset do you want to buy?' };
  if (!parsed) return { kind: 'clarify', question: 'How much do you want to buy?' };
  return { kind: 'buy', asset, amount: parsed.amount };
}

/** "move everything to stables" / "convert all my assets into USDC" */
function parseRebalance(lower: string): Intent | null {
  if (!/\b(move|convert|shift|put)\b/u.test(lower) || !/\b(everything|all)\b/u.test(lower) || !STABLE.test(lower)) {
    return null;
  }
  // A rebalance is PORTFOLIO-wide. "convert all my ETH for USDC" names a specific source asset, so
  // it is a single swap of that one holding — routing it here would build a multi-asset plan the
  // user never asked for. Only scope words ("everything", "all my assets/holdings") rebalance.
  const scoped = /\ball\s+(?:my\s+|the\s+)?([a-z]{2,10})\b/u.exec(lower);
  if (scoped && detectAsset(scoped[1] as string)) return null;
  return { kind: 'rebalance', target: 'stables' };
}

/** "stake 5 SOL" / "stake my ETH" (vague "stake my idle assets" → clarify) */
function parseStake(lower: string): Intent | null {
  const m = lower.match(/^stake\s+(.+)$/u);
  if (!m) return null;
  if (hasMultipleBearingClauses(m[1] as string)) return { kind: 'clarify', question: 'I can stake one asset at a time — which would you like to stake?' };
  const parsed = extractAmountAndAsset(m[1] as string);
  const asset = parsed?.asset ?? detectAsset(m[1] as string);
  if (!asset) return { kind: 'clarify', question: 'Which asset do you want to stake?' };
  return { kind: 'stake', asset, amount: parsed?.amount ?? { kind: 'all' } };
}

/** "buy $50 of ETH every Monday" / "buy 0.1 ETH every week" */
function parseRecurring(lower: string): Intent | null {
  // An UNSUPPORTED cadence ("every 2 weeks", "every other day", "biweekly", "fortnightly") must be
  // recognized so it CLARIFIES — otherwise it falls through to parseBuy/Swap/Transfer, which parse the
  // base action as an immediate ONE-OFF and drop the schedule, spending the money NOW instead of arming
  // a recurring plan the user asked to defer.
  if (/\bevery\s+(?:\d|other\b|few\b|couple\b)|\bbi-?weekly\b|\bfortnight/u.test(lower)) {
    return { kind: 'clarify', question: 'I can schedule daily, weekly, or monthly — which of those would you like?' };
  }
  // Accept the "every <period/weekday>" form AND the adverb forms daily/weekly/monthly.
  const every = lower.match(/\bevery\s+(day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/u);
  const adverb = lower.match(/\b(daily|weekly|monthly)\b/u);
  const period = every
    ? (every[1] as string)
    : adverb
      ? (({ daily: 'day', weekly: 'week', monthly: 'month' } as Record<string, string>)[adverb[1] as string] as string)
      : null;
  if (!period) return null;
  const base = lower.replace(/\bevery\s+\S+\b/u, '').replace(/\b(?:daily|weekly|monthly)\b/u, '').trim();
  const inner = parseBuy(base) ?? parseSwap(base) ?? parseTransfer(base, base);
  if (!inner || (inner.kind !== 'buy' && inner.kind !== 'swap' && inner.kind !== 'transfer')) {
    return { kind: 'clarify', question: 'What would you like to do on a schedule?' };
  }
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(period);
  const schedule =
    dow >= 0 ? ({ every: 'week', on: dow } as const) : ({ every: period as 'day' | 'week' | 'month' } as const);
  return { kind: 'recurring', schedule, inner };
}

/** "exit everything if bitcoin drops 15%" / "sell all if BTC falls 20%" */
function parseEmergencyExit(lower: string): Intent | null {
  const m = lower.match(
    /\bif\s+(bitcoin|btc|ethereum|eth|solana|sol)\s+(drops|falls|rises|jumps|gains)\s+(\d+(?:\.\d+)?)\s*%/u,
  );
  if (!m || !/\b(exit|sell|move|convert)\b/u.test(lower)) return null;
  // Only a PORTFOLIO-WIDE conditional is an emergency exit. "sell 1 ETH if BTC drops 10%" names a
  // specific amount — a conditional SINGLE-asset order, not a whole-wallet liquidation. Treating it as
  // emergency_exit drops the amount and blows the scope up to everything; but returning null instead
  // lets parseSell/parseSwap below parse the base action as an IMMEDIATE trade, dropping the "if …%"
  // condition and spending now. So CLARIFY (short-circuits the parser chain) — the wallet can't arm a
  // price-triggered order yet. (The trigger asset is also restricted to known symbols now — the old
  // [a-z]{2,5} catch-all matched any word.)
  const beforeIf = lower.slice(0, Math.max(0, lower.search(/\bif\b/u))); // the STANDALONE "if", not the "if" inside "verify"
  const scopeWide = /\b(everything|all|entire|whole|portfolio|positions?|holdings?)\b/u.test(beforeIf);
  const hasAmount = /\d/u.test(beforeIf) || /\bhalf\b/u.test(beforeIf);
  if (!scopeWide && hasAmount) {
    return { kind: 'clarify', question: 'I cannot arm a price-triggered order yet — should I make that trade now instead?' };
  }
  const assetWord = (m[1] as string).toUpperCase();
  const asset = { BITCOIN: 'BTC', ETHEREUM: 'ETH', SOLANA: 'SOL' }[assetWord] ?? assetWord;
  const direction = /drops|falls/u.test(m[2] as string) ? 'drops' : 'rises';
  return {
    kind: 'emergency_exit',
    trigger: { asset, direction, percent: Number(m[3]) },
    target: 'stables',
  };
}

/**
 * Read-only WALLET questions → query (answered without a plan or confirmation).
 * Requires both a question opener AND a wallet noun, so general questions
 * ("what is the meaning of life") defer to the LLM rather than being mis-claimed.
 */
function parseQuery(lower: string): Intent | null {
  const asksQuestion = /^(what|how much|how many|show|list|do i|what's|whats)\b/u.test(lower);
  const aboutWallet = /\b(balance|balances|holding|holdings|portfolio|worth|assets?|own|have|coins?|tokens?)\b/u.test(
    lower,
  );
  if (asksQuestion && aboutWallet) return { kind: 'query', question: lower };
  return null;
}
