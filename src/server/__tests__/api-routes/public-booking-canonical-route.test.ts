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
const submitSource = readFileSync(
  join(process.cwd(), "src/hooks/useBookingSubmit.ts"),
  "utf8",
);
const commitCommandSource = readFileSync(
  join(process.cwd(), "src/application/commands/public-booking-commit.command.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  join(process.cwd(), "supabase/migrations/20261016090000_public_booking_commit_v1.sql"),
  "utf8",
);

describe("canonical public booking transaction contract", () => {
  it("mounts the dedicated public booking Hono router", () => {
    expect(appSource).toContain('import { publicBookingRouter } from "./routes/public-booking"');
    expect(appSource).toContain('app.route("/", publicBookingRouter)');
  });

  it("has exactly one browser-facing booking commit endpoint", () => {
    expect(routeSource).toContain('publicBookingRouter.post("/v1/public-bookings/commit"');
    expect(routeSource).not.toContain('/v1/public-bookings/appointments"');
    expect(commitCommandSource).toContain('"/v1/public-bookings/commit"');
  });

  it("calls one database booking commit RPC from the server boundary", () => {
    expect(routeSource).toContain('supabase.rpc("public_booking_commit_v1"');
    expect(routeSource).not.toContain('supabase.rpc("public_booking_book_appointment_v3"');
    expect(routeSource).not.toContain("public_booking_insert_services_v7");
  });

  it("removes browser orchestration of booking persistence", () => {
    expect(submitSource).toContain("commitPublicBooking(");
    expect(submitSource).not.toContain("upsertBookingCustomer(");
    expect(submitSource).not.toContain("upsertBookingVehicle(");
    expect(submitSource).not.toContain("bookAppointmentSafe(");
    expect(submitSource).not.toContain("insertBookingAppointmentServices(");
    expect(submitSource).not.toContain("insertBookingPaymentRecord(");
  });

  it("requires a durable idempotency key and stores it on the appointment", () => {
    expect(routeSource).toMatch(/idempotency_key:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(128\)/);
    expect(migrationSource).toContain("booking_idempotency_key");
    expect(migrationSource).toContain("pg_advisory_xact_lock");
  });

  it("keeps appointment location and service items inside the same transaction", () => {
    expect(migrationSource).toContain("public.public_booking_book_appointment_v3(");
    expect(migrationSource).toContain("public.public_booking_insert_services_v7(");
    expect(migrationSource).toContain("public.public_booking_record_payment_intent_v3(");
    expect(migrationSource).toContain("BOOKING_ITEMS_REQUIRED");
    expect(migrationSource).toContain("BOOKING_PAYMENT_INTENT_FAILED");
  });

  it("creates pay-now checkout against the committed payment row", () => {
    expect(routeSource).toContain("payment_id: committed.payment_id");
    expect(routeSource).toContain("appointment_id: committed.appointment_id");
    expect(routeSource).toContain("booking_idempotency_key: body.idempotency_key");
    expect(routeSource).toContain("checkout.sessions.create");
  });

  it("does not delegate public checkout to legacy edge functions", () => {
    expect(routeSource).not.toContain("create-booking-payment");
    expect(routeSource).not.toContain("create-square-payment");
    expect(routeSource).not.toContain("proxyEdgeFunction");
  });

  it("keeps provider checkout failure distinct from booking failure", () => {
    expect(routeSource).toContain("booking committed but checkout creation failed");
    expect(routeSource).toContain("Your appointment is confirmed and remains unpaid.");
  });
});
