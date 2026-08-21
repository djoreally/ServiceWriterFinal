/**
 * Fluid quantity validation + unit normalization.
 *
 * Accepts free-form user input like "7 qts", "6.5 quarts w/ filter",
 * "5L", "5,2 litres" and normalizes it to a canonical string.
 *
 * Canonical output form:
 *   - "<amount> qt"  (default, US)
 *   - "<amount> qt (<liters> L)" when the user originally entered liters
 *
 * Returns hard `error` for obvious mistakes (non-numeric, zero, negative,
 * out-of-range) and soft `warning` for unusual-but-legal values.
 */

const LITERS_TO_QUARTS = 1.05668821;
const QUARTS_TO_LITERS = 1 / LITERS_TO_QUARTS;

export interface FluidQuantityResult {
  normalized: string | null;
  quarts: number | null;
  error?: string;
  warning?: string;
}

export interface FluidQuantityOptions {
  /** Display label used inside error messages (e.g. "Oil capacity"). */
  label?: string;
  /** Minimum allowed quarts (inclusive). Defaults to 0.5. */
  minQuarts?: number;
  /** Maximum allowed quarts (inclusive). Defaults to 30. */
  maxQuarts?: number;
  /** Values above this (in qt) get a soft warning. Defaults to 15. */
  warnAboveQuarts?: number;
  /** Preserve any trailing qualifier such as "with filter". */
  keepQualifier?: boolean;
}

const UNIT_RE = /\b(qts?|quarts?|l|liter|liters|litre|litres)\b/i;
const NUMBER_RE = /(\d+(?:[.,]\d+)?)/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatAmount(n: number): string {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : String(r);
}

/**
 * Parse + validate + normalize a fluid quantity string.
 * Empty / null input is treated as "cleared" (no error).
 */
export function normalizeFluidQuantity(
  input: string | null | undefined,
  opts: FluidQuantityOptions = {},
): FluidQuantityResult {
  const label = opts.label ?? "Quantity";
  const minQ = opts.minQuarts ?? 0.5;
  const maxQ = opts.maxQuarts ?? 30;
  const warnAbove = opts.warnAboveQuarts ?? 15;

  if (input == null) return { normalized: null, quarts: null };
  const raw = String(input).trim();
  if (!raw) return { normalized: null, quarts: null };

  const numMatch = raw.match(NUMBER_RE);
  if (!numMatch) {
    return {
      normalized: null,
      quarts: null,
      error: `${label} must include a number (e.g. "6.5 qt" or "5 L").`,
    };
  }

  const amount = Number(numMatch[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      normalized: null,
      quarts: null,
      error: `${label} must be greater than zero.`,
    };
  }

  const unitMatch = raw.match(UNIT_RE);
  const unit = unitMatch?.[1]?.toLowerCase() ?? "";
  const isLiters = /^(l|liter|liters|litre|litres)$/.test(unit);

  const quarts = isLiters ? amount * LITERS_TO_QUARTS : amount;
  const liters = isLiters ? amount : amount * QUARTS_TO_LITERS;

  if (quarts < minQ) {
    return {
      normalized: null,
      quarts: null,
      error: `${label} of ${formatAmount(quarts)} qt is too low (min ${minQ} qt).`,
    };
  }
  if (quarts > maxQ) {
    return {
      normalized: null,
      quarts: null,
      error: `${label} of ${formatAmount(quarts)} qt exceeds the ${maxQ} qt max — double-check units.`,
    };
  }

  // Preserve trailing qualifier like "with filter" / "w/ filter" / "dry fill".
  let qualifier = "";
  if (opts.keepQualifier !== false) {
    const afterUnit = unitMatch
      ? raw.slice((unitMatch.index ?? 0) + unitMatch[0].length)
      : raw.slice((numMatch.index ?? 0) + numMatch[0].length);
    const cleaned = afterUnit.replace(/^[\s,.-]+/, "").trim();
    if (cleaned) qualifier = ` ${cleaned}`;
  }

  const qStr = formatAmount(quarts);
  const normalized = isLiters
    ? `${qStr} qt (${formatAmount(liters)} L)${qualifier}`
    : `${qStr} qt${qualifier}`;

  const result: FluidQuantityResult = {
    normalized,
    quarts: round2(quarts),
  };
  if (quarts > warnAbove) {
    result.warning = `${label} of ${qStr} qt is unusually large — verify the spec sheet.`;
  }
  return result;
}
