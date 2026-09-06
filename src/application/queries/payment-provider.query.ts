/** Payment Provider Query — canonical workspace-scoped provider settings. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function fetchPaymentProvider() {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  // Generated Supabase types still lag the canonical workspace_settings schema.
  const db = supabase as any;
  const { data: settings, error } = await db
    .from("workspace_settings")
    .select("payment_provider,operational_settings")
    .eq("workspace_id", context.workspaceId)
    .single();
  if (error) throw error;

  const operational = object(settings?.operational_settings);
  return {
    provider: settings?.payment_provider ?? "none",
    stripeStatus: {
      connected: typeof operational.stripe_account_id === "string" && operational.stripe_account_id.length > 0,
      chargesEnabled: operational.stripe_charges_enabled === true,
      payoutsEnabled: operational.stripe_payouts_enabled === true,
      detailsSubmitted: operational.stripe_onboarding_complete === true,
      accountId: typeof operational.stripe_account_id === "string" ? operational.stripe_account_id : undefined,
    },
    squareStatus: {
      connected: operational.square_connected === true || typeof operational.square_merchant_id === "string",
      chargesEnabled: operational.square_charges_enabled === true,
      merchantId: typeof operational.square_merchant_id === "string" ? operational.square_merchant_id : null,
      locationId: typeof operational.square_location_id === "string" ? operational.square_location_id : null,
      onboardingComplete: operational.square_onboarding_complete === true,
      accountStatus: typeof operational.square_account_status === "string" ? operational.square_account_status : undefined,
      tokenExpiringSoon: operational.square_token_expiring_soon === true,
    },
  };
}
