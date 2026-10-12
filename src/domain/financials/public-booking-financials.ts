import {
  computeFinancialSummary,
  dollarsToCents,
  toDollars,
  type FeeSettings,
} from "@/lib/financialMath";

export type PublicBookingPaymentMode = "pay_at_service" | "online_card";

export interface PublicBookingTaxInput {
  /** Exact tax returned by an authoritative provider, in integer minor units. */
  amountCents?: number | null;
  /** Manual/configured percentage, e.g. 6 for 6%. Ignored when amountCents is supplied. */
  ratePercent?: number | null;
  source: string;
  calculationId?: string | null;
}

export interface PublicBookingFinancialInput {
  itemSubtotalDollars: number;
  discountDollars?: number;
  hasOilService: boolean;
  feeSettings?: FeeSettings | null;
  paymentMode: PublicBookingPaymentMode;
  tax: PublicBookingTaxInput;
}

export interface PublicBookingFinancialSnapshot {
  calculationVersion: "public_booking_financial_v1";
  priceSource: "canonical_appointment_items";
  paymentMode: PublicBookingPaymentMode;
  itemSubtotalCents: number;
  discountCents: number;
  afterDiscountCents: number;
  wasteOilFeeCents: number;
  shopFeeCents: number;
  surchargeCents: number;
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
  taxRatePercent: number | null;
  taxSource: string;
  taxCalculationId: string | null;
}

function requireFiniteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return value;
}

function requireIntegerCents(value: number): number {
  requireFiniteNonNegative("tax.amountCents", value);
  if (!Number.isInteger(value)) {
    throw new Error("tax.amountCents must be an integer");
  }
  return value;
}

function toIntegerCents(dollars: number): number {
  return Number(dollarsToCents(toDollars(dollars)));
}

/**
 * Pure, deterministic public-booking money contract.
 *
 * This function deliberately has no database or provider access. Callers must
 * first resolve persisted appointment-item prices and validate any discount.
 * Tax may be supplied as an exact provider amount or as a server-owned manual
 * percentage. Browser totals are never inputs to this contract.
 *
 * Calculation order:
 *   canonical items -> discount -> waste/shop fees -> payment-mode surcharge
 *   -> tax -> total
 */
export function calculatePublicBookingFinancials(
  input: PublicBookingFinancialInput,
): PublicBookingFinancialSnapshot {
  const itemSubtotal = requireFiniteNonNegative("itemSubtotalDollars", input.itemSubtotalDollars);
  const requestedDiscount = requireFiniteNonNegative("discountDollars", input.discountDollars ?? 0);
  const discount = Math.min(requestedDiscount, itemSubtotal);

  const effectiveFeeSettings: FeeSettings | null = input.feeSettings
    ? {
        ...input.feeSettings,
        // Waste-oil disposal is service-scoped, not globally applied.
        waste_oil_fee_enabled: Boolean(input.hasOilService && input.feeSettings.waste_oil_fee_enabled),
        // Card surcharge exists only when an online card is actually selected.
        surcharge_enabled: Boolean(
          input.paymentMode === "online_card" && input.feeSettings.surcharge_enabled,
        ),
      }
    : null;

  const hasExactTax = input.tax.amountCents !== null && input.tax.amountCents !== undefined;
  const exactTaxCents = hasExactTax ? requireIntegerCents(input.tax.amountCents as number) : null;

  const ratePercent = input.tax.ratePercent === null || input.tax.ratePercent === undefined
    ? null
    : requireFiniteNonNegative("tax.ratePercent", input.tax.ratePercent);
  if (ratePercent !== null && ratePercent > 100) {
    throw new Error("tax.ratePercent must be less than or equal to 100");
  }

  const summary = computeFinancialSummary({
    subtotal: itemSubtotal,
    discount,
    feeSettings: effectiveFeeSettings,
    taxAmount: exactTaxCents === null ? undefined : exactTaxCents / 100,
    taxRate: exactTaxCents === null && ratePercent !== null ? ratePercent / 100 : undefined,
  });

  const itemSubtotalCents = toIntegerCents(summary.subtotal);
  const discountCents = toIntegerCents(summary.discount);
  const afterDiscountCents = itemSubtotalCents - discountCents;
  const wasteOilFeeCents = toIntegerCents(summary.wasteOilFee);
  const shopFeeCents = toIntegerCents(summary.shopFee);
  const surchargeCents = toIntegerCents(summary.surcharge);
  const taxableBaseCents = afterDiscountCents + wasteOilFeeCents + shopFeeCents + surchargeCents;
  const taxCents = exactTaxCents ?? toIntegerCents(summary.tax);
  const totalCents = taxableBaseCents + taxCents;

  return {
    calculationVersion: "public_booking_financial_v1",
    priceSource: "canonical_appointment_items",
    paymentMode: input.paymentMode,
    itemSubtotalCents,
    discountCents,
    afterDiscountCents,
    wasteOilFeeCents,
    shopFeeCents,
    surchargeCents,
    taxableBaseCents,
    taxCents,
    totalCents,
    taxRatePercent: exactTaxCents === null ? ratePercent : null,
    taxSource: input.tax.source,
    taxCalculationId: input.tax.calculationId ?? null,
  };
}
