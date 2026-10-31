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
