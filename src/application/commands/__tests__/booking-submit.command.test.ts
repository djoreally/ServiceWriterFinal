/**
 * Guards the slug-bound public booking RPC contract.
 *
 * The public client must never choose a tenant by trusting a caller-supplied
 * business user UUID. The secure RPC resolves the workspace from the booking
 * slug and still requires an explicit p_status argument.
 */

const mockRpc = jest.fn().mockResolvedValue({ data: "appt-1", error: null });

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { bookAppointmentSafe } from "../booking-submit.command";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const baseParams = {
  p_booking_slug: "test-booking",
  p_scheduled_date: "2026-09-01",
  p_scheduled_time: "10:00",
  p_duration_minutes: 60,
  p_title: "Full Synthetic Oil Change",
  p_guest_name: "Test Guest",
  p_guest_email: "guest@example.com",
  p_guest_phone: "+12155550123",
  p_description: "Oil change",
  p_notes: null,
  p_estimated_cost: 120,
  p_tax_amount: 0,
  p_service_catalog_id: null,
  p_vehicle_id: null,
};

describe("bookAppointmentSafe", () => {
  beforeEach(() => mockRpc.mockClear());

  it("always sends p_status so the single supported overload resolves", async () => {
    await bookAppointmentSafe(baseParams);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("public_booking_book_appointment");
    expect(args).toHaveProperty("p_status", "confirmed");
  });

  it("preserves an explicit pending status for shops requiring approval", async () => {
    await bookAppointmentSafe({ ...baseParams, p_status: "pending" });
    expect(mockRpc.mock.calls[0][1]).toHaveProperty("p_status", "pending");
  });
});

describe("public booking appointment migration contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260827100000_secure_public_booking_rpc_context.sql"),
    "utf8",
  );

  it("returns the id from the appointment inserted by the current transaction", () => {
    const functionBody = migration.match(
      /create or replace function public\.public_booking_book_appointment\([\s\S]*?\n\$\$;/i,
    )?.[0];

    expect(functionBody).toBeDefined();
    expect(functionBody).toMatch(/insert into public\.appointments[\s\S]*?returning id into v_appointment_id;/i);
    expect(functionBody).not.toMatch(
      /select\s+a\.id\s+into\s+v_appointment_id\s+from\s+public\.appointments[\s\S]*?order\s+by\s+a\.created_at\s+desc\s+limit\s+1/i,
    );
  });

  it("gives every security-definer function an empty search path", () => {
    const securityDefinerFunctions = migration.match(
      /create or replace function public\.[\s\S]*?security definer[\s\S]*?as \$\$/gi,
    ) ?? [];

    expect(securityDefinerFunctions).toHaveLength(8);
    for (const functionHeader of securityDefinerFunctions) {
      expect(functionHeader).toMatch(/set search_path = ''\s+as \$\$/i);
      expect(functionHeader).not.toMatch(/set search_path\s*=\s*[^'\s]/i);
    }

    expect(migration.match(/alter function public\.[^;]+ set search_path = '';/gi)).toHaveLength(8);
    expect(migration).not.toMatch(/set search_path\s*=\s*pg_catalog\s*,\s*public/i);

    const verification = readFileSync(
      join(process.cwd(), "supabase/ops/20260827_secure_public_booking_verify.sql"),
      "utf8",
    );
    expect(verification).toContain(`p.proconfig @> array['search_path=""']`);
    expect(verification).not.toContain("search_path=pg_catalog, public");
  });

  it("schema-qualifies every application relation and delegated function", () => {
    const applicationRelations = [
      "workspaces",
      "workspace_settings",
      "customers",
      "vehicles",
      "service_catalog",
      "appointments",
    ];
    for (const relation of applicationRelations) {
      expect(migration).not.toMatch(new RegExp(`(?:from|join|into|update)\\s+(?!public\\.)${relation}\\b`, "i"));
    }

    const delegatedFunctions = [
      "resolve_public_booking_context",
      "upsert_booking_vehicle",
      "save_appointment_booking_configuration",
      "insert_booking_appointment_services",
      "record_public_booking_payment_intent_v1",
      "set_vehicle_tire_spec_v1",
    ];
    for (const functionName of delegatedFunctions) {
      expect(migration).not.toMatch(new RegExp(`(?:perform|from|return)\\s+(?!public\\.)${functionName}\\b`, "i"));
    }
  });
});
