export const DEFAULT_OIL_PRICE_PER_QUART = 4;

/**
 * Resolve oil pricing from the first configured numeric value.
 *
 * Public booking can receive this setting from multiple sources: the public
 * booking profile RPC and an extended settings query. Avoid `Number(value) || 4`
 * because it masks valid configured values such as 0 and falls back to 4 when
 * the preferred query is unavailable instead of trying the next source.
 */
export function resolveOilPricePerQuart(
  ...values: Array<number | string | null | undefined>
): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }

  return DEFAULT_OIL_PRICE_PER_QUART;
}
