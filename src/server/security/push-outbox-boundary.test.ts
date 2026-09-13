import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("push outbox boundary", () => {
  const migration = read("supabase/migrations/20260911090000_push_outbox_worker_boundary.sql");

  it("removes browser access to worker queue rows", () => {
    expect(migration).toContain(
      "revoke all on table public.in_app_notification_push_outbox",
    );
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("keeps service-role worker access", () => {
    expect(migration).toContain(
      "on table public.in_app_notification_push_outbox",
    );
    expect(migration).toContain("to service_role");
  });

  it("drops the historical authenticated select policy", () => {
    expect(migration).toContain(
      "drop policy if exists in_app_notification_push_outbox_select_own",
    );
  });
});
