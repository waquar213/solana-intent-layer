export type CopilotErrorCode =
  | 'UNKNOWN_TOOL'
  | 'TOOL_SCOPE_VIOLATION'
  | 'RESPONSE_UNVERIFIED'
  | 'EXPLANATION_UNGROUNDED'
  | 'POLICY_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'BUDGET_EXCEEDED';

/** Errors raised by the AI Financial Copilot. */
export class CopilotError extends Error {
  readonly code: CopilotErrorCode;
  constructor(code: CopilotErrorCode, message: string) {
    super(message);
    this.name = 'CopilotError';
    this.code = code;
  }
}
