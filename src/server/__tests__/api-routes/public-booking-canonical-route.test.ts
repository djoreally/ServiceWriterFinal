import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(
  join(process.cwd(), "src/server/hono/routes/public-booking.ts"),
  "utf8",
);
const appSource = readFileSync(
  join(process.cwd(), "src/server/hono/app.ts"),
  "utf8",
);
const commandSource = readFileSync(
  join(process.cwd(), "src/application/commands/booking-submit.command.ts"),
  "utf8",
);
const submitSource = readFileSync(
  join(process.cwd(), "src/hooks/useBookingSubmit.ts"),
  "utf8",
);

const atomicMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261018142500_public_booking_atomic_commit_v1.sql"),
  "utf8",
);

describe("canonical public booking API contract", () => {
  it("commits configuration and every service in the same SQL transaction", () => {
    expect(atomicMigration).toContain("pg_advisory_xact_lock");
    expect(atomicMigration).toContain("public.public_booking_book_appointment_v3(");
    expect(atomicMigration).toContain("public.public_booking_save_configuration_v2(");
    expect(atomicMigration).toContain("public.public_booking_insert_services_v7(");
    expect(atomicMigration).toContain("BOOKING_SERVICE_COUNT_MISMATCH");
    expect(atomicMigration).toContain("BOOKING_IDEMPOTENCY_CONFLICT");
    expect(atomicMigration).toContain("PRIMARY KEY (workspace_id, submission_key)");
    expect(submitSource).toContain("p_submission_key: submissionKey");
    expect(submitSource).toContain("p_services: serviceItems");
    expect(submitSource).not.toContain("await insertBookingAppointmentServices(");
    expect(submitSource).toContain('name: "Additional Oil Quarts"');
    expect(submitSource).toContain("BOOKING_PAYMENT_RECORD_NOT_RECONCILED");
  });

  it("mounts the dedicated public booking Hono router", () => {
    expect(appSource).toContain('import { publicBookingRouter } from "./routes/public-booking"');
    expect(appSource).toContain('app.route("/", publicBookingRouter)');
  });

  it("requires an appointment-owned service address at the Hono boundary", () => {
    expect(routeSource).toMatch(/p_location_address:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1000\)/);
  });

  it("routes the complete public booking through one idempotent database transaction", () => {
    expect(routeSource).toContain('supabase.rpc("public_booking_commit_v1"');
    expect(routeSource).toContain('p_submission_key: body.p_submission_key');
    expect(routeSource).toContain('p_services: body.p_services');
    expect(routeSource).toContain('p_configuration: body.p_configuration');
    expect(commandSource).toContain('"/v1/public-bookings/appointments"');
    expect(commandSource).not.toContain('bookingRpc<string>("public_booking_book_appointment_v2"');
  });

  it("passes location explicitly instead of hiding it between commands", () => {
    expect(commandSource).not.toContain("bookingLocations");
    expect(submitSource).toContain("p_location_address: fullAddress");
    expect(submitSource).toContain("p_location_lat: finalCoords?.lat ?? null");
    expect(submitSource).toContain("p_location_lng: finalCoords?.lng ?? null");
  });

  it("does not stage a legacy location intent for the canonical flow", () => {
    expect(commandSource).toMatch(/public_booking_upsert_customer[\s\S]*?p_address:\s*null/);
  });

  it("does not rewrite the appointment location after canonical creation", () => {
    expect(submitSource).not.toContain("updatePayload.location_address");
    expect(submitSource).not.toContain("updatePayload.location_lat");
    expect(submitSource).not.toContain("updatePayload.location_lng");
  });

  it("preserves long generated-title compatibility by truncating instead of rejecting", () => {
    expect(routeSource).toContain("value.slice(0, 500)");
  });

  it("treats malformed JSON as a 400 and RPC failures as non-2xx API errors", () => {
    expect(routeSource).toContain('message: "Invalid JSON body"');
    expect(routeSource).toContain("errorResponse(toError(error))");
    expect(commandSource).toContain("error instanceof ApiClientError");
  });

  it("uses the server-safe anonymous Supabase client", () => {
    expect(routeSource).toContain("createSupabaseAnonServerClient");
    expect(routeSource).not.toContain("createSupabaseBrowserClient");
  });
});
