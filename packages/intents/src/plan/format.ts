/** Display formatting for plans — thin wrappers over the shared helpers. */
import { formatUsd } from '@intent-wallet/portfolio';
export { baseToDecimal } from '../amount.js';

/** Formats a micro-USD fee for the confirmation line. */
export function formatMicrosOrDash(micros: bigint): string {
  return formatUsd(micros);
}
