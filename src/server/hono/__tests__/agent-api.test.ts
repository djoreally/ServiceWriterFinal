/**
 * Grey-box tests for the Agent API router (REST + MCP + key management).
 *
 * Covers the three guarantees the agent contract is built on:
 *   1. Auth scoping — a key only ever works its own workspace, with only
 *      its granted scopes; revoked/expired/unknown keys are rejected.
 *   2. Availability rule enforcement — the read-side check returns the
 *      same verdicts the booking core enforces (hours, lead time,
 *      blackout, conflict).
 *   3. Booking-create attribution — bookings created with a key are
 *      priced from the catalog (callers cannot set prices) and stamped
 *      with the key's integrator, with a usage-trail row.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import { makeSupabaseLibMock as mockMakeSupabaseLibMock } from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () => mockMakeSupabaseLibMock());

import { agentApiRouter as agentApiRouterRaw } from "@/server/hono/routes/agent-api";
import { testRouter } from "../test-support/routerTest";
import { authState, calls, db, resetHarness, WS_ID, WS_ID_2, CUSTOMER_ID } from "../test-support/state";
import { generateApiKey, hashApiKey } from "@/server/agent-api/keys";

const agentApi = testRouter(agentApiRouterRaw);

const KEY_ID = "990e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";
const APPT_ID = "bb0e8400-e29b-41d4-a716-446655440001";
const ALL_SCOPES = [
  "catalog:read",
  "availability:read",
  "bookings:read",
  "bookings:create",
  "customers:read",
  "customers:create",
  "vehicles:read",
  "locations:read",
  "invoices:read",
  "reports:read",
  "promotions:read",
];

const { rawKey } = generateApiKey();

function seedKey(scopes: string[] = ALL_SCOPES, overrides: Record<string, unknown> = {}) {
  db["workspace_api_keys:single"] = {
    data: {
      id: KEY_ID,
      workspace_id: WS_ID,
      integrator: "Acme Integrations",
      scopes,
      key_hash: hashApiKey(rawKey),
      revoked_at: null,
      expires_at: null,
      ...overrides,
    },
    error: null,
  };
}

function seedScheduling(overrides: Record<string, unknown> = {}) {
  db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
  db["workspace_settings:single"] = {
    data: {
      day_hours: null,
      opening_time: "09:00",
      closing_time: "17:00",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      buffer_time_before: 0,
      buffer_time_after: 0,
      min_lead_time_hours: 0,
      slot_duration_minutes: 30,
      tax_rate: 0,
      ...overrides,
    },
    error: null,
  };
  db["workspace_blackout_dates"] = { data: [], error: null };
  db["appointments"] = { data: [], error: null };
}

/** Next Monday at the given UTC hour — always a future open weekday. */
function nextMonday(hourUtc: number): Date {
  const d = new Date();
  const delta = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

const authHeaders = { authorization: `Bearer ${rawKey}`, "content-type": "application/json" };

beforeEach(() => {
  resetHarness();
});

describe("agent key authentication + scoping", () => {
  it("rejects requests with no API key", async () => {
    const res = await agentApi.request("/v1/agent/catalog");
    expect(res.status).toBe(401);
  });

  it("rejects an unknown API key", async () => {
    db["workspace_api_keys:single"] = { data: null, error: null };
    const res = await agentApi.request("/v1/agent/catalog", { headers: authHeaders });
    expect(res.status).toBe(401);
  });

  it("rejects a revoked key", async () => {
    seedKey(ALL_SCOPES, { revoked_at: new Date().toISOString() });
    const res = await agentApi.request("/v1/agent/catalog", { headers: authHeaders });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("key_revoked");
  });

  it("rejects an expired key", async () => {
    seedKey(ALL_SCOPES, { expires_at: new Date(Date.now() - 60_000).toISOString() });
    const res = await agentApi.request("/v1/agent/catalog", { headers: authHeaders });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("key_expired");
  });

  it("rejects a key that lacks the endpoint's scope", async () => {
    seedKey(["bookings:read"]);
    const res = await agentApi.request("/v1/agent/catalog", { headers: authHeaders });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("insufficient_scope");
  });

  it("serves the catalog to a properly scoped key", async () => {
    seedKey();
    db["service_catalog"] = { data: [{ id: SERVICE_ID, name: "Full Synthetic Oil Change" }], error: null };
    const res = await agentApi.request("/v1/agent/catalog", { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.services).toHaveLength(1);
  });

  it("rejects a caller claiming another workspace (query)", async () => {
    seedKey();
    const res = await agentApi.request(`/v1/agent/catalog?workspace_id=${WS_ID_2}`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_mismatch");
  });

  it("rejects a caller claiming another workspace (booking body)", async () => {
    seedKey();
    const res = await agentApi.request("/v1/agent/bookings", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        workspace_id: WS_ID_2,
        customer_id: CUSTOMER_ID,
        starts_at: nextMonday(15).toISOString(),
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_mismatch");
  });
});

describe("availability rule enforcement", () => {
  beforeEach(() => {
    seedKey();
    seedScheduling();
  });

  it("reports an open in-hours slot as available", async () => {
    const res = await agentApi.request("/v1/agent/availability", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ starts_at: nextMonday(15).toISOString(), duration_minutes: 45 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.available).toBe(true);
    expect(body.data.violations).toEqual([]);
  });

  it("flags a slot outside business hours", async () => {
    const res = await agentApi.request("/v1/agent/availability", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ starts_at: nextMonday(20).toISOString(), duration_minutes: 45 }),
    });
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(body.data.violations).toContain("outside_business_hours");
  });

  it("flags a slot inside the minimum lead-time window", async () => {
    seedScheduling({ min_lead_time_hours: 24 * 30 });
    const res = await agentApi.request("/v1/agent/availability", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ starts_at: nextMonday(15).toISOString(), duration_minutes: 45 }),
    });
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(body.data.violations).toContain("lead_time");
  });

  it("flags a blackout date", async () => {
    db["workspace_blackout_dates"] = { data: [{ id: "blackout-1" }], error: null };
    const res = await agentApi.request("/v1/agent/availability", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ starts_at: nextMonday(15).toISOString(), duration_minutes: 45 }),
    });
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(body.data.violations).toContain("blackout_date");
  });

  it("flags a schedule conflict", async () => {
    db["appointments"] = { data: [{ id: "existing" }], error: null };
    const res = await agentApi.request("/v1/agent/availability", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ starts_at: nextMonday(15).toISOString(), duration_minutes: 45 }),
    });
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(body.data.violations).toContain("schedule_conflict");
  });
});

describe("booking create — attribution + price lock", () => {
  beforeEach(() => {
    seedKey();
    seedScheduling();
    db["customers:single"] = { data: { id: CUSTOMER_ID, status: "active" }, error: null };
    db["service_catalog:single"] = {
      data: { id: SERVICE_ID, name: "Full Synthetic Oil Change", labor_price: 119, estimated_minutes: 45, is_active: true },
      error: null,
    };
    db["appointments:single"] = { data: { id: APPT_ID, metadata: {} }, error: null };
  });

  it("books at the catalog price, stamps the integrator, and writes the usage trail", async () => {
    const res = await agentApi.request("/v1/agent/bookings", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        customer_id: CUSTOMER_ID,
        service_catalog_id: SERVICE_ID,
        starts_at: nextMonday(15).toISOString(),
        // Callers cannot set prices — this must be ignored end to end.
        estimated_cost: 0.01,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.appointment.id).toBe(APPT_ID);
    expect(body.data.appointment.metadata.integrator).toBe("Acme Integrations");
    expect(body.data.appointment.metadata.api_key_id).toBe(KEY_ID);
    expect(body.data.appointment.metadata.channel).toBe("agent_api");

    const appointmentInsert = calls.inserts.find((i) => i.table === "appointments");
    const inserted = appointmentInsert?.rows as { metadata?: { estimated_cost?: number } };
    expect(inserted.metadata?.estimated_cost).toBe(119);

    const usage = calls.inserts.find((i) => i.table === "workspace_api_key_usage");
    expect(usage).toBeTruthy();
    const usageRow = usage?.rows as { action?: string; integrator?: string; resource_id?: string };
    expect(usageRow.action).toBe("booking.create");
    expect(usageRow.integrator).toBe("Acme Integrations");
    expect(usageRow.resource_id).toBe(APPT_ID);
  });

  it("refuses to book a slot the rules reject", async () => {
    const res = await agentApi.request("/v1/agent/bookings", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        customer_id: CUSTOMER_ID,
        service_catalog_id: SERVICE_ID,
        starts_at: nextMonday(20).toISOString(),
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("outside_business_hours");
  });
});

describe("customer create — attribution", () => {
  it("stamps integrator metadata and writes the usage trail", async () => {
    seedKey();
    db["customers:single"] = { data: { id: CUSTOMER_ID, first_name: "Jamie" }, error: null };
    const res = await agentApi.request("/v1/agent/customers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ first_name: "Jamie", last_name: "Rivera", email: "jamie@example.com" }),
    });
    expect(res.status).toBe(201);
    const insert = calls.inserts.find((i) => i.table === "customers");
    const row = insert?.rows as { workspace_id?: string; metadata?: { integrator?: string } };
    expect(row.workspace_id).toBe(WS_ID);
    expect(row.metadata?.integrator).toBe("Acme Integrations");
    const usage = calls.inserts.find((i) => i.table === "workspace_api_key_usage");
    expect((usage?.rows as { action?: string }).action).toBe("customer.create");
  });
});

describe("key management (staff session)", () => {
  it("creates a key, returns the raw key once, and stores only its hash", async () => {
    authState.role = "owner";
    db["workspace_api_keys:single"] = {
      data: {
        id: KEY_ID,
        workspace_id: WS_ID,
        name: "Booking agent",
        integrator: "Acme Integrations",
        key_prefix: "sw_live_test",
        scopes: ["catalog:read"],
        created_by_user_id: null,
        created_at: new Date().toISOString(),
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
      },
      error: null,
    };
    const res = await agentApi.request("/v1/agent/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: WS_ID,
        name: "Booking agent",
        integrator: "Acme Integrations",
        scopes: ["catalog:read"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.raw_key).toMatch(/^sw_live_/);
    const insert = calls.inserts.find((i) => i.table === "workspace_api_keys");
    const row = insert?.rows as { key_hash?: string };
    expect(row.key_hash).toBe(hashApiKey(body.data.raw_key));
    expect(row.key_hash).not.toBe(body.data.raw_key);
  });

  it("forbids key creation for non-admin members", async () => {
    authState.role = "technician";
    const res = await agentApi.request("/v1/agent/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: WS_ID,
        name: "Nope",
        integrator: "Nope",
        scopes: ["catalog:read"],
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe("MCP surface", () => {
  it("initialize answers without a key", async () => {
    const res = await agentApi.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("servicewriter");
  });

  it("tools/list requires a key and exposes the designed tools plus booking writes", async () => {
    const noKey = await agentApi.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const noKeyBody = await noKey.json();
    expect(noKeyBody.error.code).toBe(-32001);

    seedKey();
    const res = await agentApi.request("/mcp", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    const body = await res.json();
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name);
    for (const designed of [
      "list_appointments",
      "get_appointment",
      "list_customers",
      "get_customer_history",
      "list_services",
      "list_vehicles",
      "list_locations",
      "get_capacity",
      "get_revenue_summary",
      "get_booking_performance",
      "list_promotions",
      "create_customer",
    ]) {
      expect(names).toContain(designed);
    }
    expect(names).toContain("check_availability");
    expect(names).toContain("get_booking_rules");
    expect(names).toContain("create_booking");
    expect(names).toHaveLength(15);
  });

  it("tools/call runs through the same service layer and scope checks", async () => {
    seedKey(["catalog:read"]);
    db["service_catalog"] = { data: [{ id: SERVICE_ID, name: "Full Synthetic Oil Change" }], error: null };
    const ok = await agentApi.request("/mcp", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_services", arguments: {} },
      }),
    });
    const okBody = await ok.json();
    expect(okBody.result.isError).toBe(false);
    expect(okBody.result.content[0].text).toContain("Full Synthetic Oil Change");

    const denied = await agentApi.request("/mcp", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "create_booking", arguments: { starts_at: nextMonday(15).toISOString() } },
      }),
    });
    const deniedBody = await denied.json();
    expect(deniedBody.result.isError).toBe(true);
    expect(deniedBody.result.content[0].text).toContain("bookings:create");
  });
});
