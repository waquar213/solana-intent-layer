// Flat ESLint config (handbook 01 §3, 04 §3). Fast, non-type-checked base so it
// stays green and quick; the strict TS compiler (tsconfig.base.json) already
// carries the heavy type safety. Type-aware rules (e.g. no-floating-promises)
// can be layered later on a dedicated CI job.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // apps/web (Vite) and apps/mobile (Expo/React Native) are frontends with their own
  // toolchains — kept out of the strict, Node-oriented backend lint (no React plugin /
  // browser globals configured here). apps/mobile is also outside the pnpm workspace.
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.d.ts', 'apps/web/**', 'apps/mobile/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // `any` defeats our strict-typing posture; use `unknown` + narrowing.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // All logging goes through @intent-wallet/observability, never console.
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  // Tests may use `any` for terse assertions on dynamic shapes.
  {
    files: ['**/test/**', '**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  // Tooling scripts and config files are allowed to use console and are plain JS.
  {
    files: ['scripts/**', '**/*.mjs', '**/*.config.ts', '**/vitest.config.ts'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
);
