import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /**
     * The vault + wallet suites run REAL scrypt at the lowest cost the vault will ACCEPT
     * (`MIN_SCRYPT_N` = 2^15) — deliberately, so they exercise the production KDF path rather than
     * a toy cost the contract would reject. Each seal+open is two derivations, and `pnpm -r test`
     * runs every package's vitest concurrently, so on a loaded machine those derivations exceed
     * vitest's 5s default and the suite fails INTERMITTENTLY (green alone, red in a full run).
     *
     * The headroom is raised rather than the KDF weakened: a flaky security test is worse than a
     * slow one, and lowering the cost would stop testing what actually ships.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /**
     * Run THIS package's files one at a time. Every suite here does real scrypt, and `pnpm -r test`
     * already runs 28 packages concurrently — so core's own files were additionally competing with
     * each other for the same saturated CPU. That contention is the only thing that separated
     * "green when run alone" from an occasional failure inside a full run, and it is exactly the
     * kind of flake that erodes trust in a security suite. Sequencing costs a few seconds and
     * removes the variable; nothing about the KDF cost or any assertion is weakened.
     */
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Critical tier (handbook 04 §1): the crown-jewel package holds a 90% floor.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
