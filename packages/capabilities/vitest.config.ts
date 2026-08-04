import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
  resolve: {
    alias: {
      '@intent-wallet/capabilities': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
});
