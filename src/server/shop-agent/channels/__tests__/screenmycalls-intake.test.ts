/**
 * Tests for src/server/shop-agent/channels/screenmycalls-intake.ts.
 *
 * The mirror intake is the multitenancy boundary for ScreenMyCalls
 * bookings, so beyond the happy path these tests pin the hard rules:
 *  - the tenant comes from the pairing credential ONLY — a payload
 *    claiming another workspace still lands in the credential's tenant;
 *  - one tenant's secret cannot authenticate as another tenant;
 *  - dedupe is scoped per tenant (same idempotency key in two tenants
 *    is two legitimate records);
 *  - unauthenticated / malformed deliveries create nothing.
 *
 * Supabase is the in-memory FakeSupabase; the booking core is the real
 * one (override_availability mirrors skip its availability branch).
 */
import { createHmac } from "node:crypto";
import { describe, it, expect, jest } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../../../hono/test-support/webGlobals";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
import {
  handleScreenMyCallsMirror,
  SMC_MIRROR_EVENT,
} from "../screenmycalls-intake";
import type { ShopAgentSupabase } from "../db";
import { FakeSupabase } from "../test-support/fake-supabase";

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";
const KEY_A = "swp_tenant_a";
const KEY_B = "swp_tenant_b";
const SECRET_A = "sws_secret_for_tenant_a";
const SECRET_B = "sws_secret_for_tenant_b";

function settingsRow(workspaceId: string) {
  return {
    workspace_id: workspaceId,
    day_hours: {},
    opening_time: "08:00",
    closing_time: "17:00",
    working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    buffer_time_before: 0,
    buffer_time_after: 0,
    min_lead_time_hours: 0,
  };
}

function makeFake(): FakeSupabase {
  return new FakeSupabase({
    provider_connections: [
      { workspace_id: WS_A, provider: "screenmycalls", metadata: { key_id: KEY_A, secret: SECRET_A } },
      { workspace_id: WS_B, provider: "screenmycalls", metadata: { key_id: KEY_B, secret: SECRET_B } },
      // A retired-provider row that must never be mistaken for a pairing.
      { workspace_id: WS_A, provider: "agentphone", metadata: { agent_id: "old" } },
    ],
    workspaces: [
      { id: WS_A, timezone: "America/New_York" },
      { id: WS_B, timezone: "America/New_York" },
    ],
    workspace_settings: [settingsRow(WS_A), settingsRow(WS_B)],
    customers: [],
    vehicles: [],
    appointments: [],
  });
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: "booking.mirrored",
    caller_name: "Dana Whitaker",
    caller_phone: "+12155550123",
    service_name: "Full Synthetic Oil Change",
    starts_at: "2026-11-20T15:00:00.000Z",
    ends_at: "2026-11-20T16:00:00.000Z",
    duration_minutes: 60,
    timezone: "America/New_York",
    vehicle: { year: 2019, make: "Honda", model: "Accord" },
    service_address: "201 S Locust St, Ambler, PA 19002",
    notes: null,
    booking_reference: "BK-123",
    booking_backend: "square",
    call_session_id: "session-abc",
    idempotency_key: "smc:session-abc:BK-123",
    ...overrides,
  };
}

function sign(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

async function deliver(
  fake: FakeSupabase,
  keyId: string | null,
  secret: string,
  body: Record<string, unknown> | string,
) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return handleScreenMyCallsMirror(
    { supabase: fake as unknown as ShopAgentSupabase },
    rawBody,
    { signature: sign(secret, rawBody), keyId, event: SMC_MIRROR_EVENT },
  );
}

describe("screenmycalls mirror intake", () => {
  it("creates the mirrored appointment, customer and vehicle in the credential's workspace", async () => {
    const fake = makeFake();
    const res = await deliver(fake, KEY_A, SECRET_A, payload());
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.duplicate).toBe(false);

    const appts = fake.rowsOf("appointments");
    expect(appts).toHaveLength(1);
    expect(appts[0].workspace_id).toBe(WS_A);
    expect(appts[0].source).toBe("screenmycalls");
    expect(appts[0].metadata.external_reference).toBe("smc:session-abc:BK-123");
    expect(appts[0].location_id ?? null).toBeNull();

    const customers = fake.rowsOf("customers");
    expect(customers).toHaveLength(1);
    expect(customers[0].workspace_id).toBe(WS_A);
    expect(customers[0].metadata.source).toBe("screenmycalls");

    const vehicles = fake.rowsOf("vehicles");
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].workspace_id).toBe(WS_A);
    expect(vehicles[0].customer_id).toBe(customers[0].id);
    expect(appts[0].vehicle_id).toBe(vehicles[0].id);
    expect(appts[0].customer_id).toBe(customers[0].id);
  });

  it("ignores a payload claiming a different workspace — the booking still lands in the credential's tenant", async () => {
    const fake = makeFake();
    const res = await deliver(fake, KEY_A, SECRET_A, payload({ workspace_id: WS_B, shop_id: WS_B }));
    expect(res.status).toBe(201);
    const appts = fake.rowsOf("appointments");
    expect(appts).toHaveLength(1);
    expect(appts[0].workspace_id).toBe(WS_A);
    expect(fake.rowsOf("customers").every((c) => c.workspace_id === WS_A)).toBe(true);
    expect(fake.rowsOf("vehicles").every((v) => v.workspace_id === WS_A)).toBe(true);
  });

  it("rejects tenant B's signature presented under tenant A's key id, creating nothing", async () => {
    const fake = makeFake();
    const res = await deliver(fake, KEY_A, SECRET_B, payload());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_signature");
    expect(fake.rowsOf("appointments")).toHaveLength(0);
    expect(fake.rowsOf("customers")).toHaveLength(0);
  });

  it("scopes dedupe per tenant: the same idempotency key in two tenants is two legitimate records", async () => {
    const fake = makeFake();
    const a = await deliver(fake, KEY_A, SECRET_A, payload());
    const b = await deliver(fake, KEY_B, SECRET_B, payload());
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const appts = fake.rowsOf("appointments");
    expect(appts).toHaveLength(2);
    expect(appts.map((r) => r.workspace_id).sort()).toEqual([WS_A, WS_B].sort());
  });

  it("dedupes a re-delivery inside the same tenant", async () => {
    const fake = makeFake();
    const first = await deliver(fake, KEY_A, SECRET_A, payload());
    const second = await deliver(fake, KEY_A, SECRET_A, payload());
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.appointmentId).toBe(first.body.appointmentId);
    expect(fake.rowsOf("appointments")).toHaveLength(1);
    expect(fake.rowsOf("customers")).toHaveLength(1);
    expect(fake.rowsOf("vehicles")).toHaveLength(1);
  });

  it("fails closed on missing key id, unknown key id, and bad signatures", async () => {
    const fake = makeFake();
    const noKey = await handleScreenMyCallsMirror(
      { supabase: fake as unknown as ShopAgentSupabase },
      JSON.stringify(payload()),
      { signature: null, keyId: null, event: SMC_MIRROR_EVENT },
    );
    expect(noKey.status).toBe(401);

    const unknown = await deliver(fake, "swp_nobody", SECRET_A, payload());
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe("unknown_key_id");

    const rawBody = JSON.stringify(payload());
    const badSig = await handleScreenMyCallsMirror(
      { supabase: fake as unknown as ShopAgentSupabase },
      rawBody,
      { signature: "sha256=deadbeef", keyId: KEY_A, event: SMC_MIRROR_EVENT },
    );
    expect(badSig.status).toBe(401);
    expect(fake.rowsOf("appointments")).toHaveLength(0);
  });

  it("rejects malformed JSON and incomplete payloads without creating records", async () => {
    const fake = makeFake();
    const notJson = await deliver(fake, KEY_A, SECRET_A, "{not json");
    expect(notJson.status).toBe(400);

    const incomplete = await deliver(fake, KEY_A, SECRET_A, { caller_name: "Dana" });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error).toBe("invalid_payload");

    expect(fake.rowsOf("appointments")).toHaveLength(0);
    expect(fake.rowsOf("customers")).toHaveLength(0);
    expect(fake.rowsOf("vehicles")).toHaveLength(0);
  });

  it("reuses an existing customer and vehicle on a second, different booking", async () => {
    const fake = makeFake();
    await deliver(fake, KEY_A, SECRET_A, payload());
    const second = await deliver(fake, KEY_A, SECRET_A, payload({
      starts_at: "2026-11-21T15:00:00.000Z",
      ends_at: "2026-11-21T16:00:00.000Z",
      booking_reference: "BK-124",
      call_session_id: "session-def",
      idempotency_key: "smc:session-def:BK-124",
    }));
    expect(second.status).toBe(201);
    expect(fake.rowsOf("appointments")).toHaveLength(2);
    expect(fake.rowsOf("customers")).toHaveLength(1);
    expect(fake.rowsOf("vehicles")).toHaveLength(1);
  });
});
