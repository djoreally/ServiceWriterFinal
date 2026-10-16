import { ApiError } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  calculatePublicBookingFinancials,
  type PublicBookingFinancialSnapshot,
  type PublicBookingPaymentMode,
  type PublicBookingTaxInput,
} from "@/domain/financials/public-booking-financials";
import {
  loadPublicBookingFinancialContext,
  type PublicBookingFinancialContext,
} from "@/server/payments/public-booking-financial-context";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

export interface FinalizePublicBookingFinancialsParams {
  bookingSlug: string;
  appointmentId: string;
  paymentId: string;
  paymentChoice: "pay_later" | "pay_now";
  couponCode?: string | null;
}

export interface FinalizedPublicBookingFinancials {
  snapshot: PublicBookingFinancialSnapshot;
  context: PublicBookingFinancialContext;
  idempotent: boolean;
}

function paymentMode(choice: FinalizePublicBookingFinancialsParams["paymentChoice"]): PublicBookingPaymentMode {
  return choice === "pay_now" ? "online_card" : "pay_at_service";
}

function locationTaxEnabled(context: PublicBookingFinancialContext): boolean {
  return context.tax.operationalSettings.location_tax_enabled !== false;
}

async function calculateStripeTax(params: {
  context: PublicBookingFinancialContext;
  taxableBaseCents: number;
  appointmentId: string;
}): Promise<PublicBookingTaxInput> {
  if (params.context.tax.paymentProvider !== "stripe") {
    throw new ApiError(
      409,
      "Stripe Tax is selected but Stripe is not the workspace payment provider.",
      "tax_configuration_invalid",
    );
  }

  const location = params.context.tax.location;
  if (!location.line1 || !location.city || !location.state || !location.postalCode) {
    throw new ApiError(
      409,
      "Structured service location is required for Stripe Tax finalization.",
      "tax_location_incomplete",
    );
  }

  const execution = resolveStripeWorkspaceExecution(params.context.tax.operationalSettings);
  const calculation = await execution.stripe.tax.calculations.create({
    currency: params.context.tax.currencyCode.toLowerCase(),
    customer_details: {
      address: {
        line1: location.line1,
        line2: location.line2 || undefined,
        city: location.city,
        state: location.state,
        postal_code: location.postalCode,
        country: location.country,
      },
      address_source: "billing",
    },
    line_items: [{
      amount: params.taxableBaseCents,
      reference: `appointment:${params.appointmentId}`,
      tax_behavior: "exclusive",
      // Historical Service Writer policy. Replace with item-level tax codes when
      // the catalog gains an explicit taxability contract.
      tax_code: "txcd_10103001",
    }],
  }, execution.requestOptions(`public-booking-tax:${params.appointmentId}:${params.taxableBaseCents}`));

  const result = calculation as unknown as {
    id: string;
    tax_amount_exclusive?: number | null;
  };
  const amountCents = Number(result.tax_amount_exclusive ?? 0);
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ApiError(502, "Stripe Tax returned an invalid amount.", "tax_calculation_invalid");
  }

  return {
    amountCents,
    source: `stripe_tax_${execution.mode}`,
    calculationId: result.id,
  };
}

export async function finalizePublicBookingFinancials(
  params: FinalizePublicBookingFinancialsParams,
): Promise<FinalizedPublicBookingFinancials> {
  const context = await loadPublicBookingFinancialContext({
    bookingSlug: params.bookingSlug,
    appointmentId: params.appointmentId,
    couponCode: params.couponCode,
  });

  const mode = paymentMode(params.paymentChoice);
  const discountDollars = context.discount?.amountDollars ?? 0;

  // First pass establishes the canonical taxable base from persisted items,
  // validated discount, and configured fees. Tax is deliberately zero here.
  const preTax = calculatePublicBookingFinancials({
    itemSubtotalDollars: context.itemSubtotalDollars,
    discountDollars,
    hasOilService: context.hasOilService,
    feeSettings: context.feeSettings,
    paymentMode: mode,
    tax: { ratePercent: 0, source: "pre_tax_basis" },
  });

  let tax: PublicBookingTaxInput;
  if (!locationTaxEnabled(context)) {
    tax = { amountCents: 0, source: "tax_disabled" };
  } else if (context.tax.provider === "stripe") {
    tax = await calculateStripeTax({
      context,
      taxableBaseCents: preTax.taxableBaseCents,
      appointmentId: params.appointmentId,
    });
  } else {
    tax = {
      ratePercent: context.tax.ratePercent,
      source: "workspace_manual_rate",
    };
  }

  const snapshot = calculatePublicBookingFinancials({
    itemSubtotalDollars: context.itemSubtotalDollars,
    discountDollars,
    hasOilService: context.hasOilService,
    feeSettings: context.feeSettings,
    paymentMode: mode,
    tax,
  });

  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("finalize_public_booking_financials_v1", {
    p_booking_slug: params.bookingSlug,
    p_appointment_id: params.appointmentId,
    p_payment_id: params.paymentId,
    p_snapshot: snapshot,
    p_discount: context.discount,
  });
  if (error) throw error;

  return {
    snapshot,
    context,
    idempotent: Boolean((data as { idempotent?: unknown } | null)?.idempotent),
  };
}
