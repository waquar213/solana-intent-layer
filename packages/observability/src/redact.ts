/**
 * Secret redaction for logs. The non-negotiable rule (handbook 01 §3): no key
 * material, password, token, or seed is ever serialized to a log line.
 *
 * We redact by KEY NAME (deny-list of sensitive substrings) recursively, and
 * cap depth/breadth so a hostile or cyclic object can't blow up the logger.
 */
const SENSITIVE_KEY =
  /(password|passphrase|mnemonic|seed|secret|private[_-]?key|privatekey|api[_-]?key|apikey|authorization|token|cookie|signature|jwt)/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (seen.has(value as object)) return '[CIRCULAR]';
  // `seen` tracks the current ANCESTOR PATH (root → here), not every node ever visited. Only a node
  // reachable from ITSELF is a real cycle; a node referenced by two sibling branches (a DAG / diamond,
  // e.g. the same context object logged under two keys) is acyclic and must serialize normally. We add
  // before recursing and DELETE in `finally` after the subtree completes — without the delete, the
  // shared set mislabels the 2nd (and later) sibling occurrence as '[CIRCULAR]' and drops real fields.
  // The MAX_DEPTH cap (not `seen`) is what bounds work, so re-visiting a shared node can't blow up.
  seen.add(value as object);
  try {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, ...extractErrorFields(value) };
    }
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((v) => redact(v, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
}

/** Pulls stable, safe extra fields off a custom error (e.g. `code`) without leaking a stack by default. */
function extractErrorFields(err: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of ['code', 'statusCode'] as const) {
    const v = (err as unknown as Record<string, unknown>)[key];
    if (v !== undefined) fields[key] = v;
  }
  return fields;
}
