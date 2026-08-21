/**
 * Money — Centralized, branded currency primitives.
 *
 * This is the SINGLE source of truth for representing and converting money in
 * the app. All new code MUST use these types and helpers instead of raw
 * `number` for amounts, and MUST use `dollarsToCents`/`centsToDollars` for
 * unit conversion.
 *
 * F0 guardrails (see docs/lovable_financial_unit_repair_runbook.md):
 *   1. Branded `Cents` and `Dollars` types — mixing them is a compile error.
 *   2. Banker's rounding is the only sanctioned rounding mode for money.
 *   3. Raw `number` typed fields whose names look like money (`*_cents`,
 *      `*Cents`, `amount`, `total`, `subtotal`, `price`, `cost`, `fee`,
 *      `tax`, `discount`, `refund`) are banned by ESLint — use `Cents` or
 *      `Dollars` from this module.
 *   4. `Math.round(x * 100)` / `Number(x).toFixed(2)` for money are banned by
 *      ESLint — use `dollarsToCents` / `formatMoney` from this module.
 *
 * Storage rule of thumb:
 *   - New DB columns storing money MUST be `bigint` cents.
 *   - Legacy dollar columns are read via `centsToDollars` boundary helpers
 *     until the F4 column migrations complete them one-at-a-time.
 *
 * @module money
 */

export {
  bankersRound,
  dollarsToCents,
  centsToDollars,
  toCents,
  toDollars,
  formatMoney,
  formatCentsAsCurrency,
  formatDollarsAsCurrency,
} from "@/lib/financialMath";
export type { Cents, Dollars } from "@/lib/financialMath";

import type { Cents, Dollars } from "@/lib/financialMath";

/**
 * Runtime assertion that a value is a safe integer cent value.
 * Throws in dev; in prod returns the coerced value to avoid crashing the
 * checkout flow on an unexpected fractional cent (which is itself a bug —
 * capture it in logs instead).
 */
export function assertCents(value: number, context?: string): Cents {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    const msg = `[money.assertCents] Expected integer cents, got ${value}` +
      (context ? ` (${context})` : "");
    // Throw in non-production so bugs surface loudly in dev/test. In prod,
    // log and coerce to avoid crashing checkout on an unexpected fractional
    // cent — the log is the signal to fix the upstream caller.
    const mode = (typeof globalThis !== "undefined"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV
      : undefined) ?? "development";
    if (mode !== "production") {
      throw new Error(msg);
    }
    console.error(msg);
    return Math.round(value) as Cents;
  }
  return value as Cents;
}

/**
 * Safe addition of two Cents values. Prevents accidentally adding Dollars.
 */
export function addCents(a: Cents, b: Cents): Cents {
  return ((a as number) + (b as number)) as Cents;
}

/**
 * Safe subtraction of two Cents values, floored at 0.
 */
export function subCents(a: Cents, b: Cents): Cents {
  return Math.max((a as number) - (b as number), 0) as Cents;
}

/**
 * Zero constants — prefer over `0 as Cents` sprinkled at call sites.
 */
export const ZERO_CENTS = 0 as Cents;
export const ZERO_DOLLARS = 0 as Dollars;
