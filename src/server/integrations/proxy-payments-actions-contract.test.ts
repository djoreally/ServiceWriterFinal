import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

// Regression contract: proxy.ts used to rewrite /api/v1/payments/actions to
// /api/v1/payments/actions-entitled, a route that does not exist, so every
// payment action (manual payment, refund, payment link) 404'd in production.
// The handlers enforce the Payments add-on entitlement themselves
// (requireWorkspacePaymentsAddon / requireWorkspacePaymentsAddonAuth), so the
// rewrite must never come back.
describe("proxy payments actions contract", () => {
  it("does not rewrite payment actions to the nonexistent entitled route", () => {
    const proxy = read("proxy.ts");
    expect(proxy).not.toContain("actions-entitled");
    expect(proxy).not.toContain("/api/v1/payments/actions");
  });

  it("keeps the real payment-action handlers registered at the canonical path", () => {
    expect(read("src/server/hono/routes/billing.ts")).toContain('billingRouter.post("/v1/payments/actions"');
    expect(fs.existsSync(path.join(root, "app/api/v1/payments/actions/route.ts"))).toBe(true);
  });
});
