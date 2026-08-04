/**
 * The pure condition evaluator. `evaluateCondition` is total and reads ONLY the
 * injected `EvalContext` (prices, portfolio metrics, gas, variables, events) —
 * never a live feed or a clock. This is what makes a workflow's gating logic
 * deterministic and unit-testable.
 */
import type { Condition, EvalContext } from './types.js';

const cmp = (a: number, op: 'gte' | 'lte' | 'eq', b: number): boolean =>
  op === 'gte' ? a >= b : op === 'lte' ? a <= b : a === b;

export function evaluateCondition(ctx: EvalContext, c: Condition): boolean {
  switch (c.op) {
    case 'always':
      return true;
    case 'and':
      return c.all.every((x) => evaluateCondition(ctx, x));
    case 'or':
      return c.any.some((x) => evaluateCondition(ctx, x));
    case 'not':
      return !evaluateCondition(ctx, c.expr);
    case 'price_gte': {
      const p = ctx.prices[c.symbol];
      return p !== undefined && p >= c.microsUsd;
    }
    case 'price_lte': {
      const p = ctx.prices[c.symbol];
      return p !== undefined && p <= c.microsUsd;
    }
    case 'metric':
      return cmp(ctx.portfolio[c.metric], c.cmp, c.value);
    case 'gas_below':
      return ctx.gasGwei < c.gwei;
    case 'day_of_week':
      return new Date(ctx.nowIso).getUTCDay() === c.day;
    case 'variable': {
      const v = ctx.variables[c.name];
      return v !== undefined && cmp(v, c.cmp, c.value);
    }
  }
}
