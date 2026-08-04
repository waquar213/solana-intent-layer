/**
 * The parser boundary. `CompositeParser` runs the deterministic fast-path first,
 * then defers to an injected `LlmClient` (the AI Gateway) whose output is
 * VALIDATED against `IntentSchema` before it is trusted — schema-forced tool
 * use. If the LLM is absent or its output never validates, the parser degrades
 * to a `clarify` intent (the forms fallback), never a guess (ADR-0013/0014).
 *
 * Security: the input string is DATA, passed to the LLM as content, never as
 * instructions; the model can only ever return an `Intent` shape (no
 * fund-moving tools are exposed to it), and nothing here executes — the parser
 * PROPOSES; the planner + device signature DISPOSE.
 */
import { IntentSchema, type Intent } from '../schema.js';
import { parseDeterministic } from './deterministic.js';

/** Minimal, non-sensitive context the LLM may use (never keys, never full addresses). */
export interface ParseContext {
  /** Asset symbols the user holds — helps disambiguate ("my BTC"). */
  heldSymbols?: string[];
  /** Contact names only (no addresses) — helps resolve recipients. */
  contactNames?: string[];
  locale?: string;
}

/** The AI Gateway boundary. Returns raw JSON to be validated — it is never trusted unchecked. */
export interface LlmClient {
  parseIntent(input: string, context: ParseContext): Promise<unknown>;
}

export interface IntentParser {
  parse(input: string, context?: ParseContext): Promise<Intent>;
}

export interface CompositeParserOptions {
  llm?: LlmClient;
  /** How many times to retry the LLM when its output fails schema validation. Default 1. */
  llmRetries?: number;
}

export class CompositeParser implements IntentParser {
  readonly #llm: LlmClient | undefined;
  readonly #retries: number;

  constructor(options: CompositeParserOptions = {}) {
    this.#llm = options.llm;
    this.#retries = options.llmRetries ?? 1;
  }

  async parse(input: string, context: ParseContext = {}): Promise<Intent> {
    const text = input.trim();
    if (text.length === 0) return { kind: 'clarify', question: 'What would you like to do?' };

    // 1. Deterministic fast-path (free, instant).
    const fast = parseDeterministic(text);
    if (fast) return fast;

    // 2. LLM fallback (schema-validated). No LLM → forms fallback.
    if (!this.#llm) {
      return { kind: 'clarify', question: "I couldn't understand that. Try: Send, Convert, or Buy." };
    }
    for (let attempt = 0; attempt <= this.#retries; attempt++) {
      let raw: unknown;
      try {
        raw = await this.#llm.parseIntent(text, context);
      } catch {
        break; // LLM error → degrade to clarify
      }
      const parsed = IntentSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    }
    return { kind: 'clarify', question: "I didn't quite get that — could you rephrase?" };
  }
}
