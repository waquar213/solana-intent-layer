/**
 * @intent-wallet/observability — logging, errors, and problem+json for the
 * whole platform. Imported by every service; the one package domain code is
 * allowed to depend on for cross-cutting concerns (handbook 02 §1).
 */
export {
  createLogger,
  nullLogger,
  LOG_LEVELS,
  type Logger,
  type LogLevel,
  type LogFields,
  type LoggerOptions,
} from './logger.js';
export { redact } from './redact.js';
export {
  AppError,
  isAppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  tooManyRequests,
  conflict,
  validationFailed,
  type AppErrorCode,
  type AppErrorOptions,
} from './errors.js';
export { toProblem, toAppError, type ProblemDetails, type ToProblemOptions } from './problem.js';
