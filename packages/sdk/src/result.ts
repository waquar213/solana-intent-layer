/**
 * An optional non-throwing surface for callers who prefer typed results over
 * try/catch. `toResult` catches an `ApiError` into `{ ok: false, error }`; any
 * non-ApiError (a genuine programmer bug) still throws — we only swallow the errors
 * the SDK itself defines.
 */
import { ApiError, isApiError } from './errors.js';

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export async function toResult<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    if (isApiError(err)) return { ok: false, error: err };
    throw err;
  }
}
