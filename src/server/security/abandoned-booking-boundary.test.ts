import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("public abandoned-booking boundary", () => {
  const migration = read("supabase/migrations/20260911080000_session_bound_abandoned_booking_tracking.sql");

  it("removes anonymous direct table writes", () => {
    expect(migration).toContain(
      "drop policy if exists abandoned_bookings_public_update_by_session on public.abandoned_bookings",
    );
    expect(migration).toContain(
      "drop policy if exists abandoned_bookings_public_insert on public.abandoned_bookings",
    );
    expect(migration).toContain(
      "revoke all on table public.abandoned_bookings from anon",
    );
  });

  it("exposes only session-bound public tracking and recovery RPCs", () => {
    expect(migration).toContain("public.public_track_abandoned_booking_v1");
    expect(migration).toContain("public.public_recover_abandoned_booking_v1");
    expect(migration).toContain("and session_id = trim(p_session_id)");
    expect(migration).toContain("and ws.booking_enabled");
  });

  it("does not allow the browser tracker to select then mutate arbitrary rows", () => {
    const command = read("src/application/commands/booking-tracker.command.ts");
    expect(command).toContain('rpc("public_track_abandoned_booking_v1"');
    expect(command).toContain('rpc("public_recover_abandoned_booking_v1"');
    expect(command).not.toContain('.from("abandoned_bookings")');
    expect(command).not.toContain('notify_abandoned_booking');
  });
});
