import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("messaging evidence boundary", () => {
  const migration = read("supabase/migrations/20260911140000_messaging_evidence_boundary.sql");

  it("removes browser writes from message delivery evidence", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.message_logs from authenticated",
    );
    expect(migration).toContain(
      "drop policy if exists message_logs_staff_insert on public.message_logs",
    );
  });

  it("removes browser writes from consent and suppression evidence", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.messaging_consents from authenticated",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on table public.messaging_suppressions from authenticated",
    );
  });

  it("preserves scoped authenticated reads", () => {
    expect(migration).toContain(
      "grant select on table public.message_logs to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.messaging_consents to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.messaging_suppressions to authenticated",
    );
  });

  it("keeps current canonical writes server-side", () => {
    const lifecycle = read("src/server/messaging/lifecycle-sender.ts");
    const booking = read("app/api/v1/public-booking/[slug]/confirmation/route.ts");
    const invoice = read("app/api/v1/invoices/[id]/send/route.ts");
    expect(lifecycle).toContain("createSupabaseAdminClient");
    expect(booking).toContain("createSupabaseAdminClient");
    expect(invoice).toContain("createSupabaseAdminClient");
  });
});
