import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const DEAD_PROVIDER_FUNCTIONS = [
  "stripe-connect-onboard",
  "stripe-connect-status",
  "square-connect-onboard",
];

const ACTIVE_PROVIDER_CLIENTS = [
  "src/application/commands/payment-provider.command.ts",
  "src/application/queries/payment-provider.query.ts",
  "src/application/queries/stripe-connect.query.ts",
  "src/application/commands/onboarding.command.ts",
  "src/components/settings/PaymentProviderCard.tsx",
];

// Architecture note: provider clients no longer invoke Supabase edge
// functions directly. They call the canonical Hono API, and the Hono
// routes proxy/invoke the same deployed edge functions server-side.
// These assertions pin the contract at its current locations.
describe("provider integration edge contract", () => {
  it("keeps all active payment connection flows on the deployed canonical service", () => {
    const combined = ACTIVE_PROVIDER_CLIENTS.map(read).join("\n");
    for (const deadName of DEAD_PROVIDER_FUNCTIONS) {
      expect(combined).not.toContain(deadName);
    }
    expect(read("src/application/commands/payment-provider.command.ts")).toContain('"/v1/billing/payment-provider/connect"');
    expect(read("src/server/hono/routes/billing.ts")).toContain('proxyEdgeFunction(c, "payment-provider-connect"');
    expect(fs.existsSync(path.join(root, "supabase/functions/payment-provider-connect/index.ts"))).toBe(true);
  });

  it("keeps Calendar on an owned edge function and preserves exact backend errors", () => {
    const command = read("src/application/commands/google-calendar.command.ts");
    expect(command).toContain('"/v1/platform/google-calendar/invoke"');
    const route = read("src/server/hono/routes/platform.ts");
    expect(route).toContain('invokeEdgeFunction(c, "google-calendar-sync"');
    // The route surfaces the edge function's own error message verbatim
    // instead of replacing it with a generic failure.
    expect(route).toContain("parsed.error");
    expect(fs.existsSync(path.join(root, "supabase/functions/google-calendar-sync/index.ts"))).toBe(true);
  });

  it("does not treat legacy workspace provider ids as verified connection evidence", () => {
    // Enforced by the Hono billing route backing the provider query: only
    // provider_connections rows with status "connected" count as evidence.
    const route = read("src/server/hono/routes/billing.ts");
    expect(route).toContain('from("provider_connections")');
    expect(route).toContain('row.status === "connected"');
    expect(read("src/application/queries/payment-provider.query.ts")).toContain('"/v1/billing/payment-provider"');
  });
});
