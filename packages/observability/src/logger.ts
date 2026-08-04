/**
 * Structured JSON logger. Zero-dependency and deliberately small: it emits one
 * JSON object per line (machine-parseable by Loki), merges bound context
 * (requestId, correlationId, service), redacts secrets, and serializes errors
 * safely. It can be swapped for pino later behind this same interface without
 * touching call sites — which is the point of routing all logging through here
 * (handbook 02 §4: `console.*` is banned in shipped code).
 */
import { redact } from './redact.js';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a new logger that merges `context` into every line (e.g. per-request). */
  child(context: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  service?: string;
  /** Injectable sink (default stdout) and clock — makes the logger testable. */
  sink?: (line: string) => void;
  now?: () => string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = LEVEL_WEIGHT[options.level ?? 'info'];
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date().toISOString());
  const base: LogFields = options.service ? { service: options.service } : {};

  function emit(level: LogLevel, context: LogFields, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const record = {
      level,
      time: now(),
      msg: message,
      ...(redact({ ...context, ...fields }) as LogFields),
    };
    sink(JSON.stringify(record));
  }

  function build(context: LogFields): Logger {
    return {
      debug: (m, f) => emit('debug', context, m, f),
      info: (m, f) => emit('info', context, m, f),
      warn: (m, f) => emit('warn', context, m, f),
      error: (m, f) => emit('error', context, m, f),
      child: (ctx) => build({ ...context, ...ctx }),
    };
  }

  return build(base);
}

/** A no-op logger for tests/contexts that must not produce output. */
export const nullLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return nullLogger;
  },
};
