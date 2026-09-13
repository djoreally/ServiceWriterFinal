import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("invitation delivery evidence boundary", () => {
  const migration = read("supabase/migrations/20260911130000_invitation_delivery_boundary.sql");

  it("removes browser access to delivery-attempt evidence", () => {
    expect(migration).toContain(
      "revoke all on table public.invitation_delivery_attempts",
    );
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("keeps service-role access for server throttling and audit", () => {
    expect(migration).toContain(
      "on table public.invitation_delivery_attempts",
    );
    expect(migration).toContain("to service_role");
  });

  it("moves rate-limit reads to the admin client", () => {
    const route = read("app/api/v1/invitations/route.ts");
    expect(route).toContain("const admin = createSupabaseAdminClient()");
    expect(route).toContain('admin\n    .from("invitation_delivery_attempts")');
    expect(route).not.toContain("assertSendRateLimit(supabase");
  });
});
