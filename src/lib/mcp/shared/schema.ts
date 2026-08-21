/**
 * Shared input-validation helpers for ServiceWriter MCP tools.
 *
 * Import-safe: pure functions and Zod schemas only, no env reads or I/O.
 */
import { z } from "zod";

/** Strict calendar date, `YYYY-MM-DD`. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a calendar date formatted YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Not a real calendar date.");

/** Bounded row limit with a default. */
export function limitSchema(def: number, max: number) {
  return z.number().int().min(1).max(max).optional().describe(`Max rows to return (default ${def}, max ${max}).`);
}

export function resolveLimit(value: number | undefined, def: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value ?? def), 1), max);
}

/** Free-text filter, trimmed and stripped of PostgREST-hostile characters. */
export function sanitizeTerm(value: string | undefined): string | undefined {
  const term = value?.trim().replace(/[%,()]/g, " ").trim();
  return term ? term : undefined;
}

/** Days spanned by an inclusive date range. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export interface RangeCheck {
  ok: boolean;
  message?: string;
}

/** Validate an inclusive range's ordering and span. */
export function checkRange(from: string, to: string, maxDays: number): RangeCheck {
  if (Date.parse(`${to}T00:00:00Z`) < Date.parse(`${from}T00:00:00Z`)) {
    return { ok: false, message: "`to_date` must be on or after `from_date`." };
  }
  const span = daysBetween(from, to);
  if (span > maxDays) {
    return { ok: false, message: `Date range spans ${span} days; the maximum for this tool is ${maxDays}.` };
  }
  return { ok: true };
}

/** Enumerate every calendar date in an inclusive range. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return dates;
}

/** Standard tool error result. */
export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Standard tool success result: JSON text plus structured content. */
export function jsonResult<T extends Record<string, unknown>>(payload: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Round to cents to avoid float drift in aggregate sums. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
