import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web client runs on :5173 and proxies /v1 → the Intent API on :8080, so the
// browser makes same-origin calls (no CORS) and the API needs no dev-only CORS surface.
// It consumes @intent-wallet/sdk from source (aliased) so there's no build step to
// dogfood the SDK and the shared wire types can never drift.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@intent-wallet/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
      '@intent-wallet/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@intent-wallet/chains': fileURLToPath(new URL('../../packages/chains/src/index.ts', import.meta.url)),
      '@intent-wallet/intents': fileURLToPath(new URL('../../packages/intents/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Launch preview assigns a free port via PORT when 5173 is taken by another session.
    port: Number(process.env.PORT) || 5173,
    // Baseline hardening headers (HMR-safe: they don't restrict scripts). `frame-ancestors
    // 'none'` blocks clickjacking of the Send/Confirm buttons. NOTE: a wallet must ALSO ship
    // a full strict CSP (script-src 'self'; connect-src <rpc/explorer hosts>; …) at the
    // PRODUCTION host — that can't live here because a strict script-src breaks Vite HMR.
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    },
    proxy: {
      '/v1': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});
