const LITERS_TO_QUARTS = 1.05668821;

export function parseOilCapacityToQuarts(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const lower = text.toLowerCase();
  if (/\b(l|liter|liters|litre|litres)\b/.test(lower)) {
    return Number((amount * LITERS_TO_QUARTS).toFixed(2));
  }
  return amount;
}

export function calculateExtraOilQuarts(
  capacity: string | number | null | undefined,
  baseIncludedQuarts = 5,
): number {
  const capacityQuarts = parseOilCapacityToQuarts(capacity);
  if (capacityQuarts == null) return 0;
  return Math.max(0, Math.ceil(capacityQuarts - baseIncludedQuarts));
}

export function formatOilQuarts(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
}
