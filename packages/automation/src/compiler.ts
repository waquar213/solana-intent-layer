/**
 * Workflow compiler — natural language → a typed `Workflow`. Deterministic
 * templates handle the common rules (DCA, buy-the-dip / stop-loss, scheduled
 * reward claim, exploit-triggered exit) with zero LLM cost; an injected
 * `WorkflowLlmClient` is the fallback for everything else. The output is always
 * a fully-typed workflow that will run through the gate — the compiler never
 * grants authority, it only structures intent.
 */
import { AutomationError } from './errors.js';
import type { AutomationEnv } from './env.js';
import type { Action, Condition, Safety, Trigger, Workflow } from './types.js';

export interface CompiledWorkflow {
  title: string;
  trigger: Trigger;
  condition: Condition;
  actions: Action[];
}

export interface WorkflowLlmClient {
  compile(utterance: string): Promise<CompiledWorkflow | null>;
}

const DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Parse a money string to micro-USD EXACTLY — integer arithmetic only, no floats.
 *
 * Returns null (⇒ the template DECLINES, and `compile` raises COMPILE_FAILED) whenever the text is
 * not an unambiguous amount. Three concrete failures this replaces, all reachable from the
 * templates' `[\d,]+(?:\.\d+)?` capture:
 *
 *   · "buy 1,5 BTC every monday"  — a European decimal comma was stripped, so $1.5 became $15: a
 *     10× OVERSPEND on an automation that then runs unattended. Commas are now accepted only as
 *     clean 3-digit group separators; an ambiguous one is refused rather than guessed.
 *   · "buy ,, BTC every monday"   — parseFloat gave NaN and `BigInt(NaN)` THREW a RangeError out of
 *     a function documented as pure/total.
 *   · large or long amounts       — float rounding corrupted the value (9007199254740993 came back
 *     as …992, and 123456789012.345678 as …345680).
 */
function usdMicros(raw: string): bigint | null {
  const s = raw.trim();
  if (s.includes(',')) {
    // Commas must form clean thousands groups ("1,234", "1,234,567.89"). "1,5" is ambiguous
    // (thousands separator or decimal point?) and must never be guessed.
    const [whole, ...rest] = s.split('.');
    if (rest.length > 1) return null;
    if (whole === undefined || !/^\d{1,3}(?:,\d{3})+$/u.test(whole)) return null;
  }
  const bare = s.replace(/,/gu, '');
  if (!/^\d+(?:\.\d+)?$/u.test(bare)) return null;
  const [whole = '0', frac = ''] = bare.split('.');
  // Pad/truncate the fraction to exactly 6 digits (micro-USD), then combine as integers.
  const micros = (frac + '000000').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(micros);
}

/** Parse a percentage EXACTLY enough to be safe: a finite, positive number, else null. A NaN here
 *  used to reach the trigger, where every comparison against it is false — so the automation would
 *  sit armed and silently never fire. */
function percent(raw: string): number | null {
  if (!/^\d+(?:\.\d+)?$/u.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

function scheduleFor(cadence: string): Trigger {
  const c = cadence.toLowerCase();
  if (c in DAYS) return { kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: DAYS[c] ?? 1 };
  if (c === 'week') return { kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: 1 };
  if (c === 'month') return { kind: 'schedule', every: 'month', atHourUtc: 9, dayOfMonth: 1 };
  return { kind: 'schedule', every: 'day', atHourUtc: 9 };
}

/** Pure: try to structure an utterance with the built-in templates. */
export function compileTemplate(utterance: string): CompiledWorkflow | null {
  const s = utterance.trim();

  // DCA — "Buy ₹5,000 BTC every Monday"
  const dca = /buy\s+[₹$]?\s?([\d,]+(?:\.\d+)?)\s+(?:worth\s+of\s+)?([a-z]{2,6})\s+every\s+([a-z]+)/i.exec(s);
  if (dca) {
    const [, amount, asset, cadence] = dca;
    const amountMicros = usdMicros(amount ?? '');
    // An unreadable amount must not become a guessed one — decline so `compile` reports
    // COMPILE_FAILED and the user restates it, rather than arming a wrong recurring buy.
    if (amountMicros === null || amountMicros <= 0n || !asset || !cadence) return null;
    return {
      title: `DCA into ${asset.toUpperCase()}`,
      trigger: scheduleFor(cadence),
      condition: { op: 'always' },
      actions: [
        {
          kind: 'swap',
          fromAsset: 'USDC',
          toAsset: asset.toUpperCase(),
          amountMicros,
          chainId: 'ethereum',
        },
      ],
    };
  }

  // Buy the dip — "If BTC falls 10%, buy ₹50,000"
  const dip = /if\s+([a-z]{2,6})\s+(?:falls|drops)\s+([\d.]+)%[,\s]+buy\s+[₹$]?\s?([\d,]+(?:\.\d+)?)/i.exec(s);
  if (dip) {
    const [, asset, pct, amount] = dip;
    const amountMicros = usdMicros(amount ?? '');
    const drop = percent(pct ?? '');
    if (amountMicros === null || amountMicros <= 0n || drop === null || !asset) return null;
    return {
      title: `Buy the dip on ${asset.toUpperCase()}`,
      trigger: { kind: 'price_move', symbol: asset.toUpperCase(), direction: 'drops', pct: drop },
      condition: { op: 'always' },
      actions: [
        {
          kind: 'swap',
          fromAsset: 'USDC',
          toAsset: asset.toUpperCase(),
          amountMicros,
          chainId: 'ethereum',
        },
      ],
    };
  }

  // Scheduled reward claim — "Claim staking rewards every Friday"
  const claim = /claim\s+(?:staking\s+)?rewards?\s+every\s+([a-z]+)/i.exec(s);
  if (claim) {
    return {
      title: 'Claim staking rewards',
      trigger: scheduleFor(claim[1]!),
      condition: { op: 'always' },
      actions: [{ kind: 'claim_rewards', protocol: 'staking', chainId: 'ethereum' }],
    };
  }

  // Exploit-triggered exit — "If a protocol is exploited, move my funds to USDC"
  const exit =
    /if\s+(?:a\s+)?(?:protocol|bridge)\s+(?:is\s+)?(?:exploited|hacked).*(?:move|exit).*to\s+([a-z]{2,6})/i.exec(s);
  if (exit) {
    return {
      title: 'Emergency exit to stablecoin',
      trigger: { kind: 'risk_event', minSeverity: 'high' },
      condition: { op: 'always' },
      actions: [{ kind: 'execute_intent', utterance: `move all at-risk funds to ${exit[1]!.toUpperCase()}` }],
    };
  }

  return null;
}

export interface CompileOptions {
  sessionKeyId?: string;
  safety?: Safety;
}

export class WorkflowCompiler {
  constructor(
    private readonly env: AutomationEnv,
    private readonly llm?: WorkflowLlmClient,
  ) {}

  async compile(utterance: string, ownerId: string, options: CompileOptions = {}): Promise<Workflow> {
    const parsed = compileTemplate(utterance) ?? (this.llm ? await this.llm.compile(utterance) : null);
    if (!parsed) throw new AutomationError('COMPILE_FAILED', `could not compile: "${utterance}"`);
    return {
      id: this.env.ids.workflow(),
      ownerId,
      title: parsed.title,
      description: utterance,
      trigger: parsed.trigger,
      condition: parsed.condition,
      actions: parsed.actions,
      safety: options.safety ?? {},
      status: 'active',
      version: 1,
      createdAtIso: this.env.now(),
      catchUp: 'once',
      ...(options.sessionKeyId !== undefined ? { sessionKeyId: options.sessionKeyId } : {}),
    };
  }
}
