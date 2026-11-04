import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the staff manual quote lock migration
// (20261103220000). These pin the SQL shape the fix depends on: the
// invoice sync invoices a staff appointment whose custom/flat price was
// locked at creation at exactly the typed total, and the write-back
// preserves the lock state. Behavior against a live database is proven
// by the post-merge production apply.
describe("staff manual quote lock migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103220000_staff_manual_quote_lock.sql"),
    "utf8",
  );

  it("documents the manual apply order and the functions-only scope", () => {
    expect(sql).toContain(
      "Apply AFTER 20261031200000_self_serve_owner_workspace_provisioning.sql",
    );
    expect(sql).toContain("replaces a function ONLY");
    expect(sql).toContain("File-only until applied manually");
  });

  it("replaces sync_appointment_invoice_v1 exactly once and nothing else", () => {
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
    expect(sql).toContain("create or replace function public.sync_appointment_invoice_v1");
    // The migration itself seeds no data: there is no top-level DML —
    // the only writes live inside the sync function being replaced.
    expect(sql).not.toContain("insert into public.appointments");
    expect(sql.toLowerCase().indexOf("create or replace function")).toBeLessThan(
      sql.toLowerCase().indexOf("insert into public.invoices"),
    );
  });

  describe("sync_appointment_invoice_v1", () => {
    it("detects the manual lock on pricing_state alone, with no channel condition", () => {
      expect(sql).toContain(
        "v_manual_locked:=coalesce(v_appt.metadata->>'pricing_state','')='manual_quote_locked';",
      );
      expect(sql).not.toContain("v_manual_locked:=v_appt.source");
    });

    it("keeps the website and client lock detection unchanged", () => {
      expect(sql).toContain("v_locked:=v_appt.source='moms_website'");
      expect(sql).toContain("'website_quote_locked'");
      expect(sql).toContain("v_client_locked:=v_appt.source='public_booking'");
      expect(sql).toContain(
        "coalesce(v_appt.metadata->>'pricing_state','')='client_quote_locked'",
      );
    });

    it("applies the locked money branch to any of the three locks", () => {
      expect(sql.match(/if v_locked or v_client_locked or v_manual_locked then/g)).toHaveLength(2);
      expect(sql).toContain("v_item_subtotal:=v_quote;");
      expect(sql).toContain("v_total:=v_quote;");
    });

    it("preserves manual_quote_locked through the metadata write-back", () => {
      expect(sql.match(/when v_manual_locked then 'manual_quote_locked'/g)).toHaveLength(2);
    });

    it("derives the locked quote from the same metadata keys as the other locks", () => {
      expect(sql).toContain("nullif(v_appt.metadata->>'estimated_cost','')::numeric");
      expect(sql).toContain("nullif(v_appt.metadata->>'client_estimated_cost','')::numeric");
    });
  });

  describe("survival under the invoice-sync triggers", () => {
    // The AFTER triggers on appointments and appointment_items re-run
    // the invoice sync on ANY write; a non-locked appointment is
    // re-priced to catalog + fees with pricing_state forced to
    // 'canonical'. These assertions pin why the locked representation
    // survives every re-fire.
    const lifecycleSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260910110000_appointment_invoice_lifecycle_v1.sql"),
      "utf8",
    );

    it("both sync triggers call sync_appointment_invoice_v1 by name (the function this migration replaces)", () => {
      expect(lifecycleSql).toContain(
        "create trigger appointments_sync_invoice_v1\nafter insert or update of customer_id, vehicle_id, starts_at, status, metadata",
      );
      expect(lifecycleSql).toContain(
        "create trigger appointment_items_sync_invoice_v1\nafter insert or update or delete on public.appointment_items",
      );
      expect(lifecycleSql).toContain("perform public.sync_appointment_invoice_v1(new.id);");
      expect(lifecycleSql).toContain(
        "perform public.sync_appointment_invoice_v1(coalesce(new.appointment_id,old.appointment_id));",
      );
    });

    it("the locked money branch runs before the item-count branch, so the total is the typed total even with zero items", () => {
      const lockedBranch = sql.indexOf("if v_locked or v_client_locked or v_manual_locked then\n    v_item_subtotal:=v_quote;");
      const itemsBranch = sql.indexOf("elsif v_item_count>0 then");
      expect(lockedBranch).toBeGreaterThanOrEqual(0);
      expect(itemsBranch).toBeGreaterThan(lockedBranch);
    });

    it("fee lines can never be generated for a locked appointment (fee variables are zeroed in the lock branch)", () => {
      const lockBlock = sql.slice(
        sql.indexOf("if v_locked or v_client_locked or v_manual_locked then\n    v_item_subtotal:=v_quote;"),
        sql.indexOf("elsif v_item_count>0 then"),
      );
      expect(lockBlock).toContain("v_waste_fee:=0;");
      expect(lockBlock).toContain("v_shop_fee:=0;");
      expect(lockBlock).toContain("v_surcharge:=0;");
      expect(lockBlock).toContain("v_tax:=0;");
    });

    it("the write-back is byte-stable under the lock, so the metadata-fired re-sync terminates", () => {
      expect(sql).toContain("'estimated_cost',v_total");
      expect(sql).toContain("'tax_amount',v_tax");
      expect(sql).toContain(
        "if coalesce(v_appt.metadata,'{}'::jsonb) is distinct from v_metadata then",
      );
    });
  });
});
