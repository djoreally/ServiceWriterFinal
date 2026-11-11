/**
 * Schema contract for GET /v1/dispatch/settings (phantom fix, 2026-11-10).
 *
 * The handler's business_profiles select included `default_technician_id`,
 * which does not exist in production (live census 2026-11-10:
 * business_profiles has 157 columns and no default_technician_id; no repo
 * migration adds it). PostgREST rejected the whole select (42703), so the
 * Settings → Team → Dispatch automation panel could not load its config
 * for any workspace.
 *
 * Heal: the phantom column is dropped from the select. Nothing else reads
 * it — the client's DispatchSettingsRow never carried the field, and the
 * PATCH path (upsertBusinessProfile) is unchanged.
 *
 * This guard pins the select's columns against the live census set,
 * because mocked-supabase tests cannot see this defect class (the Strip
 * S2 lesson, same as the mobile-state and tech-app workspace guards).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/appointments.ts"),
  "utf8",
);

// Live business_profiles columns (census 2026-11-10, 157 columns).
const LIVE_BUSINESS_PROFILE_COLUMNS: ReadonlySet<string> = new Set([
    "accept_deposits", "address", "allow_cancellation", "allow_multi_day_bookings",
    "allow_rescheduling", "appointment_reminder_hours", "auto_dispatch_enabled", "booking_enabled",
    "booking_slug", "brand_background_color", "brand_font_family", "brand_primary_color",
    "brand_secondary_color", "buffer_time_after", "buffer_time_before", "business_name",
    "cancellation_window_hours", "carfax_activated", "carfax_activation_date", "carfax_location_id",
    "cash_drawer_config", "cash_drawer_enabled", "cash_drawer_open_on_cash_payment", "cash_drawer_require_reason",
    "cash_drawer_type", "city", "closing_time", "cover_image_url",
    "created_at", "currency", "date_format", "day_hours",
    "default_labor_rate", "default_tax_nexus_state", "deleted_at", "deleted_by",
    "deleted_reason", "deposit_percentage", "dispatch_fleet_performance_threshold", "dispatch_weight_distance",
    "dispatch_weight_fairness", "dispatch_weight_load", "dispatch_weight_performance", "dispatch_weight_route",
    "elevenlabs_agent_id", "email", "google_review_url", "id",
    "location_tax_enabled", "logo_url", "marketing_email_enabled", "marketing_email_footer",
    "marketing_email_monthly_limit", "marketing_email_sent_this_period", "marketplace_accept_new_customers", "marketplace_allow_same_day",
    "marketplace_auto_accept", "marketplace_description", "marketplace_max_jobs_per_day", "marketplace_opt_in",
    "marketplace_service_area_zips", "max_advance_days", "min_labor_hours", "min_lead_time_hours",
    "min_platform_fee_cents", "oil_price_per_quart", "onboarding_completed", "onboarding_step",
    "opening_time", "owner_name", "parts_markup_percent", "payment_provider",
    "phone", "phone_as_coupon_enabled", "phone_coupon_description", "phone_coupon_discount_type",
    "phone_coupon_discount_value", "phone_coupon_min_order_amount", "platform_fee_bps", "postal_code",
    "qbo_access_token_encrypted", "qbo_connected_at", "qbo_enabled", "qbo_income_account_id",
    "qbo_last_sync_at", "qbo_realm_id", "qbo_refresh_token_encrypted", "qbo_sync_customers",
    "qbo_sync_invoices", "qbo_sync_payments", "qbo_token_expires_at", "receptionist_first_message",
    "receptionist_phone_number", "receptionist_phone_number_id", "receptionist_provisioned_at", "receptionist_status",
    "receptionist_system_prompt", "receptionist_voice_id", "require_approval", "require_terms_acceptance",
    "reschedule_window_hours", "review_request_delay_hours", "service_address", "service_coordinates",
    "service_radius_miles", "service_reminder_months", "service_verticals", "shop_fee_description",
    "shop_fee_enabled", "shop_fee_type", "shop_fee_value", "shop_supplies_percent",
    "slot_duration_minutes", "sms_a2p_status", "sms_default_from_number", "sms_low_balance_threshold",
    "sms_marketing_enabled", "sms_messaging_service_sid", "sms_monthly_included_segments", "sms_overage_enabled",
    "sms_segments_remaining", "sms_sender_id", "sms_transactional_enabled", "square_access_token_encrypted",
    "square_account_status", "square_charges_enabled", "square_location_id", "square_merchant_id",
    "square_onboarding_complete", "square_refresh_token_encrypted", "square_token_expires_at", "state",
    "stripe_account_id", "stripe_account_status", "stripe_charges_enabled", "stripe_onboarding_complete",
    "stripe_payouts_enabled", "surcharge_description", "surcharge_enabled", "surcharge_type",
    "surcharge_value", "tax_provider", "tax_provider_api_key", "tax_rate",
    "technician_customer_messaging_enabled", "terminology", "terms_and_conditions", "timezone",
    "updated_at", "waste_oil_fee", "waste_oil_fee_enabled", "weather_guard_enabled",
    "weather_guard_settings", "website_url", "working_days", "workspace_id",
    "yelp_review_url",
]);

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("appointmentsRouter.", start + registration.length);
  if (end < 0) throw new Error(`handler is unterminated: ${registration}`);
  return SOURCE.slice(start, end);
}

const handler = handlerSource('appointmentsRouter.get("/v1/dispatch/settings"');

function settingsSelect(): string {
  const fromIdx = handler.indexOf('.from("business_profiles")');
  if (fromIdx < 0) throw new Error("settings handler has no business_profiles query");
  const select = handler.slice(fromIdx).match(/\.select\(\s*"([^"]+)"/);
  if (!select) throw new Error("settings business_profiles query has no select");
  return select[1];
}

describe("GET /v1/dispatch/settings business_profiles select", () => {
  it("is registered exactly once", () => {
    const occurrences = SOURCE.split('"/v1/dispatch/settings"').length - 1;
    // One GET registration + one PATCH registration share the path string.
    expect(occurrences).toBe(2);
  });

  it("selects only live business_profiles columns", () => {
    const parts = settingsSelect().split(",").map((c) => c.trim());
    for (const col of parts) {
      expect(LIVE_BUSINESS_PROFILE_COLUMNS.has(col)).toBe(true);
    }
  });

  it("does not select the phantom default_technician_id", () => {
    expect(settingsSelect()).not.toContain("default_technician_id");
    expect(LIVE_BUSINESS_PROFILE_COLUMNS.has("default_technician_id")).toBe(false);
  });

  it("still selects every dispatch setting the panel renders", () => {
    const parts = settingsSelect().split(",").map((c) => c.trim());
    expect(parts).toEqual([
      "auto_dispatch_enabled",
      "dispatch_weight_distance",
      "dispatch_weight_load",
      "dispatch_weight_performance",
      "dispatch_weight_fairness",
      "dispatch_weight_route",
      "dispatch_fleet_performance_threshold",
    ]);
  });

  it("stays workspace-scoped via the server-resolved workspace", () => {
    expect(handler).toContain('.eq("workspace_id", workspaceId)');
    expect(handler).toContain("resolveCallerWorkspaceId(supabase, user.id)");
  });
});
