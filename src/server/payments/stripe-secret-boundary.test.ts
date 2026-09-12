import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Stripe direct credential boundary", () => {
  it("stores provider credentials only in the server-only secret table", () => {
    const execution = read("src/server/payments/stripe-workspace-execution.ts");
    expect(execution).toContain('.from("provider_connection_secrets")');
    expect(execution).toContain("credential_payload_encrypted");
    expect(execution).toContain("saveStripeDirectCredentials");
    expect(execution).toContain("migrateLegacyDirectCredential");
  });

  it("does not persist direct secrets in workspace operational settings", () => {
    const route = read("app/api/v1/payments/stripe-direct/route.ts");
    expect(route).not.toContain("stripe_direct_secret_encrypted: encryptPaymentCredential");
    expect(route).not.toContain("stripe_direct_webhook_secret_encrypted: encryptPaymentCredential");
    expect(route).toContain("scrubLegacySecretFields");
    expect(route).toContain("saveStripeDirectCredentials");
  });

  it("requires browser roles to have no table privileges on provider secrets", () => {
    const migration = read("supabase/migrations/20260911050000_payment_provider_secret_boundary.sql");
    expect(migration).toContain("revoke all on table public.provider_connection_secrets from anon, authenticated");
    expect(migration).toContain("credential_payload_encrypted");
  });
});
