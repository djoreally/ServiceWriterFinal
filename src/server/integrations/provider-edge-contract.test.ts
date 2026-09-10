import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

describe("provider integration edge contract", () => {
  it("keeps all active payment connection flows on the deployed canonical service", () => {
    const combined = ACTIVE_PROVIDER_CLIENTS.map(read).join("\n");
    for (const deadName of DEAD_PROVIDER_FUNCTIONS) {
      expect(combined).not.toContain(deadName);
    }
    expect(read("src/application/commands/payment-provider.command.ts")).toContain('functions.invoke("payment-provider-connect"');
    expect(fs.existsSync(path.join(root, "supabase/functions/payment-provider-connect/index.ts"))).toBe(true);
  });

  it("keeps Calendar on an owned edge function and preserves exact backend errors", () => {
    const command = read("src/application/commands/google-calendar.command.ts");
    expect(command).toContain('functions.invoke("google-calendar-sync"');
    expect(command).toContain("context?: { text?: () => Promise<string> }");
    expect(fs.existsSync(path.join(root, "supabase/functions/google-calendar-sync/index.ts"))).toBe(true);
  });

  it("does not treat legacy workspace provider ids as verified connection evidence", () => {
    const query = read("src/application/queries/payment-provider.query.ts");
    expect(query).toContain('from("provider_connections")');
    expect(query).toContain('row.status === "connected"');
  });
});
