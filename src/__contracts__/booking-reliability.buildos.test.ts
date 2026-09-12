import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("BuildOS Sprint 1 — Booking Reliability contract", () => {
  const route = read("app/api/v1/public-booking/[slug]/route.ts");
  const bookingMigration = read("supabase/migrations/20260831030526_secure_public_booking_rpc_context.sql");
  const managementMigration = read("supabase/migrations/20260907154500_restore_customer_appointment_management_rpcs.sql");
  const command = read("src/application/commands/booking-submit.command.ts");

  it("locks the canonical public booking read surface", () => {
    for (const section of ["profile", "settings", "catalog", "slots", "blocked_dates"]) {
      expect(route).toContain(`"${section}"`);
    }
    expect(route).not.toMatch(/["']config["']/);
    expect(route).not.toMatch(/["']availability["']/);
    expect(route).toContain('date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()');
    expect(route).toContain('if (!query.date)');
    expect(route).toContain('"date is required for slots"');
  });

  it("keeps booking reads JSON-first and fail-closed", () => {
    expect(route).toContain('return json({ data: profile }');
    expect(route).toContain('return json({ error: { code: "public_booking_unavailable"');
    expect(route).not.toMatch(/NextResponse\.redirect|redirect\(/);
  });

  it("keeps public booking writes slug-bound and appointment-id deterministic", () => {
    expect(command).toContain('supabase.rpc("public_booking_book_appointment"');
    expect(bookingMigration).toMatch(/create or replace function public\.public_booking_book_appointment\(/i);
    expect(bookingMigration).toMatch(/insert into public\.appointments[\s\S]*?returning id into v_appointment_id;/i);
    expect(bookingMigration).toMatch(/tstzrange|slot|scheduled/i);
  });

  it("keeps customer cancellation and reschedule contracts present", () => {
    expect(managementMigration).toContain("cancel_appointment_by_token");
    expect(managementMigration).toContain("reschedule_appointment_by_token");
    expect(managementMigration).toMatch(/status not in \('cancelled','no_show'\)/i);
    expect(managementMigration).toMatch(/That time is no longer available/i);
  });

  it("keeps booking write RPCs in the secure migration boundary", () => {
    for (const rpc of [
      "public_booking_upsert_customer",
      "public_booking_upsert_vehicle",
      "public_booking_book_appointment",
      "public_booking_save_configuration",
      "public_booking_insert_services",
      "public_booking_record_payment_intent_v2",
    ]) {
      expect(bookingMigration).toContain(rpc);
    }
  });
});
