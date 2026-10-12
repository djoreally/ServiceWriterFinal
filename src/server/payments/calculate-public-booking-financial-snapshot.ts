import { ApiError } from "@/server/api";
import {
  calculatePublicBookingFinancials,
  type PublicBookingFinancialSnapshot,
  type PublicBookingPaymentMode,
} from "@/domain/financials/public-booking-financials";
import {
  loadPublicBookingFinancialContext,
  type PublicBookingValidatedDiscount,
} from "@/server/payments/public-booking-financial-context";
import {
  calculatePublicBookingTax,
  type PublicBookingTaxCalculationResult,
} from "@/server/payments/public-booking-tax-calculation";

export interface CanonicalPublicBookingFinancialResult {
  workspaceId: string;
  appointmentId: string;
  customerId: string;
  vehicleId: string | null;
  locationId: string;
  snapshot: PublicBookingFinancialSnapshot;
  discount: PublicBookingValidatedDiscount | null;
  tax: PublicBookingTaxCalculationResult;
}

/**
 * Compose the read-only canonical financial snapshot for a persisted public
 * booking. This function does not mutate payments, invoices, coupon usage,
 * appointment status, or provider objects.
 */
export async function calculateCanonicalPublicBookingFinancialSnapshot(params: {
  bookingSlug: string;
  appointmentId: string;
  paymentMode: PublicBookingPaymentMode;
  couponCode?: string | null;
  now?: Date;
}): Promise<CanonicalPublicBookingFinancialResult> {
  const context = await loadPublicBookingFinancialContext({
    bookingSlug: params.bookingSlug,
    appointmentId: params.appointmentId,
    couponCode: params.couponCode,
    now: params.now,
  });

  const common = {
    itemSubtotalDollars: context.itemSubtotalDollars,
    discountDollars: context.discount?.amountDollars ?? 0,
    hasOilService: context.hasOilService,
    feeSettings: context.feeSettings,
    paymentMode: params.paymentMode,
  } as const;

  // First pass determines the canonical taxable base only. Exact zero tax is
  // intentional here so no configured/manual rate can leak into this pass.
  const preTax = calculatePublicBookingFinancials({
    ...common,
    tax: {
      amountCents: 0,
      source: "pre_tax_base",
    },
  });

  const tax = await calculatePublicBookingTax({
    amountCents: preTax.taxableBaseCents,
    currencyCode: context.tax.currencyCode,
    provider: context.tax.provider,
    ratePercent: context.tax.ratePercent,
    paymentProvider: context.tax.paymentProvider,
    operationalSettings: context.tax.operationalSettings,
    location: context.tax.location,
    description: "Public booking services",
  });

  const snapshot = calculatePublicBookingFinancials({
    ...common,
    tax: {
      amountCents: tax.taxCents,
      source: tax.source,
      calculationId: tax.calculationId,
    },
  });

  if (snapshot.taxableBaseCents !== preTax.taxableBaseCents) {
    throw new ApiError(
      500,
      "Financial taxable base changed during tax calculation.",
      "financial_calculation_unstable",
    );
  }
  if (snapshot.totalCents !== snapshot.taxableBaseCents + tax.taxCents) {
    throw new ApiError(
      500,
      "Financial total does not reconcile to taxable base plus tax.",
      "financial_calculation_unstable",
    );
  }

  return {
    workspaceId: context.workspaceId,
    appointmentId: context.appointmentId,
    customerId: context.customerId,
    vehicleId: context.vehicleId,
    locationId: context.locationId,
    snapshot,
    discount: context.discount,
    tax,
  };
}
