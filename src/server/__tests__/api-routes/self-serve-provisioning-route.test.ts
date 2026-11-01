import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the self-serve provisioning Hono route.
// The route must stay a thin session-authenticated wrapper over the
// provision_owner_workspace_v1 RPC — the same route → RPC shape as
// invitation acceptance — so authorization lives at the database
// boundary (the RPC reads auth.uid()) and never in client code.
describe("self-serve provisioning route", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/server/hono/routes/platform.ts"),
    "utf8",
  );
  const routeStart = source.indexOf('"/v1/platform/workspaces/provision-owner"');
  const routeSection = source.slice(routeStart, routeStart + 1600);

  it("registers the route", () => {
    expect(routeStart).toBeGreaterThan(-1);
    expect(source).toContain('platformRouter.post("/v1/platform/workspaces/provision-owner"');
  });

  it("requires the caller's session before doing anything", () => {
    expect(routeSection).toContain("await requireAuth(c)");
  });

  it("calls the provisioning RPC with the session client so auth.uid() resolves", () => {
    expect(routeSection).toContain('(supabase as any).rpc("provision_owner_workspace_v1"');
    expect(routeSection).toContain("p_business_name: body.businessName");
    expect(routeSection).toContain("p_timezone: body.timezone ?? null");
    expect(routeSection).toContain("p_terms_version: body.termsVersion ?? null");
    expect(routeSection).toContain("p_privacy_version: body.privacyVersion ?? null");
  });

  it("validates the request body with zod bounds", () => {
    expect(source).toContain("businessName: z.string().trim().min(1).max(160)");
  });

  it("maps the RPC's guard errors to honest HTTP errors", () => {
    expect(routeSection).toContain('new ApiError(401, message, "not_authenticated")');
    expect(routeSection).toContain('new ApiError(400, message, "business_name_required")');
  });
});
