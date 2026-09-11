import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("operational evidence write boundary", () => {
  const migration = read("supabase/migrations/20260911060000_operational_evidence_write_boundary.sql");

  it("removes browser writes from provider and operational evidence tables", () => {
    for (const table of [
      "webhook_events",
      "message_delivery_events",
      "inbound_messages",
      "audit_events",
    ]) {
      expect(migration).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
    }
  });

  it("keeps provider and operational evidence server-managed", () => {
    for (const table of [
      "webhook_events",
      "message_delivery_events",
      "inbound_messages",
      "audit_events",
    ]) {
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table} to service_role`,
      );
    }
  });

  it("makes CRM audit history browser-readable but not browser-writable", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.crm_audit_events from authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.crm_audit_events to authenticated",
    );
    expect(migration).toContain(
      "drop policy if exists crm_audit_events_insert on public.crm_audit_events",
    );
  });

  it("keeps current canonical webhook writes behind server modules", () => {
    const webhook = read("src/server/messaging/webhook.ts");
    const stripe = read("app/api/webhooks/stripe/route.ts");
    const directStripe = read("app/api/webhooks/stripe/direct/[workspaceId]/route.ts");
    expect(webhook).toContain("createSupabaseAdminClient");
    expect(stripe).toContain("createSupabaseAdminClient");
    expect(directStripe).toContain("createSupabaseAdminClient");
  });
});
