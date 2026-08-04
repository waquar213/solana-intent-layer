/// <reference types="vite/client" />

/**
 * Optional RPC/endpoint overrides. Set these in a gitignored `.env.local` to
 * point the wallet at your own (keyed) nodes; each falls back to a public
 * keyless default when unset. NOTE: any `VITE_*` value is inlined into the
 * client bundle and thus visible in the browser — fine for testnet keys, but a
 * production deployment should proxy keyed mainnet RPC through a backend.
 */
interface ImportMetaEnv {
  readonly VITE_SOLANA_DEVNET_RPC?: string;
  readonly VITE_SOLANA_MAINNET_RPC?: string;
  readonly VITE_SEPOLIA_RPC?: string;
  readonly VITE_ETH_MAINNET_RPC?: string;
  readonly VITE_BTC_TESTNET_REST?: string;
  readonly VITE_BTC_MAINNET_REST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
