/**
 * Repair Estimate — pure pricing translation for market repair data.
 *
 * Single source of truth for turning a `RepairItem` (from the vehicle-repairs
 * API) into shop-facing pricing: labor hours, parts lines, and market
 * positioning. Every surface (Quotes, Services, Service Catalog, Fleet,
 * public quote requests) MUST use these helpers instead of re-deriving
 * costs inline.
 *
 * All math routes through `bankersRound` (see src/lib/money.ts).
 */

import { bankersRound, toDollars, type Dollars } from "@/lib/financialMath";
import type { RepairItem } from "@/application/queries/vehicle-repairs.query";

export type PricingTier = "independent" | "dealer";

/**
 * Fallback hourly labor rate used only when the shop has no rate configured
 * on its service catalog. Documented default, never a hidden literal.
 */
export const DEFAULT_SHOP_LABOR_RATE = 120;

export interface RepairCostBreakdown {
  partLow: number;
  partAvg: number;
  partHigh: number;
  laborLow: number;
  laborAvg: number;
  laborHigh: number;
  totalLow: number;
  totalAvg: number;
  totalHigh: number;
}

export interface EstimateLine {
  kind: "labor" | "part";
  description: string;
  quantity: number;
  unitPrice: Dollars;
}

export interface BuildLinesOptions {
  /** Shop hourly labor rate in dollars. */
  laborRate?: number;
  /** Optional parts markup, e.g. 0.2 for +20%. */
  partsMarkup?: number;
}

function pick(costs: RepairItem["costs"][PricingTier], name: "part" | "labor" | "total") {
  const entry = costs.find((c) => c.name === name);
  return {
    low: Number(entry?.low) || 0,
    average: Number(entry?.average) || 0,
    high: Number(entry?.high) || 0,
  };
}

/** Extract low/average/high part + labor + total costs for a pricing tier. */
export function extractRepairCosts(repair: RepairItem, tier: PricingTier): RepairCostBreakdown {
  const costs = tier === "dealer" ? repair.costs?.dealer ?? [] : repair.costs?.independent ?? [];
  const part = pick(costs, "part");
  const labor = pick(costs, "labor");
  const total = pick(costs, "total");

  return {
    partLow: part.low,
    partAvg: part.average,
    partHigh: part.high,
    laborLow: labor.low,
    laborAvg: labor.average,
    laborHigh: labor.high,
    totalLow: total.low || bankersRound(part.low + labor.low, 2),
    totalAvg: total.average || bankersRound(part.average + labor.average, 2),
    totalHigh: total.high || bankersRound(part.high + labor.high, 2),
  };
}

/**
 * Derive billable labor hours from a market labor cost and the shop's own
 * hourly rate. Returns a minimum of 0.5h whenever there is any labor cost so
 * a repair never lands on the quote with zero time.
 */
export function deriveLaborHours(laborCost: number, shopLaborRate?: number | null): number {
  const rate = shopLaborRate && shopLaborRate > 0 ? shopLaborRate : DEFAULT_SHOP_LABOR_RATE;
  if (!laborCost || laborCost <= 0) return 0;
  const hours = bankersRound(laborCost / rate, 1);
  return hours < 0.5 ? 0.5 : hours;
}

/** Resolve an effective shop labor rate from catalog rows (median of positives). */
export function resolveShopLaborRate(rates: Array<number | null | undefined>): number {
  const positives = rates.map((r) => Number(r)).filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
  if (positives.length === 0) return DEFAULT_SHOP_LABOR_RATE;
  const mid = Math.floor(positives.length / 2);
  return positives.length % 2 === 1
    ? positives[mid]
    : bankersRound((positives[mid - 1] + positives[mid]) / 2, 2);
}

/**
 * Build labor + parts lines for a repair. Parts markup is applied to the part
 * cost; labor is billed as `hours x shop rate` so shop economics stay intact
 * even when market labor differs.
 */
export function buildQuoteLinesFromRepair(
  repair: RepairItem,
  tier: PricingTier,
  options: BuildLinesOptions = {},
): { lines: EstimateLine[]; laborHours: number; laborCost: number; costs: RepairCostBreakdown } {
  const costs = extractRepairCosts(repair, tier);
  const rate = options.laborRate && options.laborRate > 0 ? options.laborRate : DEFAULT_SHOP_LABOR_RATE;
  const laborHours = deriveLaborHours(costs.laborAvg, rate);
  const laborCost = bankersRound(laborHours * rate, 2);

  const lines: EstimateLine[] = [];
  if (laborHours > 0) {
    lines.push({
      kind: "labor",
      description: `${repair.title} — labor (${laborHours}h @ ${rate}/hr)`,
      quantity: 1,
      unitPrice: toDollars(laborCost),
    });
  }

  if (costs.partAvg > 0) {
    const markup = options.partsMarkup && options.partsMarkup > 0 ? options.partsMarkup : 0;
    lines.push({
      kind: "part",
      description: `${repair.title} — replacement part`,
      quantity: 1,
      unitPrice: toDollars(bankersRound(costs.partAvg * (1 + markup), 2)),
    });
  }

  return { lines, laborHours, laborCost, costs };
}

/**
 * Compare the shop's own price to the market average.
 * Negative percent = shop is below market (competitive).
 */
export function marketPosition(
  shopPrice: number,
  marketAverage: number,
): { delta: number; percent: number; label: "under" | "over" | "at" } | null {
  if (!marketAverage || marketAverage <= 0 || !Number.isFinite(shopPrice)) return null;
  const delta = bankersRound(shopPrice - marketAverage, 2);
  const percent = bankersRound((delta / marketAverage) * 100, 1);
  const label = Math.abs(percent) < 1 ? "at" : percent < 0 ? "under" : "over";
  return { delta, percent, label };
}

/** Blended catalog price suggestion: market average plus a target margin. */
export function blendedPrice(marketAverage: number, targetMarginPercent = 0): number {
  if (!marketAverage || marketAverage <= 0) return 0;
  return bankersRound(marketAverage * (1 + targetMarginPercent / 100), 2);
}

/** Shop-level pricing defaults used by the internal job pricing tool. */
export interface ShopPricingDefaults {
  laborRate: number;
  partsMarkupPercent: number;
  shopSuppliesPercent: number;
  minLaborHours: number;
}

export const DEFAULT_SHOP_PRICING: ShopPricingDefaults = {
  laborRate: DEFAULT_SHOP_LABOR_RATE,
  partsMarkupPercent: 20,
  shopSuppliesPercent: 0,
  minLaborHours: 0.5,
};

export interface JobPrice {
  /** Market labor hours implied by the repair data at the shop's own rate. */
  laborHours: number;
  laborTotal: number;
  partsCost: number;
  partsTotal: number;
  shopSupplies: number;
  total: Dollars;
  market: RepairCostBreakdown;
  position: ReturnType<typeof marketPosition>;
  lines: EstimateLine[];
}

/**
 * Convert market repair data into the shop's own price using its labor rate,
 * parts markup and shop-supplies percentage. Single source of truth for the
 * internal Job Pricing tool.
 */
export function priceJobFromRepair(
  repair: RepairItem,
  tier: PricingTier,
  defaults: Partial<ShopPricingDefaults> = {},
  overrides: { laborHours?: number; partsCost?: number } = {},
): JobPrice {
  const cfg = { ...DEFAULT_SHOP_PRICING, ...defaults };
  const rate = cfg.laborRate > 0 ? cfg.laborRate : DEFAULT_SHOP_LABOR_RATE;
  const market = extractRepairCosts(repair, tier);

  const derived = deriveLaborHours(market.laborAvg, rate);
  const rawHours = overrides.laborHours ?? derived;
  const laborHours = rawHours > 0 ? Math.max(rawHours, cfg.minLaborHours) : 0;
  const laborTotal = bankersRound(laborHours * rate, 2);

  const partsCost = overrides.partsCost ?? market.partAvg;
  const partsTotal = bankersRound(partsCost * (1 + cfg.partsMarkupPercent / 100), 2);
  const shopSupplies = bankersRound(((laborTotal + partsTotal) * cfg.shopSuppliesPercent) / 100, 2);
  const total = bankersRound(laborTotal + partsTotal + shopSupplies, 2);

  const lines: EstimateLine[] = [];
  if (laborHours > 0) {
    lines.push({
      kind: "labor",
      description: `${repair.title} — labor (${laborHours}h @ ${rate}/hr)`,
      quantity: 1,
      unitPrice: toDollars(laborTotal),
    });
  }
  if (partsTotal > 0) {
    lines.push({
      kind: "part",
      description: `${repair.title} — parts`,
      quantity: 1,
      unitPrice: toDollars(partsTotal),
    });
  }
  if (shopSupplies > 0) {
    lines.push({ kind: "part", description: "Shop supplies", quantity: 1, unitPrice: toDollars(shopSupplies) });
  }

  return {
    laborHours,
    laborTotal,
    partsCost,
    partsTotal,
    shopSupplies,
    total: toDollars(total),
    market,
    position: marketPosition(total, market.totalAvg),
    lines,
  };
}

