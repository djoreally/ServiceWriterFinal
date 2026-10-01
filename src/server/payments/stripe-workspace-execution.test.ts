import {
  decryptPaymentCredential,
  directWebhookSecret,
  encryptPaymentCredential,
  resolveStripeWorkspaceExecution,
  stripePaymentMode,
} from "@/server/payments/stripe-workspace-execution";

const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64");

// Corrupt the first character: every bit of the first base64url char is
// significant, unlike the last char which may only carry padding bits.
function corruptChar(segment: string): string {
  const first = segment[0];
  return (first === "A" ? "B" : "A") + segment.slice(1);
}

describe("encrypt/decrypt payment credentials", () => {
  beforeEach(() => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  });

  it("round-trips plaintext including unicode and long values", () => {
    for (const value of ["sk_live_abc123", "héllo wörld 🔑", "x".repeat(5000)]) {
      expect(decryptPaymentCredential(encryptPaymentCredential(value))).toBe(value);
    }
  });

  it("rejects the empty-plaintext envelope (empty ciphertext segment is invalid)", () => {
    // encrypt("") yields "v1.<iv>.<tag>." and decrypt() requires a non-empty
    // ciphertext segment, so empty plaintext does not round-trip.
    expect(() => decryptPaymentCredential(encryptPaymentCredential(""))).toThrow(
      "Invalid encrypted payment credential envelope",
    );
  });

  it("produces a versioned envelope with distinct ciphertext per encryption", () => {
    const first = encryptPaymentCredential("same-secret");
    const second = encryptPaymentCredential("same-secret");
    expect(first).not.toBe(second);
    expect(first.split(".")).toHaveLength(4);
    expect(first.startsWith("v1.")).toBe(true);
  });

  it("throws when the ciphertext is tampered with", () => {
    const envelope = encryptPaymentCredential("secret");
    const [version, iv, tag, cipher] = envelope.split(".");
    expect(() => decryptPaymentCredential(`${version}.${iv}.${tag}.${corruptChar(cipher)}`)).toThrow();
  });

  it("throws when the auth tag is tampered with", () => {
    const envelope = encryptPaymentCredential("secret");
    const [version, iv, tag, cipher] = envelope.split(".");
    expect(() => decryptPaymentCredential(`${version}.${iv}.${corruptChar(tag)}.${cipher}`)).toThrow();
  });

  it("rejects envelopes with a wrong version or malformed shape", () => {
    const valid = encryptPaymentCredential("secret");
    expect(() => decryptPaymentCredential(`v2.${valid.slice(3)}`)).toThrow(
      "Invalid encrypted payment credential envelope",
    );
    for (const malformed of ["", "v1", "v1.a.b", "v1..b.c", "not-an-envelope"]) {
      expect(() => decryptPaymentCredential(malformed)).toThrow(
        "Invalid encrypted payment credential envelope",
      );
    }
  });

  it("throws when the encryption key is missing", () => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => encryptPaymentCredential("secret")).toThrow("PAYMENT_CREDENTIAL_ENCRYPTION_KEY is required");
    expect(() => decryptPaymentCredential("v1.a.b.c")).toThrow("PAYMENT_CREDENTIAL_ENCRYPTION_KEY is required");
  });

  it("throws when the key is not a base64-encoded 32-byte key", () => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptPaymentCredential("secret")).toThrow(
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  });
});

describe("stripePaymentMode", () => {
  it("returns direct only for the direct marker", () => {
    expect(stripePaymentMode({ stripe_payment_mode: "direct" })).toBe("direct");
  });

  it("defaults to connect for missing, connect, or unexpected values", () => {
    expect(stripePaymentMode({})).toBe("connect");
    expect(stripePaymentMode({ stripe_payment_mode: "connect" })).toBe("connect");
    expect(stripePaymentMode({ stripe_payment_mode: "banana" })).toBe("connect");
    expect(stripePaymentMode(null)).toBe("connect");
    expect(stripePaymentMode("direct")).toBe("connect");
  });
});

describe("directWebhookSecret", () => {
  beforeEach(() => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  });

  it("decrypts the stored webhook secret", () => {
    const encrypted = encryptPaymentCredential("whsec_abc");
    expect(directWebhookSecret({ stripe_direct_webhook_secret_encrypted: encrypted })).toBe("whsec_abc");
  });

  it("returns null when no webhook secret is stored", () => {
    expect(directWebhookSecret({})).toBeNull();
    expect(directWebhookSecret({ stripe_direct_webhook_secret_encrypted: "" })).toBeNull();
    expect(directWebhookSecret({ stripe_direct_webhook_secret_encrypted: 42 })).toBeNull();
    expect(directWebhookSecret(null)).toBeNull();
  });
});

describe("resolveStripeWorkspaceExecution", () => {
  beforeEach(() => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_platform";
  });

  afterEach(() => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("resolves connect mode with the stripe account in request options", () => {
    const execution = resolveStripeWorkspaceExecution({
      stripe_payment_mode: "connect",
      stripe_account_id: "acct_1",
    });
    expect(execution.mode).toBe("connect");
    expect(execution.accountId).toBe("acct_1");
    expect(typeof execution.stripe.customers.retrieve).toBe("function");
    expect(execution.requestOptions()).toEqual({ stripeAccount: "acct_1" });
    expect(execution.requestOptions("key-1")).toEqual({ stripeAccount: "acct_1", idempotencyKey: "key-1" });
  });

  it("defaults to connect when the mode marker is absent", () => {
    const execution = resolveStripeWorkspaceExecution({ stripe_account_id: "acct_1" });
    expect(execution.mode).toBe("connect");
    expect(execution.accountId).toBe("acct_1");
  });

  it("throws in connect mode without a stored account", () => {
    expect(() => resolveStripeWorkspaceExecution({})).toThrow(
      "Stripe Connect is selected but no connected Stripe account is stored for this workspace.",
    );
    expect(() => resolveStripeWorkspaceExecution(null)).toThrow(
      "Stripe Connect is selected but no connected Stripe account is stored for this workspace.",
    );
  });

  it("throws in connect mode without the platform secret key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => resolveStripeWorkspaceExecution({ stripe_account_id: "acct_1" })).toThrow(
      "STRIPE_SECRET_KEY is required",
    );
  });

  it("resolves direct mode with the decrypted secret and no stripe account in options", () => {
    const execution = resolveStripeWorkspaceExecution({
      stripe_payment_mode: "direct",
      stripe_direct_secret_encrypted: encryptPaymentCredential("sk_test_direct"),
      stripe_direct_account_id: "acct_direct",
    });
    expect(execution.mode).toBe("direct");
    expect(execution.accountId).toBe("acct_direct");
    expect(typeof execution.stripe.customers.retrieve).toBe("function");
    expect(execution.requestOptions()).toEqual({});
    expect(execution.requestOptions("key-2")).toEqual({ idempotencyKey: "key-2" });
  });

  it("throws in direct mode without the credential or account id", () => {
    const base = { stripe_payment_mode: "direct", stripe_direct_account_id: "acct_direct" };
    expect(() => resolveStripeWorkspaceExecution(base)).toThrow(
      "Stripe direct mode is selected but the workspace credential is not configured.",
    );
    expect(() =>
      resolveStripeWorkspaceExecution({
        stripe_payment_mode: "direct",
        stripe_direct_secret_encrypted: encryptPaymentCredential("sk_test_direct"),
      }),
    ).toThrow("Stripe direct mode is selected but the workspace credential is not configured.");
  });
});
