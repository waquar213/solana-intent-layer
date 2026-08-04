import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (rel: string) => fileURLToPath(new URL(`../../packages/${rel}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
  resolve: {
    alias: {
      '@intent-wallet/identity': pkg('identity'),
      '@intent-wallet/portfolio': pkg('portfolio'),
      '@intent-wallet/core': pkg('core'),
    },
  },
});
