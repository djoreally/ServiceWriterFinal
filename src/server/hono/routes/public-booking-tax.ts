import { Hono } from "hono";
import { z } from "zod";
import { ApiError, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

export const publicBookingTaxRouter = new Hono();

const addressSchema = z.object({
  line1: z.string().trim().max(500).optional().default(""),
  city: z.string().trim().max(160).optional().default(""),
  state: z.string().trim().max(160).optional().default(""),
  postal_code: z.string().trim().max(32).optional().default(""),
  country: z.string().trim().min(2).max(3),
});

const taxPreviewSchema = z.object({
  booking_slug: z.string().trim().min(1).max(160).optional(),
  amount: z.number().int().positive().max(100_000_000),
  currency: z.string().trim().length(3).optional(),
  customer_address: addressSchema,
  product_description: z.string().trim().max(500).optional(),
  // Temporary compatibility hint for the currently deployed booking page.
  // It is accepted only when it resolves to exactly one active public-booking
  // workspace. New callers must send booking_slug.
  user_id: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (!value.booking_slug && !value.user_id) {
    ctx.addIssue({
      code: "custom",
      message: "booking_slug is required",
      path: ["booking_slug"],
    });
  }
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteRate(value: unknown): number {
  const rate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new ApiError(500, "Workspace tax rate is invalid.", "tax_configuration_invalid");
  }
  return rate;
}

function manualTaxResult(params: {
  amount: number;
  currency: string;
  rate: number;
  fallbackReason?: string;
}) {
  const taxAmount = Math.round(params.amount * (params.rate / 100));
  return {
    success: true,
    subtotal: params.amount,
    tax_amount: taxAmount,
    total: params.amount + taxAmount,
    currency: params.currency,
    tax_breakdown: params.rate > 0
      ? [{
          jurisdiction: "Configured Rate",
          rate: params.rate,
          amount: taxAmount,
          tax_type: "manual",
        }]
      : [],
    calculation_source: "workspace_manual_rate",
    ...(params.fallbackReason
      ? { fallback: true, fallback_reason: params.fallbackReason }
      : {}),
  };
}

/**
 * Public tax preview only. This route is intentionally not final financial
 * authority: persisted appointment_items + the canonical financial snapshot
 * own the final booking/payment amount. The preview exists so the public UI
 * can show tax before submission without calling a missing Edge Function.
 */
publicBookingTaxRouter.post("/v1/platform/public-booking/calculate-tax", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body", "invalid_input");
  }
  const body = taxPreviewSchema.parse(raw);

  const db = createSupabaseAdminClient();

  let settingsQuery = db
    .from("workspace_settings")
    .select("workspace_id,booking_enabled,tax_rate,payment_provider,operational_settings")
    .eq("booking_enabled", true);

  if (body.booking_slug) {
    settingsQuery = settingsQuery.eq("booking_slug", body.booking_slug);
  } else {
    const { data: workspaces, error: ownedWorkspaceError } = await db
      .from("workspaces")
      .select("id")
      .eq("created_by", body.user_id!)
      .eq("is_active", true);
    if (ownedWorkspaceError) throw ownedWorkspaceError;
    const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);
    if (workspaceIds.length === 0) {
      throw new ApiError(404, "Public booking context not found.", "booking_context_invalid");
    }
    settingsQuery = settingsQuery.in("workspace_id", workspaceIds);
  }

  const { data: settingsRows, error: settingsError } = await settingsQuery.limit(2);
  if (settingsError) throw settingsError;
  if (!settingsRows || settingsRows.length === 0) {
    throw new ApiError(404, "Public booking context not found.", "booking_context_invalid");
  }
  if (settingsRows.length !== 1) {
    throw new ApiError(
      409,
      "Booking slug is required for this account.",
      "booking_context_ambiguous",
    );
  }
  const settings = settingsRows[0];

  const workspaceId = String(settings.workspace_id);
  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .select("currency_code,is_active")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace?.is_active) {
    throw new ApiError(404, "Public booking context not found.", "booking_context_invalid");
  }

  const currency = String(workspace.currency_code || body.currency || "USD").toLowerCase();
  const operational = record(settings.operational_settings);
  const taxProvider = operational.tax_provider === "stripe" ? "stripe" : "manual";
  const configuredRate = finiteRate(settings.tax_rate);

  if (taxProvider !== "stripe") {
    return json({
      data: manualTaxResult({ amount: body.amount, currency, rate: configuredRate }),
      error: null,
    });
  }

  if (settings.payment_provider !== "stripe") {
    throw new ApiError(
      409,
      "Stripe Tax is selected but Stripe is not the workspace payment provider.",
      "tax_configuration_invalid",
    );
  }

  try {
    const execution = resolveStripeWorkspaceExecution(settings.operational_settings);
    const calculation = await execution.stripe.tax.calculations.create({
      currency,
      customer_details: {
        address: {
          line1: body.customer_address.line1,
          city: body.customer_address.city,
          state: body.customer_address.state,
          postal_code: body.customer_address.postal_code,
          country: body.customer_address.country.toUpperCase(),
        },
        address_source: "billing",
      },
      line_items: [{
        amount: body.amount,
        reference: body.product_description || "Service",
        tax_behavior: "exclusive",
        // Historical Service Writer policy. Replace with item-level tax codes
        // when service_catalog gains an explicit tax policy contract.
        tax_code: "txcd_10103001",
      }],
    }, execution.requestOptions());

    const calculationData = calculation as unknown as {
      id: string;
      tax_amount_exclusive?: number | null;
      tax_breakdown?: Array<{
        amount?: number | null;
        jurisdiction?: { display_name?: string | null } | null;
        tax_rate_details?: { percentage_decimal?: string | null } | null;
        taxability_reason?: string | null;
      }> | null;
    };
    const taxAmount = Number(calculationData.tax_amount_exclusive ?? 0);
    const breakdown = (calculationData.tax_breakdown ?? []).map((item) => ({
      jurisdiction: item.jurisdiction?.display_name || "Unknown",
      rate: item.tax_rate_details?.percentage_decimal
        ? Number(item.tax_rate_details.percentage_decimal)
        : 0,
      amount: Number(item.amount ?? 0),
      tax_type: item.taxability_reason || "taxable",
    }));

    return json({
      data: {
        success: true,
        subtotal: body.amount,
        tax_amount: taxAmount,
        total: body.amount + taxAmount,
        currency,
        tax_breakdown: breakdown,
        calculation_id: calculationData.id,
        calculation_source: `stripe_tax_${execution.mode}`,
      },
      error: null,
    });
  } catch (error) {
    console.warn("[public-booking-tax] Stripe Tax unavailable; using configured rate", {
      workspaceId,
      message: error instanceof Error ? error.message : "unknown Stripe Tax error",
    });
    return json({
      data: manualTaxResult({
        amount: body.amount,
        currency,
        rate: configuredRate,
        fallbackReason: "Stripe Tax unavailable - using configured rate",
      }),
      error: null,
    });
  }
});
