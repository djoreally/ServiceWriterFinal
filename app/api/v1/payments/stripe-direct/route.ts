import Stripe from "stripe";
import { z } from "zod";
import { ApiError, errorResponse, json, requireWorkspacePaymentsAddon } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  deleteStripeDirectCredentials,
  hasStripeDirectCredentials,
  saveStripeDirectCredentials,
} from "@/server/payments/stripe-workspace-execution";

export const runtime = "nodejs";

const configureSchema = z.object({
  workspace_id: z.string().uuid(),
  account_id: z.string().startsWith("acct_"),
  secret_key: z.string().min(20),
  webhook_secret: z.string().min(10),
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function directStatus(operational: Record<string, unknown>, credentialConfigured: boolean) {
  return {
    mode: operational.stripe_payment_mode === "direct" ? "direct" : "connect",
    configured: credentialConfigured && typeof operational.stripe_direct_account_id === "string",
    accountId: typeof operational.stripe_direct_account_id === "string" ? operational.stripe_direct_account_id : null,
    keyLast4: typeof operational.stripe_direct_key_last4 === "string" ? operational.stripe_direct_key_last4 : null,
    chargesEnabled: operational.stripe_direct_charges_enabled === true,
    payoutsEnabled: operational.stripe_direct_payouts_enabled === true,
    detailsSubmitted: operational.stripe_direct_details_submitted === true,
    webhookConfigured: credentialConfigured,
    checkedAt: typeof operational.stripe_direct_checked_at === "string" ? operational.stripe_direct_checked_at : null,
  };
}

async function readSettings(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workspace_settings")
    .select("payment_provider,operational_settings")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return { admin, settings: data };
}

function scrubLegacySecretFields(operational: Record<string, unknown>) {
  const next = { ...operational };
  delete next.stripe_direct_secret_encrypted;
  delete next.stripe_direct_webhook_secret_encrypted;
  return next;
}

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new ApiError(400, "workspace_id is required", "invalid_workspace");
    await requireWorkspacePaymentsAddon(workspaceId, undefined, request);
    const { settings } = await readSettings(workspaceId);
    const operational = object(settings.operational_settings);
    const credentialConfigured = await hasStripeDirectCredentials(workspaceId, operational);
    return json({ data: directStatus(operational, credentialConfigured) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = configureSchema.parse(await request.json());
    await requireWorkspacePaymentsAddon(body.workspace_id, ["owner", "admin", "platform_admin"], request);

    if (!body.secret_key.startsWith("sk_")) {
      throw new ApiError(400, "Enter a valid Stripe secret API key", "invalid_stripe_key");
    }
    if (!body.webhook_secret.startsWith("whsec_")) {
      throw new ApiError(400, "Enter a valid Stripe webhook signing secret", "invalid_webhook_secret");
    }

    const stripe = new Stripe(body.secret_key);
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(body.account_id);
    } catch (error) {
      console.error("[stripe-direct] credential validation failed", error);
      throw new ApiError(400, "Stripe rejected this account ID / API key combination", "stripe_key_rejected");
    }
    if (account.id !== body.account_id) {
      throw new ApiError(400, "Stripe account ID does not match the validated account", "stripe_account_mismatch");
    }

    const { admin, settings } = await readSettings(body.workspace_id);
    const operational = scrubLegacySecretFields(object(settings.operational_settings));
    const checkedAt = new Date().toISOString();

    await saveStripeDirectCredentials(body.workspace_id, account.id, body.secret_key, body.webhook_secret);

    const nextOperational = {
      ...operational,
      stripe_payment_mode: "direct",
      stripe_direct_account_id: account.id,
      stripe_direct_key_last4: body.secret_key.slice(-4),
      stripe_direct_charges_enabled: account.charges_enabled === true,
      stripe_direct_payouts_enabled: account.payouts_enabled === true,
      stripe_direct_details_submitted: account.details_submitted === true,
      stripe_direct_checked_at: checkedAt,
    };

    const { error: updateError } = await admin
      .from("workspace_settings")
      .update({ payment_provider: "stripe", operational_settings: nextOperational })
      .eq("workspace_id", body.workspace_id);
    if (updateError) throw updateError;

    return json({ data: directStatus(nextOperational, true) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new ApiError(400, "workspace_id is required", "invalid_workspace");
    await requireWorkspacePaymentsAddon(workspaceId, ["owner", "admin", "platform_admin"], request);

    const { admin, settings } = await readSettings(workspaceId);
    const nextOperational = scrubLegacySecretFields(object(settings.operational_settings));
    for (const key of [
      "stripe_direct_account_id",
      "stripe_direct_key_last4",
      "stripe_direct_charges_enabled",
      "stripe_direct_payouts_enabled",
      "stripe_direct_details_submitted",
      "stripe_direct_checked_at",
    ]) {
      delete nextOperational[key];
    }
    nextOperational.stripe_payment_mode = "connect";

    await deleteStripeDirectCredentials(workspaceId);

    const { error } = await admin
      .from("workspace_settings")
      .update({ operational_settings: nextOperational })
      .eq("workspace_id", workspaceId);
    if (error) throw error;

    return json({ data: directStatus(nextOperational, false) });
  } catch (error) {
    return errorResponse(error);
  }
}
