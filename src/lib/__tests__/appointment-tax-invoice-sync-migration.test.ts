import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the dialog tax persistence migration
// (20261110101500). These pin the SQL shape the fix depends on: the
// invoice sync sources the appointment's own tax_amount column first,
// so a tax recorded in the column (legacy / imported appointments)
// reaches the invoice instead of being rebuilt as tax_total 0, while
// the metadata chain, the quote locks, and every other behavior of
// sync_appointment_invoice_v1 stay byte-for-byte identical to the
// definition it replaces (20261103220000). Behavior against a live
// database is proven by the post-merge production apply.
describe("appointment tax invoice sync migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261110101500_appointment_tax_invoice_sync.sql"),
    "utf8",
  );
  const priorSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103220000_staff_manual_quote_lock.sql"),
    "utf8",
  );

  function functionBody(source: string): string {
    const start = source.indexOf("create or replace function public.sync_appointment_invoice_v1");
    expect(start).toBeGreaterThanOrEqual(0);
    return source.slice(start).trimEnd();
  }

  // Remove the v_tax assignment statement (it spans from the
  // "v_tax:=public.money_round_v1(greatest(coalesce(" line through the
  // closing "),0),2);" line) so the rest of the body can be compared
  // byte-for-byte against the definition being replaced.
  function withoutTaxAssignment(body: string): string {
    const lines = body.split("\n");
    const start = lines.findIndex((l) => l.includes("v_tax:=public.money_round_v1(greatest(coalesce("));
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > start && l.trim() === "),0),2);");
    expect(end).toBeGreaterThan(start);
    return [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
  }

  it("documents the manual apply order and the functions-only scope", () => {
    expect(sql).toContain("Apply AFTER 20261110051500_single_card_fee.sql");
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
    it("sources the appointment's own tax_amount column first", () => {
      const columnIdx = sql.indexOf("    v_appt.tax_amount,");
      const metadataIdx = sql.indexOf("nullif(v_appt.metadata->>'tax_amount','')::numeric,");
      const clientIdx = sql.indexOf("nullif(v_appt.metadata->>'client_tax_amount','')::numeric,");
      const invoiceIdx = sql.indexOf("case when found then v_invoice.tax_total else 0 end,");
      expect(columnIdx).toBeGreaterThanOrEqual(0);
      expect(metadataIdx).toBeGreaterThan(columnIdx);
      expect(clientIdx).toBeGreaterThan(metadataIdx);
      expect(invoiceIdx).toBeGreaterThan(clientIdx);
    });

    it("is byte-for-byte identical to the prior definition outside the v_tax assignment", () => {
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
});
