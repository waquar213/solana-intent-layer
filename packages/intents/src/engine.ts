/**
 * IntentEngine — the public entry point. One call: natural language →
 * (parsed Intent, PlanOutcome). It wires the parser (deterministic → LLM) to the
 * planner (resolve → safety → ExecutionPlan). This is the orchestration layer
 * every future wallet capability routes through; it PROPOSES a plan and never
 * executes — execution needs this plan plus a device signature downstream.
 */
import { ACTIONABLE_KINDS, type Intent } from './schema.js';
import type { IntentParser, ParseContext } from './parse/parser.js';
import { canonicalizeText, looksObfuscated } from './parse/deterministic.js';
import { planIntent, type PlanOutcome } from './plan/planner.js';
import type { EngineContext } from './plan/context.js';

export interface EngineResult {
  intent: Intent;
  outcome: PlanOutcome;
}

/**
 * Intent kinds that MOVE or COMMIT funds — an injection must never silently reach one. DERIVED from
 * ACTIONABLE_KINDS (the canonical planner list, which includes `swap_and_send`) plus the two automation
 * kinds, so the veto set can never silently drift OUT of sync with what the planner will actually build
 * a signable plan for. (A hand-maintained list here previously omitted `swap_and_send`, leaving the one
 * compound convert-and-send kind exempt from the injection veto.)
 */
const FUND_MOVING = new Set<Intent['kind']>([...ACTIONABLE_KINDS, 'recurring', 'emergency_exit']);

/**
 * Prompt-injection markers. The deterministic parser already DEFERS on these (proven by the
 * golden set), but a permissive LLM fallback can be talked into a confident fund move — so the
 * engine re-checks the RAW input over WHICHEVER parser produced the intent. This is the
 * "AI proposes, deterministic code verifies" doctrine applied to the LLM itself: the model may
 * suggest a transfer, but deterministic code vetoes it when the input smells of injection.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|these)/iu,
  /disregard\s+(?:all\s+|the\s+|your\s+)?(?:previous|prior|instructions?|rules?|limits?|safety|checks?)/iu,
  /forget\s+(?:your\s+|all\s+|the\s+|everything)/iu,
  /(?:ignore|bypass|disable)\s+(?:all\s+|the\s+|your\s+)?(?:safety|risk|limits?|rules?|checks?|restrictions?|guard\s?rails?)/iu,
  /(?:override|bypass)\s+(?:all\s+|the\s+|your\s+)?(?:safety|limits?|rules?|checks?|restrictions?|instructions?)/iu,
  /\byou are now\b/iu,
  /\bsystem prompt\b/iu,
  /\bnew (?:rule|instruction)s?\b/iu,
  /\bDAN\b/u,
  /drain (?:the|my|this) wallet/iu,
];

/** Does the raw utterance carry a prompt-injection marker? Deterministic, pure. Canonicalize FIRST (NFKC
 *  + strip invisibles) with the SAME pre-pass the parser uses, so a zero-width char spliced into a cue
 *  word ("ig<U+200B>nore previous instructions") can't split the pattern here while also evading the
 *  parser's gate — both layers must fail closed together. */
export function looksLikeInjection(input: string): boolean {
  // Obfuscation markers (a zero-width char that could GLUE two cue words, or a mixed-script homoglyph
  // OUTSIDE the fold map) are themselves an injection signal — the strip+fold can't fully un-hide a cue
  // at every position, so detect the marker directly. A legit fund command is single-script ASCII.
  if (looksObfuscated(input)) return true;
  const canon = canonicalizeText(input);
  return INJECTION_PATTERNS.some((re) => re.test(canon));
}

export class IntentEngine {
  readonly #parser: IntentParser;
  readonly #ctx: EngineContext;

  constructor(parser: IntentParser, ctx: EngineContext) {
    this.#parser = parser;
    this.#ctx = ctx;
  }

  /** Parse + plan a natural-language request into an actionable outcome. */
  async handle(input: string, parseContext?: ParseContext): Promise<EngineResult> {
    const intent = await this.#parser.parse(input, parseContext ?? {});
    // Deterministic veto: an injection-tagged input must NEVER resolve to a silent fund move,
    // regardless of which parser (deterministic OR the LLM fallback) produced the intent. Force
    // a clarify so nothing signable is ever built from adversarial text.
    if (FUND_MOVING.has(intent.kind) && looksLikeInjection(input)) {
      return {
        intent,
        outcome: {
          kind: 'clarify',
          question:
            "That message looks like it contains instructions I shouldn't act on, so I won't move funds from it. If you do want to send, tell me plainly — e.g. \"send 0.1 ETH to 0x…\".",
        },
      };
    }
    const outcome = await planIntent(intent, this.#ctx);
    return { intent, outcome };
  }
}
