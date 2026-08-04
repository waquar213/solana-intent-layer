/**
 * The LLM boundary. The model is handed only a system prompt, the tool schemas,
 * and messages, and returns either tool calls or final prose (+ the fact ids it
 * cites). The user's utterance is ALWAYS a `user` message, never concatenated
 * into the system prompt — that is the prompt-injection defense. A real Claude
 * client and the deterministic `ScriptedLlmClient` both implement this one
 * interface; the whole orchestrator is testable with the fake.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResultMsg {
  toolCallId: string;
  result: unknown;
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; results: ToolResultMsg[] };

export interface LlmToolSchema {
  name: string;
  description: string;
}

export interface LlmTurn {
  toolCalls?: ToolCall[];
  finalText?: string;
  /** The fact ids (and values) the model claims to cite — verified downstream. */
  citations?: Array<{ factId: string; value: number | string }>;
}

export interface CopilotLlmClient {
  next(messages: LlmMessage[], tools: readonly LlmToolSchema[]): Promise<LlmTurn>;
}

/**
 * Deterministic LLM stand-in: replays a scripted sequence of turns keyed by the
 * latest user utterance. Each `next` advances that utterance's cursor. Used in
 * tests and anywhere a real model is not wired.
 */
export class ScriptedLlmClient implements CopilotLlmClient {
  private readonly cursor = new Map<string, number>();
  constructor(
    private readonly scripts: Record<string, LlmTurn[]>,
    private readonly fallback: LlmTurn = { finalText: '' },
  ) {}

  next(messages: LlmMessage[]): Promise<LlmTurn> {
    const lastUser = [...messages].reverse().find((m): m is { role: 'user'; content: string } => m.role === 'user');
    const key = lastUser?.content ?? '';
    const script = this.scripts[key];
    if (!script) return Promise.resolve(this.fallback);
    const i = this.cursor.get(key) ?? 0;
    this.cursor.set(key, i + 1);
    return Promise.resolve(script[i] ?? this.fallback);
  }
}
