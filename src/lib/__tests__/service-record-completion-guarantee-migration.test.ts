import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the service-record completion guarantee
// (20261110010000) and its backfill (20261110020000). These pin the SQL
// shape the owner's ruling depends on: an AFTER-trigger guarantee under
// every completion path, an existence guard on the existing unique
// constraint, and the canonical dialog/RPC path left untouched. Behavior
// against a live database is proven by the post-merge production apply
// and readback, not by these tests.
describe("service-record completion guarantee migration", () => {
  const repoRoot = process.cwd();
  const guarantee = readFileSync(
    resolve(repoRoot, "supabase/migrations/20261110010000_service_record_completion_guarantee.sql"),
    "utf8",
  );
  const backfill = readFileSync(
    resolve(repoRoot, "supabase/migrations/20261110020000_service_record_completion_backfill.sql"),
    "utf8",
  );
  const serviceRecordsSchema = readFileSync(
    resolve(repoRoot, "supabase/migrations/20260821160000_service_records_dispatch_workspace.sql"),
    "utf8",
  );
  const lower = guarantee.toLowerCase();

  it("documents the manual apply order and file-only status", () => {
    expect(guarantee).toContain("Apply AFTER 20261110000000_bookkeeping_vendor_rules.sql");
    expect(guarantee).toContain("File-only until applied manually");
    expect(backfill).toContain("Apply AFTER 20261110010000_service_record_completion_guarantee.sql");
  });

  describe("trigger timing and transition scope", () => {
    it("fires AFTER, never BEFORE, so the completion gates keep their veto", () => {
      expect(lower).not.toContain("before insert on public.appointments");
      expect(lower).not.toContain("before update of status on public.appointments");
      expect(lower).not.toMatch(/create trigger[^;]*\bbefore\b/);
      expect(guarantee).toContain("after insert on public.appointments");
      expect(guarantee).toContain("after update of status on public.appointments");
    });

    it("fires only when an appointment becomes completed", () => {
      expect(guarantee).toContain("when (new.status::text = 'completed')");
      expect(guarantee).toContain(
        "when (old.status is distinct from new.status and new.status::text = 'completed')",
      );
    });

    it("uses the repo-named trigger function for both triggers", () => {
      expect(guarantee).toContain("create or replace function public.ensure_service_record_on_completion_v1()");
      expect(guarantee).toContain("trg_ensure_service_record_on_completion_insert_v1");
      expect(guarantee).toContain("trg_ensure_service_record_on_completion_update_v1");
      expect(guarantee.match(/execute function public\.ensure_service_record_on_completion_v1\(\)/g)).toHaveLength(2);
    });

    it("double-guards inside the core function: non-completed appointments mint nothing", () => {
      expect(guarantee).toContain("if not found or v_appt.status::text <> 'completed' then");
    });
  });

  describe("idempotency", () => {
    it("leans on the pre-existing unique (workspace_id, appointment_id) constraint", () => {
      expect(serviceRecordsSchema).toContain(
        "constraint service_records_workspace_appointment_key unique (workspace_id, appointment_id)",
      );
      expect(guarantee).toContain("on conflict (workspace_id, appointment_id) do nothing");
    });

    it("leaves an existing record untouched (the dialog/RPC path stays authoritative)", () => {
      expect(guarantee).toContain("from public.service_records");
      expect(guarantee).toContain("and appointment_id = p_appointment_id");
      expect(guarantee).toContain("if v_record_id is not null then");
      // The guarantee never updates or deletes an existing service record.
      expect(lower).not.toContain("update public.service_records");
      expect(lower).not.toContain("delete from public.service_records");
    });
  });

  describe("record provenance: built only from the appointment itself", () => {
    it("takes identity fields from the appointment row", () => {
      expect(guarantee).toContain("v_appt.customer_id");
      expect(guarantee).toContain("v_appt.vehicle_id");
      expect(guarantee).toContain("'completed'");
      expect(guarantee).toContain("auth.uid()");
    });

    it("composes work performed from appointment items first, then the canonical fallbacks", () => {
      expect(guarantee).toContain("from public.appointment_items ai");
      expect(guarantee).toContain("string_agg(");
      expect(guarantee).toContain("order by ai.sort_order, ai.created_at");
      expect(guarantee).toContain("nullif(v_appt.metadata ->> 'description', '')");
      expect(guarantee).toContain("nullif(v_appt.metadata ->> 'title', '')");
      expect(guarantee).toContain("v_appt.notes");
      expect(guarantee).toContain("'Completed appointment'");
    });

    it("derives totals the canonical way: metadata estimated_cost / tax_amount and the workspace tax rate", () => {
      expect(guarantee).toContain("jsonb_typeof(v_appt.metadata -> 'estimated_cost') = 'number'");
      expect(guarantee).toContain("jsonb_typeof(v_appt.metadata -> 'tax_amount') = 'number'");
      expect(guarantee).toContain("from public.workspace_settings");
      expect(guarantee).toContain("else coalesce(v_subtotal, 0) + coalesce(v_tax_amount, 0)");
    });

    it("derives timestamps from the appointment's actual stamps with schedule/update fallbacks", () => {
      expect(guarantee).toContain("v_appt.metadata ->> 'actual_start_time'");
      expect(guarantee).toContain("v_appt.metadata ->> 'actual_end_time'");
      expect(guarantee).toContain("coalesce(v_started_at, v_appt.starts_at)");
      expect(guarantee).toContain("coalesce(v_completed_at, v_appt.updated_at, now())");
      // Time-order guard for the service_records_time_order check.
      expect(guarantee).toContain("if v_started_at is not null and v_completed_at < v_started_at then");
    });

    it("marks guarantee-minted records in metadata while keeping the canonical source", () => {
      expect(guarantee).toContain("'source', 'appointment_completion'");
      expect(guarantee).toContain("'completion_guarantee', jsonb_build_object(");
    });
  });

  describe("exception safety", () => {
    it("states the choice: no catch-all around the insert, so a mint failure aborts the completion", () => {
      expect(guarantee).toContain("there is NO");
      expect(guarantee).toContain("catch-all around the insert");
      expect(guarantee).toContain("aborts the");
    });

    it("confines exception blocks to the two optional timestamp parses", () => {
      expect(guarantee.match(/exception when others then/g)).toHaveLength(2);
    });
  });

  describe("canonical path untouched", () => {
    it("does not redefine the canonical completion or closeout RPCs", () => {
      expect(lower).not.toContain("create or replace function public.complete_appointment_v1");
      expect(lower).not.toContain("create or replace function public.complete_appointment_closeout_v1");
      expect(lower).not.toContain("complete_appointment_with_service_record");
    });

    it("does not touch the inspection or recommendation gates or the invoice sync", () => {
      expect(lower).not.toContain("enforce_appointment_inspection_completion_v1");
      expect(lower).not.toContain("enforce_appointment_recommendation_resolution_v1");
      expect(lower).not.toContain("appointments_sync_invoice_trigger_v1()");
      expect(lower).not.toContain("create trigger appointments_sync_invoice_v1");
    });
  });

  describe("backfill", () => {
    it("targets every completed appointment with no service record", () => {
      expect(backfill).toContain("a.status::text = 'completed'");
      expect(backfill).toContain("not exists (");
      expect(backfill).toContain("from public.service_records sr");
      expect(backfill).toContain("sr.appointment_id = a.id");
    });

    it("reuses the same ensure function with the backfill origin, so it is re-runnable", () => {
      expect(backfill).toContain(
        "public.ensure_service_record_for_appointment_v1(",
      );
      expect(backfill).toContain("'backfill'");
      expect(backfill).toContain("Idempotent and re-runnable");
    });
  });
});
