import crypto from "node:crypto";
import Stripe from "stripe";

export type StripePaymentMode = "connect" | "direct";

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

export function directWebhookSecret(operationalSettings: unknown): string | null {
  const operational = object(operationalSettings);
  const encrypted = text(operational.stripe_direct_webhook_secret_encrypted);
  return encrypted ? decryptPaymentCredential(encrypted) : null;
}

export function resolveStripeWorkspaceExecution(operationalSettings: unknown): StripeWorkspaceExecution {
  const operational = object(operationalSettings);
  const mode = stripePaymentMode(operational);

  if (mode === "direct") {
    const encryptedSecret = text(operational.stripe_direct_secret_encrypted);
    const accountId = text(operational.stripe_direct_account_id);
    if (!encryptedSecret || !accountId) {
      throw new Error("Stripe direct mode is selected but the workspace credential is not configured.");
    }
    const stripe = new Stripe(decryptPaymentCredential(encryptedSecret));
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
