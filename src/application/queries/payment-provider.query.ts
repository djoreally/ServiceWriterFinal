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

  // Generated Supabase types still lag the canonical integration schema.
  const db = supabase as any;
  const [{ data: settings, error: settingsError }, { data: connections, error: connectionsError }] = await Promise.all([
    db.from("workspace_settings")
      .select("payment_provider,operational_settings")
      .eq("workspace_id", context.workspaceId)
      .single(),
    db.from("provider_connections")
      .select("provider,external_account_id,status,metadata,last_synced_at")
      .eq("workspace_id", context.workspaceId)
      .in("provider", ["stripe", "square"]),
  ]);
  if (settingsError) throw settingsError;
  if (connectionsError) throw connectionsError;

  const operational = object(settings?.operational_settings);
  const stripeConnection = (connections ?? []).find((row: any) => row.provider === "stripe" && row.status === "connected");
  const squareConnection = (connections ?? []).find((row: any) => row.provider === "square" && row.status === "connected");
  const stripeMetadata = object(stripeConnection?.metadata);
  const squareMetadata = object(squareConnection?.metadata);

  return {
    provider: settings?.payment_provider ?? "none",
    stripeStatus: {
      connected: Boolean(stripeConnection?.external_account_id),
      chargesEnabled: stripeMetadata.charges_enabled === true && operational.stripe_charges_enabled === true,
      payoutsEnabled: stripeMetadata.payouts_enabled === true && operational.stripe_payouts_enabled === true,
      detailsSubmitted: stripeMetadata.details_submitted === true || operational.stripe_details_submitted === true || operational.stripe_onboarding_complete === true,
      accountId: typeof stripeConnection?.external_account_id === "string" ? stripeConnection.external_account_id : undefined,
    },
    squareStatus: {
      connected: Boolean(squareConnection?.external_account_id),
      chargesEnabled: operational.square_charges_enabled === true,
      merchantId: typeof squareConnection?.external_account_id === "string" ? squareConnection.external_account_id : null,
      locationId: typeof squareMetadata.location_id === "string" ? squareMetadata.location_id : (typeof operational.square_location_id === "string" ? operational.square_location_id : null),
      onboardingComplete: operational.square_onboarding_complete === true,
      accountStatus: typeof operational.square_account_status === "string" ? operational.square_account_status : undefined,
      tokenExpiringSoon: operational.square_token_expiring_soon === true,
    },
  };
}
