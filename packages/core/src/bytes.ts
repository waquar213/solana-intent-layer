/**
 * Byte helpers. Re-exports the audited implementations from @noble/hashes
 * so the rest of the codebase has exactly one import site for these.
 */
export { bytesToHex, hexToBytes, concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Best-effort zeroization of secret buffers.
 *
 * Limitation (documented, not hidden): JavaScript engines may have copied the
 * bytes during GC or JIT; this cannot be prevented from JS. Native secure
 * memory (iOS Secure Enclave / Android StrongBox) is layered on top in the
 * mobile apps (Phase 8). Zeroizing still shrinks the window in which secrets
 * are recoverable from a heap dump, so we do it everywhere consistently.
 */
export function zeroize(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const b of buffers) b?.fill(0);
}

/** Constant-time byte comparison (length leak is acceptable — lengths are public). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
