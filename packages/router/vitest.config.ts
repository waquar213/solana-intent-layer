import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (rel: string) => fileURLToPath(new URL(`../../packages/${rel}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
  resolve: {
    alias: { '@intent-wallet/providers': pkg('providers') },
  },
});
