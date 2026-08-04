import { describe, expect, it } from 'vitest';
import { ConfigError, isLocal, isProductionLike, loadConfig } from '../src/index.js';

const PROD_MIN = {
  IW_ENV: 'prod',
  IW_DB_URL: 'postgres://db:5432/iw',
  IW_REDIS_URL: 'redis://cache:6379',
  IW_AUTH_SECRET: 'a-strong-enough-secret-value',
  IW_REQUIRE_AUTH: 'true',
};

describe('loadConfig', () => {
  it('applies defaults for a minimal local config', () => {
    const cfg = loadConfig({});
    expect(cfg.IW_ENV).toBe('local');
    expect(cfg.IW_LOG_LEVEL).toBe('info');
    expect(cfg.IW_HTTP_PORT).toBe(8080);
    expect(cfg.IW_RPC_ETHEREUM).toMatch(/^https:\/\//u);
    expect(cfg.IW_FLAG_INTENTS_LLM_PATH).toBe(true);
  });

  it('coerces port and booleanish flags from strings', () => {
    const cfg = loadConfig({ IW_HTTP_PORT: '3000', IW_FLAG_INTENTS_LLM_PATH: '0' });
    expect(cfg.IW_HTTP_PORT).toBe(3000);
    expect(cfg.IW_FLAG_INTENTS_LLM_PATH).toBe(false);
  });

  it('requires DB, Redis and auth secret in non-local environments', () => {
    expect(() => loadConfig({ IW_ENV: 'prod' })).toThrowError(ConfigError);
    try {
      loadConfig({ IW_ENV: 'staging' });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const messages = (err as ConfigError).issues.join('\n');
      expect(messages).toContain('IW_DB_URL is required');
      expect(messages).toContain('IW_REDIS_URL is required');
      expect(messages).toContain('IW_AUTH_SECRET is required');
    }
    expect(loadConfig(PROD_MIN).IW_ENV).toBe('prod');
  });

  it('requires IW_REQUIRE_AUTH=true outside local (no shared-principal deployment)', () => {
    const withoutAuthEnforced = { ...PROD_MIN, IW_REQUIRE_AUTH: 'false' };
    try {
      loadConfig(withoutAuthEnforced);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ConfigError).issues.join('\n')).toContain('IW_REQUIRE_AUTH must be true');
    }
    expect(loadConfig(PROD_MIN).IW_REQUIRE_AUTH).toBe(true);
  });

  it('reports ALL problems at once, not just the first', () => {
    try {
      loadConfig({ IW_ENV: 'nope', IW_HTTP_PORT: '999999', IW_RPC_SOLANA: 'not-a-url' });
    } catch (err) {
      const issues = (err as ConfigError).issues;
      expect(issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('rejects malformed URLs and out-of-range ports', () => {
    expect(() => loadConfig({ IW_DB_URL: 'not-a-url', IW_ENV: 'local' })).toThrowError(ConfigError);
    expect(() => loadConfig({ IW_HTTP_PORT: '70000' })).toThrowError(ConfigError);
  });

  it('isProductionLike is true only for prod/staging', () => {
    expect(isProductionLike(loadConfig(PROD_MIN))).toBe(true);
    expect(isProductionLike(loadConfig({}))).toBe(false);
  });

  it('isLocal is true ONLY for local (preview is a deployed env — no fake data)', () => {
    expect(isLocal(loadConfig({}))).toBe(true); // default env is local
    expect(isLocal(loadConfig(PROD_MIN))).toBe(false);
    // `preview` is deployed: not local, so the dev seed / demo executor must NOT mount.
    const previewCfg = { IW_ENV: 'preview', IW_DB_URL: 'postgres://db:5432/iw', IW_REDIS_URL: 'redis://c:6379', IW_AUTH_SECRET: 'a-strong-enough-secret-value', IW_REQUIRE_AUTH: 'true' };
    expect(isLocal(loadConfig(previewCfg))).toBe(false);
  });
});
