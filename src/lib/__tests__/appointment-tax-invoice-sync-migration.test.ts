import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the phantom tax_amount repair migration
// (20261110160000). History: the Cycle 2 dialog-tax migration
// (20261110101500) headed sync_appointment_invoice_v1's v_tax coalesce
// with v_appt.tax_amount — a column the repo's definitions carry but
// production appointments does not have (17 live columns, verified
// against information_schema 2026-11-10). PL/pgSQL resolves %rowtype
// fields at execution time, so the function created cleanly and then
// raised 42703 (record "v_appt" has no field "tax_amount") on every
// run — and because the appointments_sync_invoice_v1 trigger fires it
// on status/metadata updates, every appointment transition in
// production failed, Start Job included. This migration removes the
// phantom head; the surviving chain (metadata tax_amount, then
// client_tax_amount, then the existing invoice's tax_total, then 0)
// is the pre-Cycle-2 chain and already covers the dialog tax, which
// persists in appointment metadata in production (the appointment
// detail query composes the dialog's tax_amount from
// metadata.tax_amount). Behavior against a live database is proven by
// the post-merge production apply.
describe("sync invoice phantom tax_amount repair migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261110160000_sync_invoice_phantom_tax_amount.sql"),
    "utf8",
  );
  const priorSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261110101500_appointment_tax_invoice_sync.sql"),
    "utf8",
  );
  const originalSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103220000_staff_manual_quote_lock.sql"),
    "utf8",
  );

  function functionBody(source: string): string {
    const start = source.indexOf("create or replace function public.sync_appointment_invoice_v1");
    expect(start).toBeGreaterThanOrEqual(0);
    return source.slice(start).trimEnd();
  }

  // The v_tax assignment statement spans from the
  // "v_tax:=public.money_round_v1(greatest(coalesce(" line through the
  // closing "),0),2);" line.
  function taxAssignment(body: string): string {
    const lines = body.split("\n");
    const start = lines.findIndex((l) => l.includes("v_tax:=public.money_round_v1(greatest(coalesce("));
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > start && l.trim() === "),0),2);");
    expect(end).toBeGreaterThan(start);
    return lines.slice(start, end + 1).join("\n");
  }

  // Remove the v_tax assignment statement so the rest of the body can
  // be compared byte-for-byte against the definition being replaced.
  function withoutTaxAssignment(body: string): string {
    const lines = body.split("\n");
    const start = lines.findIndex((l) => l.includes("v_tax:=public.money_round_v1(greatest(coalesce("));
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > start && l.trim() === "),0),2);");
    expect(end).toBeGreaterThan(start);
    return [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
  }

  it("documents the manual apply order and the functions-only scope", () => {
    expect(sql).toContain("Apply AFTER 20261110101500_appointment_tax_invoice_sync.sql");
    expect(sql).toContain("replaces sync_appointment_invoice_v1 ONLY");
    expect(sql).toContain("File-only until applied manually");
  });

  it("replaces sync_appointment_invoice_v1 exactly once and nothing else", () => {
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
    expect(sql).toContain("create or replace function public.sync_appointment_invoice_v1");
    expect(sql).not.toContain("insert into public.appointments");
    expect(sql.toLowerCase().indexOf("create or replace function")).toBeLessThan(
      sql.toLowerCase().indexOf("insert into public.invoices"),
    );
  });

  describe("sync_appointment_invoice_v1", () => {
    it("never references the phantom appointments.tax_amount column in the function body", () => {
      expect(functionBody(sql)).not.toContain("v_appt.tax_amount");
    });

    it("sources tax from appointment metadata first: tax_amount, then client_tax_amount, then the existing invoice", () => {
      const body = functionBody(sql);
      const metadataIdx = body.indexOf("nullif(v_appt.metadata->>'tax_amount','')::numeric,");
      const clientIdx = body.indexOf("nullif(v_appt.metadata->>'client_tax_amount','')::numeric,");
      const invoiceIdx = body.indexOf("case when found then v_invoice.tax_total else 0 end,");
      expect(metadataIdx).toBeGreaterThanOrEqual(0);
      expect(clientIdx).toBeGreaterThan(metadataIdx);
      expect(invoiceIdx).toBeGreaterThan(clientIdx);
    });

    it("restores the pre-Cycle-2 v_tax assignment byte-for-byte", () => {
      expect(taxAssignment(functionBody(sql))).toBe(taxAssignment(functionBody(originalSql)));
    });

    it("is byte-for-byte identical to the Cycle 2 definition outside the v_tax assignment", () => {
      expect(withoutTaxAssignment(functionBody(sql))).toBe(
        withoutTaxAssignment(functionBody(priorSql)),
      );
    });

    it("keeps the three quote locks and their tax-zeroing branch unchanged", () => {
      expect(sql).toContain("v_locked:=v_appt.source='moms_website'");
      expect(sql).toContain("v_client_locked:=v_appt.source='public_booking'");
      expect(sql).toContain(
        "v_manual_locked:=coalesce(v_appt.metadata->>'pricing_state','')='manual_quote_locked';",
      );
      expect(sql.match(/if v_locked or v_client_locked or v_manual_locked then/g)).toHaveLength(2);
      expect(sql).toContain("v_tax:=0;");
    });

    it("still stamps the computed tax back into appointment metadata", () => {
      expect(sql).toContain("'tax_amount',v_tax,");
      expect(sql).toContain("'estimated_cost',v_total,");
    });
  });

  describe("live-schema guard — every v_appt field reference names a real production column", () => {
    // Live production appointments columns, verified against
    // information_schema on 2026-11-10 (SQL lane). NOT derived from
    // the repo: the repo's generated types and migration history carry
    // appointments columns production does not have — tax_amount is
    // exactly such a column. When production schema changes, re-verify
    // there and update this list.
    //
    // Why a static guard instead of an execution test: PL/pgSQL
    // resolves %rowtype fields at execution time, so a phantom field
    // passes CREATE FUNCTION and every text check, then detonates
    // inside the trigger at runtime. The Cycle 2 scratch proof missed
    // it twice over — its scratch schema was built from repo
    // definitions (which include tax_amount), and it invoked the
    // function with a hand-built record instead of firing the trigger
    // against the live table shape. This repo's jest harness has no
    // scratch-Postgres runner (no pg driver dependency), so executing
    // the function against a live-shaped schema is not available in
    // CI; this guard is the strongest available equivalent. It checks
    // exactly what would have failed Cycle 2 before merge: every
    // v_appt.<field> the shipped body dereferences must exist in
    // production.
    const LIVE_APPOINTMENTS_COLUMNS = [
      "assigned_user_id",
      "confirmation_code",
      "created_at",
      "created_by",
      "customer_id",
      "dispatch_status",
      "ends_at",
      "id",
      "location_id",
      "metadata",
      "notes",
      "source",
      "starts_at",
      "status",
      "updated_at",
      "vehicle_id",
      "workspace_id",
    ];

    function referencedApptFields(body: string): string[] {
      return [...new Set([...body.matchAll(/v_appt\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]))].sort();
    }

    it("validates every v_appt.<field> reference against the live column list", () => {
      const referenced = referencedApptFields(functionBody(sql));
      expect(referenced.length).toBeGreaterThan(0);
      for (const field of referenced) {
        expect(LIVE_APPOINTMENTS_COLUMNS).toContain(field);
      }
    });

    it("references exactly the expected field set, so a future phantom trips this test", () => {
      expect(referencedApptFields(functionBody(sql))).toEqual([
        "created_by",
        "customer_id",
        "id",
        "metadata",
        "source",
        "starts_at",
        "status",
        "vehicle_id",
        "workspace_id",
      ]);
    });
  });
});
