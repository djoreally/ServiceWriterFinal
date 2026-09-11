import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("invitation audit boundary", () => {
  const migration = read("supabase/migrations/20260911120000_invitation_audit_boundary.sql");

  it("removes authenticated invitation-event mutation privileges", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.invitation_events from authenticated",
    );
    expect(migration).toContain(
      "drop policy if exists invitation_events_admin_insert on public.invitation_events",
    );
  });

  it("preserves authorized browser reads", () => {
    expect(migration).toContain(
      "grant select on table public.invitation_events to authenticated",
    );
  });

  it("routes invitation audit inserts through the server admin client", () => {
    const createRoute = read("app/api/v1/invitations/route.ts");
    const resendRoute = read("app/api/v1/invitations/[id]/resend/route.ts");
    expect(createRoute).toContain('admin.from("invitation_events").insert');
    expect(resendRoute).toContain('admin.from("invitation_events").insert');
  });
});
