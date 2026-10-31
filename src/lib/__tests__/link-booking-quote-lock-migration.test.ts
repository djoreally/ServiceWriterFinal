import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the booking-link client quote lock migration
// (20261031190000). These pin the SQL shape the fix depends on: the v3
// create locks the shown quote at insert with one bundled item, the
// invoice sync invoices locked link bookings at the quote, and the
// pay-at-service intent never adds fees on top of the quote. Behavior
// against a live database is proven by the post-merge production apply.
describe("booking-link client quote lock migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261031190000_link_booking_client_quote_lock.sql"),
    "utf8",
  );
  const createSection = sql.slice(sql.indexOf("-- 1)"), sql.indexOf("-- 2)"));
  const syncSection = sql.slice(sql.indexOf("-- 2)"), sql.indexOf("-- 3)"));
  const intentSection = sql.slice(sql.indexOf("-- 3)"));

  it("documents the manual apply order and the functions-only scope", () => {
    expect(sql).toContain("Apply AFTER 20261030190000_b1_status_vocabulary_truths.sql");
    expect(sql).toContain("replaces functions ONLY");
  });

  describe("public_booking_book_appointment_v3", () => {
    it("keeps the current signature and grants", () => {
      expect(createSection).toContain(
        "create or replace function public.public_booking_book_appointment_v3(",
      );
      expect(createSection).toContain(
        "revoke all on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) from public;",
      );
      expect(createSection).toContain(
        "grant execute on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) to anon, authenticated;",
      );
    });

    it("derives the quote from p_estimated_cost exactly as client_estimated_cost was stored", () => {
      expect(createSection).toContain(
        "v_quote := round(greatest(coalesce(p_estimated_cost,0),0),2);",
      );
      expect(createSection).toContain("'client_estimated_cost', v_quote");
    });

    it("locks pricing_state and estimated_cost at insert only when the quote is positive", () => {
      expect(createSection).toContain(
        "'estimated_cost', case when v_quote > 0 then v_quote else 0 end",
      );
      expect(createSection).toContain(
        "'pricing_state', case when v_quote > 0 then 'client_quote_locked' else 'pending_canonical_items' end",
      );
    });

    it("writes exactly one bundled item priced at the quote", () => {
      expect(createSection.match(/insert into public\.appointment_items\(/g)).toHaveLength(1);
      expect(createSection).toContain("if v_quote > 0 then");
      expect(createSection).toContain("'price_source', 'client_quote'");
      expect(createSection).toContain("'source', 'public_booking'");
      // quantity 1, unit_price = the quote, not a catalog price.
      expect(createSection).toMatch(/\n\s+1,\n\s+v_quote,\n\s+false,/);
    });

    it("does not route the primary line through the catalog re-pricing RPC", () => {
      expect(createSection).not.toContain("perform public.public_booking_insert_services_v7");
      expect(createSection).not.toContain("select public.public_booking_insert_services_v7");
    });
  });

  describe("sync_appointment_invoice_v1", () => {
    it("detects the client lock on the public_booking channel only", () => {
      expect(syncSection).toContain("v_client_locked:=v_appt.source='public_booking'");
      expect(syncSection).toContain(
        "coalesce(v_appt.metadata->>'pricing_state','')='client_quote_locked'",
      );
    });

    it("keeps the website lock detection unchanged", () => {
      expect(syncSection).toContain("v_locked:=v_appt.source='moms_website'");
      expect(syncSection).toContain("'website_quote_locked'");
    });

    it("applies the locked money branch to either lock", () => {
      expect(syncSection).toContain("if v_locked or v_client_locked then");
      expect(syncSection).toContain("v_item_subtotal:=v_quote;");
      expect(syncSection).toContain("v_total:=v_quote;");
    });

    it("preserves client_quote_locked through the metadata write-back", () => {
      expect(syncSection.match(/when v_client_locked then 'client_quote_locked'/g)).toHaveLength(2);
    });
  });

  describe("survival under the invoice-sync triggers", () => {
    // Production evidence (Bolton repair, 2026-10-31): AFTER triggers on
    // appointments and appointment_items re-run the invoice sync on ANY
    // write, and a non-locked appointment is re-priced to quote + fees
    // with pricing_state forced to 'canonical'. These assertions pin why
    // the locked representation survives every re-fire.
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

    it("the appointment carries the lock in its INSERT, so the insert-fired sync already sees it", () => {
      // The appointments trigger fires on INSERT, before the bundled item
      // exists; the lock must be in the inserted metadata itself.
      const appointmentInsertAt = createSection.indexOf("insert into public.appointments(");
      const itemInsertAt = createSection.indexOf("insert into public.appointment_items(");
      expect(appointmentInsertAt).toBeGreaterThanOrEqual(0);
      expect(itemInsertAt).toBeGreaterThan(appointmentInsertAt);
      const appointmentInsert = createSection.slice(appointmentInsertAt, itemInsertAt);
      expect(appointmentInsert).toContain("'client_quote_locked'");
      expect(appointmentInsert).toContain("'estimated_cost', case when v_quote > 0 then v_quote else 0 end");
    });

    it("the locked money branch runs before the item-count branch, so the total is the quote even with zero items", () => {
      const lockedBranch = syncSection.indexOf("if v_locked or v_client_locked then");
      const itemsBranch = syncSection.indexOf("elsif v_item_count>0 then");
      expect(lockedBranch).toBeGreaterThanOrEqual(0);
      expect(itemsBranch).toBeGreaterThan(lockedBranch);
    });

    it("fee lines can never be generated for a locked appointment (fee variables are zeroed in the lock branch)", () => {
      const lockBlock = syncSection.slice(
        syncSection.indexOf("if v_locked or v_client_locked then"),
        syncSection.indexOf("elsif v_item_count>0 then"),
      );
      expect(lockBlock).toContain("v_waste_fee:=0;");
      expect(lockBlock).toContain("v_shop_fee:=0;");
      expect(lockBlock).toContain("v_surcharge:=0;");
      expect(lockBlock).toContain("v_tax:=0;");
    });

    it("the write-back is byte-stable under the lock, so the metadata-fired re-sync terminates", () => {
      // The sync writes metadata only when it differs; under the lock the
      // recomputed values equal the stored ones (estimated_cost = quote,
      // tax 0, state preserved), so a subsequent appointment update
      // re-fires the sync and lands on exactly the same invoice.
      expect(syncSection).toContain("'estimated_cost',v_total");
      expect(syncSection).toContain("'tax_amount',v_tax");
      expect(syncSection).toContain(
        "if coalesce(v_appt.metadata,'{}'::jsonb) is distinct from v_metadata then",
      );
    });
  });

  describe("public_booking_record_payment_intent_v3", () => {
    it("reads the lock state and quote from the appointment", () => {
      expect(intentSection).toContain("a.metadata->>'pricing_state'");
      expect(intentSection).toContain("into v_customer_id,v_source,v_created_at,v_email,v_phone,v_pricing_state,v_client_quote");
    });

    it("records the quote itself for locked appointments, with no fee or tax added", () => {
      expect(intentSection).toContain("if v_pricing_state='client_quote_locked' and v_client_quote>0 then");
      expect(intentSection).toContain("v_amount_source:='client_quote_lock';");
      expect(intentSection).toContain("v_canonical_tax:=0");
    });

    it("keeps the canonical computation for unlocked appointments", () => {
      expect(intentSection).toContain("v_amount_source:='canonical_appointment_items';");
      expect(intentSection).toContain("if v_item_count=0 then raise exception 'BOOKING_ITEMS_REQUIRED'; end if;");
    });
  });
});
