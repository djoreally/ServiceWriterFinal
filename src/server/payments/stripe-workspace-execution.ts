import crypto from "node:crypto";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type StripePaymentMode = "connect" | "direct";

type StripeDirectCredentialBundle = {
  accountId: string;
  apiKey: string;
  webhookSecret: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function encryptionKey(): Buffer {
  const raw = required("PAYMENT_CREDENTIAL_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encryptPaymentCredential(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPaymentCredential(envelope: string): string {
  const [version, ivPart, tagPart, cipherPart] = envelope.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !cipherPart) {
    throw new Error("Invalid encrypted payment credential envelope");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encodeDirectCredentialBundle(bundle: StripeDirectCredentialBundle): string {
  return encryptPaymentCredential(JSON.stringify(bundle));
}

function decodeDirectCredentialBundle(envelope: string): StripeDirectCredentialBundle {
  const parsed = JSON.parse(decryptPaymentCredential(envelope)) as Partial<StripeDirectCredentialBundle>;
  if (
    typeof parsed.accountId !== "string" ||
    !parsed.accountId.startsWith("acct_") ||
    typeof parsed.apiKey !== "string" ||
    !parsed.apiKey.startsWith("sk_") ||
    typeof parsed.webhookSecret !== "string" ||
    !parsed.webhookSecret.startsWith("whsec_")
  ) {
    throw new Error("Stored Stripe direct credential payload is invalid");
  }
  return parsed as StripeDirectCredentialBundle;
}

function withoutLegacyDirectSecrets(operationalSettings: unknown): Record<string, unknown> {
  const next = { ...object(operationalSettings) };
  delete next.stripe_direct_secret_encrypted;
  delete next.stripe_direct_webhook_secret_encrypted;
  return next;
}

async function loadStoredDirectCredential(workspaceId: string): Promise<StripeDirectCredentialBundle | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("provider_connection_secrets")
    .select("credential_payload_encrypted")
    .eq("workspace_id", workspaceId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error) throw error;
  const encrypted = text(data?.credential_payload_encrypted);
  return encrypted ? decodeDirectCredentialBundle(encrypted) : null;
}

async function migrateLegacyDirectCredential(
  workspaceId: string,
  operationalSettings: unknown,
): Promise<StripeDirectCredentialBundle | null> {
  const operational = object(operationalSettings);
  const accountId = text(operational.stripe_direct_account_id);
  const encryptedApiKey = text(operational.stripe_direct_secret_encrypted);
  const encryptedWebhookSecret = text(operational.stripe_direct_webhook_secret_encrypted);
  if (!accountId || !encryptedApiKey || !encryptedWebhookSecret) return null;

  const bundle: StripeDirectCredentialBundle = {
    accountId,
    apiKey: decryptPaymentCredential(encryptedApiKey),
    webhookSecret: decryptPaymentCredential(encryptedWebhookSecret),
  };
  await saveStripeDirectCredentials(workspaceId, bundle.accountId, bundle.apiKey, bundle.webhookSecret);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("workspace_settings")
    .update({ operational_settings: withoutLegacyDirectSecrets(operationalSettings) })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return bundle;
}

async function directCredentialBundle(
  workspaceId: string,
  operationalSettings: unknown,
): Promise<StripeDirectCredentialBundle | null> {
  return await loadStoredDirectCredential(workspaceId)
    ?? await migrateLegacyDirectCredential(workspaceId, operationalSettings);
}

export async function saveStripeDirectCredentials(
  workspaceId: string,
  accountId: string,
  apiKey: string,
  webhookSecret: string,
) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("provider_connection_secrets")
    .upsert({
      workspace_id: workspaceId,
      provider: "stripe",
      credential_payload_encrypted: encodeDirectCredentialBundle({ accountId, apiKey, webhookSecret }),
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider" });
  if (error) throw error;
}

export async function deleteStripeDirectCredentials(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("provider_connection_secrets")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", "stripe");
  if (error) throw error;
}

export async function hasStripeDirectCredentials(workspaceId: string, operationalSettings: unknown): Promise<boolean> {
  return Boolean(await directCredentialBundle(workspaceId, operationalSettings));
}

export interface StripeWorkspaceExecution {
  mode: StripePaymentMode;
  stripe: Stripe;
  accountId: string;
  requestOptions(idempotencyKey?: string): Stripe.RequestOptions;
}

export function stripePaymentMode(operationalSettings: unknown): StripePaymentMode {
  const operational = object(operationalSettings);
  return operational.stripe_payment_mode === "direct" ? "direct" : "connect";
}

export async function directWebhookSecret(workspaceId: string, operationalSettings: unknown): Promise<string | null> {
  const bundle = await directCredentialBundle(workspaceId, operationalSettings);
  return bundle?.webhookSecret ?? null;
}

export async function resolveStripeWorkspaceExecution(
  workspaceId: string,
  operationalSettings: unknown,
): Promise<StripeWorkspaceExecution> {
  const operational = object(operationalSettings);
  const mode = stripePaymentMode(operational);

  if (mode === "direct") {
    const accountId = text(operational.stripe_direct_account_id);
    const bundle = await directCredentialBundle(workspaceId, operationalSettings);
    if (!bundle || !accountId) {
      throw new Error("Stripe direct mode is selected but the workspace credential is not configured.");
    }
    if (bundle.accountId !== accountId) {
      throw new Error("Stored Stripe direct credentials do not match the configured account.");
    }
    const stripe = new Stripe(bundle.apiKey);
    return {
      mode,
      stripe,
      accountId,
      requestOptions: (idempotencyKey) => idempotencyKey ? { idempotencyKey } : {},
    };
  }

  const accountId = text(operational.stripe_account_id);
  if (!accountId) {
    throw new Error("Stripe Connect is selected but no connected Stripe account is stored for this workspace.");
  }
  const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
  return {
    mode,
    stripe,
    accountId,
    requestOptions: (idempotencyKey) => ({
      stripeAccount: accountId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  };
}
