import { ApiError } from "@/server/api";
import {
  bankersRound,
  dollarsToCents,
  toDollars,
} from "@/lib/financialMath";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

export interface PublicBookingTaxLocation {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PublicBookingTaxCalculationInput {
  amountCents: number;
  currencyCode: string;
  provider: "manual" | "stripe";
  ratePercent: number;
  paymentProvider: string | null;
  operationalSettings: Record<string, unknown>;
  location: PublicBookingTaxLocation;
  description?: string;
}

export interface PublicBookingTaxBreakdownItem {
  jurisdiction: string;
  rate: number;
  amountCents: number;
  taxType: string;
}

export interface PublicBookingTaxCalculationResult {
  taxCents: number;
  source: "workspace_manual_rate" | "stripe_tax_connect" | "stripe_tax_direct";
  calculationId: string | null;
  ratePercent: number | null;
  fallback: boolean;
  breakdown: PublicBookingTaxBreakdownItem[];
}

function requireIntegerCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new ApiError(500, "Taxable amount is invalid.", "financial_calculation_invalid");
  }
  return value;
}

function requireRate(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiError(500, "Workspace tax rate is invalid.", "tax_configuration_invalid");
  }
  return value;
}

function manualTaxCents(amountCents: number, ratePercent: number): number {
  const amountDollars = amountCents / 100;
  const taxDollars = bankersRound(amountDollars * (ratePercent / 100), 2);
  return Number(dollarsToCents(toDollars(taxDollars)));
}

function manualResult(
  amountCents: number,
  ratePercent: number,
  fallback: boolean,
): PublicBookingTaxCalculationResult {
  const taxCents = manualTaxCents(amountCents, ratePercent);
  return {
    taxCents,
    source: "workspace_manual_rate",
    calculationId: null,
    ratePercent,
    fallback,
    breakdown: ratePercent > 0
      ? [{
          jurisdiction: "Configured Rate",
          rate: ratePercent,
          amountCents: taxCents,
          taxType: "manual",
        }]
      : [],
  };
}

/**
 * One server-owned tax provider boundary for both booking preview and final
 * financial snapshots. Callers supply an already-authoritative taxable base.
 */
export async function calculatePublicBookingTax(
  input: PublicBookingTaxCalculationInput,
): Promise<PublicBookingTaxCalculationResult> {
  const amountCents = requireIntegerCents(input.amountCents);
  const ratePercent = requireRate(input.ratePercent);

  if (input.provider === "manual") {
    return manualResult(amountCents, ratePercent, false);
  }

  if (input.paymentProvider !== "stripe") {
    throw new ApiError(
      409,
      "Stripe Tax is selected but Stripe is not the workspace payment provider.",
      "tax_configuration_invalid",
    );
  }

  const currency = input.currencyCode.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new ApiError(500, "Workspace currency is invalid.", "financial_configuration_invalid");
  }

  const location = {
    line1: input.location.line1.trim(),
    line2: input.location.line2?.trim() || undefined,
    city: input.location.city.trim(),
    state: input.location.state.trim(),
    postal_code: input.location.postalCode.trim(),
    country: input.location.country.trim().toUpperCase(),
  };
  if (!location.line1 || !location.city || !location.state || !location.postal_code || !location.country) {
    throw new ApiError(
      409,
      "Structured service location is required for Stripe Tax.",
      "tax_location_incomplete",
    );
  }

  try {
    const execution = resolveStripeWorkspaceExecution(input.operationalSettings);
    const calculation = await execution.stripe.tax.calculations.create({
      currency,
      customer_details: {
        address: location,
        address_source: "billing",
      },
      line_items: [{
        amount: amountCents,
        reference: input.description?.trim() || "Service",
        tax_behavior: "exclusive",
        tax_code: "txcd_10103001",
      }],
    }, execution.requestOptions());

    const result = calculation as unknown as {
      id?: string | null;
      tax_amount_exclusive?: number | null;
      tax_breakdown?: Array<{
        amount?: number | null;
        tax_rate_details?: {
          percentage_decimal?: string | null;
          country?: string | null;
          state?: string | null;
          tax_type?: string | null;
        } | null;
        taxability_reason?: string | null;
      }> | null;
    };
    const taxCents = Number(result.tax_amount_exclusive ?? 0);
    if (!Number.isFinite(taxCents) || taxCents < 0 || !Number.isInteger(taxCents)) {
      throw new Error("Stripe Tax returned an invalid tax amount");
    }

    const breakdown: PublicBookingTaxBreakdownItem[] = (result.tax_breakdown ?? []).map((item) => {
      const amount = Number(item.amount ?? 0);
      const rate = item.tax_rate_details?.percentage_decimal
        ? Number(item.tax_rate_details.percentage_decimal)
        : 0;
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0 || !Number.isFinite(rate) || rate < 0) {
        throw new Error("Stripe Tax returned an invalid tax breakdown");
      }
      const jurisdiction = [
        item.tax_rate_details?.state,
        item.tax_rate_details?.country,
      ].filter(Boolean).join(", ") || "Unknown";
      return {
        jurisdiction,
        rate,
        amountCents: amount,
        taxType: item.tax_rate_details?.tax_type || item.taxability_reason || "taxable",
      };
    });

    return {
      taxCents,
      source: execution.mode === "direct" ? "stripe_tax_direct" : "stripe_tax_connect",
      calculationId: result.id || null,
      ratePercent: null,
      fallback: false,
      breakdown,
    };
  } catch (error) {
    console.warn("[public-booking-tax] provider calculation failed; using configured rate", {
      message: error instanceof Error ? error.message : "unknown provider error",
    });
    return manualResult(amountCents, ratePercent, true);
  }
}
