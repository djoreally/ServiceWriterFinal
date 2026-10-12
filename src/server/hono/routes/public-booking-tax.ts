import { Hono } from "hono";
import { z } from "zod";
import { ApiError, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { calculatePublicBookingTax } from "@/server/payments/public-booking-tax-calculation";

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

/**
 * Public tax preview only. Browser amount remains non-authoritative; persisted
 * appointment_items own final transaction pricing. Both preview and final
 * calculation now share the same tax-provider service and rounding policy.
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
    throw new ApiError(409, "Booking slug is required for this account.", "booking_context_ambiguous");
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

  const operational = record(settings.operational_settings);
  const provider: "manual" | "stripe" = operational.tax_provider === "stripe" ? "stripe" : "manual";
  const currency = String(workspace.currency_code || body.currency || "USD").trim().toLowerCase();
  const tax = await calculatePublicBookingTax({
    amountCents: body.amount,
    currencyCode: currency,
    provider,
    ratePercent: finiteRate(settings.tax_rate),
    paymentProvider: settings.payment_provider ?? null,
    operationalSettings: operational,
    location: {
      line1: body.customer_address.line1,
      city: body.customer_address.city,
      state: body.customer_address.state,
      postalCode: body.customer_address.postal_code,
      country: body.customer_address.country,
    },
    description: body.product_description,
  });

  return json({
    data: {
      success: true,
      subtotal: body.amount,
      tax_amount: tax.taxCents,
      total: body.amount + tax.taxCents,
      currency,
      tax_breakdown: tax.breakdown.map((item) => ({
        jurisdiction: item.jurisdiction,
        rate: item.rate,
        amount: item.amountCents,
        tax_type: item.taxType,
      })),
      calculation_id: tax.calculationId,
      calculation_source: tax.source,
      ...(tax.fallback
        ? { fallback: true, fallback_reason: "Tax provider unavailable - using configured rate" }
        : {}),
    },
    error: null,
  });
});
