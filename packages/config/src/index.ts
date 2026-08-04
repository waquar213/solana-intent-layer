/**
 * @intent-wallet/config — the single, typed entry point for platform configuration.
 *
 * Rule (handbook 02 §4): services read VALIDATED config through this schema, not
 * `process.env` directly — so that (a) config is validated once at boot and
 * (b) a missing/invalid required var crashes startup with a clear message
 * instead of surfacing as a mysterious runtime failure later. (A few local-only
 * escape-hatch overrides — `IW_GIWA_AMM`, `IW_GIWA_RPC`, `IW_PLAN_DB_PATH`,
 * `IW_AUTH_DOMAIN` — are read directly at their call sites and are NOT schema-validated.)
 *
 * Variables are namespaced `IW_<AREA>_<NAME>` (handbook 01 §1).
 */
import { z } from 'zod';

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Deployment tiers. `local` relaxes some requirements (see refinements below). */
export const IW_ENVIRONMENTS = ['local', 'preview', 'staging', 'prod'] as const;
export type IwEnvironment = (typeof IW_ENVIRONMENTS)[number];

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * The platform config schema. Add new vars here (and to `.env.example`) — never
 * read them ad hoc. Optional vars carry sensible non-secret defaults; secrets
 * are required only where the code path needs them, enforced per-area below.
 */
export const ConfigSchema = z
  .object({
    IW_ENV: z.enum(IW_ENVIRONMENTS).default('local'),
    IW_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    IW_SERVICE_NAME: z.string().min(1).default('api'),
    IW_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(8080),

    // Datastores (backend). Optional so client/tooling contexts can load a
    // partial config; services that need them assert presence at wiring time.
    IW_DB_URL: z.string().url().optional(),
    IW_REDIS_URL: z.string().url().optional(),

    // Secret that signs SIWE session tokens (HS256). Optional for local (a dev
    // default is used); mandatory in every deployed environment.
    IW_AUTH_SECRET: z.string().min(16).optional(),

    // CORS allowlist — comma-separated exact origins the browser app is served
    // from (e.g. "https://app.intentwallet.xyz"). Empty → no cross-origin access
    // (same-origin only, which is how local dev works via the Vite proxy).
    IW_CORS_ORIGINS: z.string().optional(),

    // Global API rate limit: max requests per IP per minute (a DoS/abuse floor;
    // sensitive routes like /v1/auth/* apply a tighter per-route limit on top).
    IW_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

    // Chain access — public defaults are fine for local; prod injects keyed URLs.
    IW_RPC_ETHEREUM: z.string().url().default('https://ethereum-rpc.publicnode.com'),
    IW_RPC_SOLANA: z.string().url().default('https://api.mainnet-beta.solana.com'),
    IW_RPC_BITCOIN: z.string().url().default('https://blockstream.info/api'),

    // Alchemy Token API key (backend only). When set, EVM holdings are read from
    // Alchemy's enhanced API — native ETH + AUTO-DISCOVERED ERC-20s — instead of the
    // native-only plain-RPC path. A read/rate-limited data key, never a signing key.
    IW_ALCHEMY_API_KEY: z.string().min(1).optional(),

    // Etherscan-compatible EVM explorer `txlist` API for the activity feed (Blockscout
    // needs no key). Default targets Sepolia (the wallet's EVM testnet).
    IW_EVM_EXPLORER_API: z.string().url().default('https://eth-sepolia.blockscout.com/api'),

    // AI (backend only — must never be bundled into a client build).
    IW_LLM_API_KEY: z.string().min(1).optional(),
    IW_LLM_MODEL_PARSE: z.string().min(1).default('claude-sonnet-5'),
    IW_LLM_MODEL_CLASSIFY: z.string().min(1).default('claude-haiku-4-5'),

    // Feature flags (boot defaults; runtime flags come from the flag service).
    IW_FLAG_INTENTS_LLM_PATH: booleanish.default('true'),
    // When true (default), seed the Risk Engine's threat intel with OFAC's sanctioned
    // crypto-address list at boot so plans to a sanctioned recipient are hard-blocked.
    IW_FLAG_SANCTIONS_SCREENING: booleanish.default('true'),
    // When true, the intent routes (plan/authorize/execute) require a valid SIWE
    // session — the server-side half of "gate the app's real requests". Off by
    // default so localhost stays frictionless; deployments turn it on.
    IW_REQUIRE_AUTH: booleanish.default('false'),
  })
  .superRefine((cfg, ctx) => {
    // In non-local environments, backend datastores are mandatory: failing fast
    // at boot is far safer than discovering a missing DB URL mid-request.
    if (cfg.IW_ENV !== 'local') {
      for (const key of ['IW_DB_URL', 'IW_REDIS_URL', 'IW_AUTH_SECRET'] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when IW_ENV=${cfg.IW_ENV}`,
          });
        }
      }
      // Auth MUST be enforced outside local. With it off, the intent routes run
      // open and every caller collapses to a single shared principal — so one user
      // could authorize/execute against another's plan + holdings. Fail boot rather
      // than serve a shared-principal deployment.
      if (cfg.IW_REQUIRE_AUTH !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['IW_REQUIRE_AUTH'],
          message: `IW_REQUIRE_AUTH must be true when IW_ENV=${cfg.IW_ENV} (a deployed env must bind requests to the authenticated wallet)`,
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parses and validates configuration from a source (defaults to `process.env`).
 * @throws ConfigError with every problem listed at once (not just the first).
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(issues);
  }
  return result.data;
}

/** True for `prod`/`staging` — use to gate stricter behavior (e.g., no debug endpoints). */
export function isProductionLike(cfg: Config): boolean {
  return cfg.IW_ENV === 'prod' || cfg.IW_ENV === 'staging';
}

/**
 * True ONLY for `local`. Use this — not `!isProductionLike` — to gate anything that
 * fabricates data (dev holdings seed, demo executor, test-seed identity). `preview`
 * is a DEPLOYED environment, so `!isProductionLike` would leak fake balances +
 * simulated signing onto a shared URL, violating the no-fake-data doctrine.
 */
export function isLocal(cfg: Config): boolean {
  return cfg.IW_ENV === 'local';
}
