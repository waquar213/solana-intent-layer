import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Resolve workspace packages to their source so tests need no prior build step. */
const pkg = (rel: string) => fileURLToPath(new URL(`../../packages/${rel}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
  resolve: {
    alias: {
      '@intent-wallet/config': pkg('config'),
      '@intent-wallet/observability': pkg('observability'),
      '@intent-wallet/events': pkg('events'),
      // The composition root + its full transitive engine graph (resolved to source).
      '@intent-wallet/runtime': pkg('runtime'),
      '@intent-wallet/intents': pkg('intents'),
      '@intent-wallet/risk': pkg('risk'),
      '@intent-wallet/identity': pkg('identity'),
      '@intent-wallet/portfolio': pkg('portfolio'),
      '@intent-wallet/execution': pkg('execution'),
      '@intent-wallet/chains': pkg('chains'),
      '@intent-wallet/policy': pkg('policy'),
      '@intent-wallet/gas': pkg('gas'),
      '@intent-wallet/capabilities': pkg('capabilities'),
      '@intent-wallet/core': pkg('core'),
    },
  },
});
