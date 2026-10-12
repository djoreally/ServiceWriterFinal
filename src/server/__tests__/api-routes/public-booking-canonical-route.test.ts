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

describe("canonical public booking API contract", () => {
  it("mounts the dedicated public booking Hono router", () => {
    expect(appSource).toContain('import { publicBookingRouter } from "./routes/public-booking"');
    expect(appSource).toContain('app.route("/", publicBookingRouter)');
  });

  it("requires an appointment-owned service address at the Hono boundary", () => {
    expect(routeSource).toMatch(/p_location_address:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1000\)/);
  });

  it("keeps the database RPC name server-side and calls only v3 for appointment creation", () => {
    expect(routeSource).toContain('supabase.rpc("public_booking_book_appointment_v3"');
    expect(commandSource).toContain('"/v1/public-bookings/appointments"');
    expect(commandSource).not.toContain('bookingRpc<string>("public_booking_book_appointment_v2"');
  });

  it("uses the server-safe anonymous Supabase client", () => {
    expect(routeSource).toContain("createSupabaseAnonServerClient");
    expect(routeSource).not.toContain("createSupabaseBrowserClient");
  });
});
