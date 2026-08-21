/**
 * ServiceWriter MCP contract tests.
 *
 * Covers: tool discovery matches the committed manifest, input schemas are
 * strict/bounded, the auth gate rejects unauthenticated calls, queries are
 * tenant-scoped through RLS (no client-supplied user_id / tenant filter), and
 * no secret or credential columns are selected.
 */
import manifest from "../../../../.lovable/mcp/manifest.json";

jest.mock("../supabase", () => {
  const actual = jest.requireActual("../supabase");
  return { ...actual, supabaseForUser: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabaseForUser } = require("../supabase") as { supabaseForUser: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mcp = require("../index").default as {
  tools: Array<Record<string, any>>;
  name: string;
  version: string;
};

const TOOL_NAMES = [
  "list_appointments",
  "get_appointment",
  "list_customers",
  "get_customer_history",
  "list_services",
  "create_customer",
  "list_vehicles",
  "list_locations",
  "get_capacity",
  "get_revenue_summary",
  "get_booking_performance",
  "list_promotions",
];

const FORBIDDEN_FIELDS = [
  "management_token",
  "stripe_payment_intent_id",
  "stripe_connected_account_id",
  "stripe_refund_id",
  "access_token",
  "refresh_token",
  "smtp_password",
  "service_role",
  "drivers_license_number",
  "password",
  "api_key",
];

function toolByName(name: string) {
  const tool = mcp.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} is not registered`);
  return tool;
}

/** Minimal chainable PostgREST stub that records the filters applied. */
function stubClient(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const selects: string[] = [];
  const tables: string[] = [];
  const builder: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (resolve: (value: unknown) => unknown) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          if (prop === "select") selects.push(String(args[0] ?? ""));
          return builder;
        };
      },
    },
  );
  const client = {
    from: (table: string) => {
      tables.push(table);
      return builder;
    },
  };
  return { client, calls, selects, tables };
}

function ctx(authenticated: boolean, userId = "11111111-1111-1111-1111-111111111111") {
  return {
    isAuthenticated: () => authenticated,
    getUserId: () => (authenticated ? userId : null),
    getUserEmail: () => (authenticated ? "owner@example.com" : null),
    getClientId: () => "test-client",
    getClaims: () => ({ sub: userId }),
    getToken: () => (authenticated ? "verified-token" : null),
  } as any;
}

describe("MCP tool discovery", () => {
  it("registers exactly the documented tool surface", () => {
    expect(mcp.tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("matches the committed manifest tool-for-tool", () => {
    const manifestNames = (manifest as any).mcp.tools.map((t: any) => t.name).sort();
    expect(manifestNames).toEqual([...TOOL_NAMES].sort());
  });

  it("preserves the original six tools (backward compatibility)", () => {
    for (const name of [
      "list_appointments",
      "get_appointment",
      "list_customers",
      "get_customer_history",
      "list_services",
      "create_customer",
    ]) {
      expect(mcp.tools.some((t) => t.name === name)).toBe(true);
    }
  });

  it("describes every tool and marks read-only tools as such", () => {
    for (const tool of mcp.tools) {
      expect(String(tool.description).length).toBeGreaterThan(60);
      expect(String(tool.title).length).toBeGreaterThan(2);
      if (tool.name !== "create_customer") {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    }
  });
});

describe("auth gate", () => {
  it.each(TOOL_NAMES)("%s rejects unauthenticated callers without querying", async (name) => {
    supabaseForUser.mockClear();
    const tool = toolByName(name);
    const result = await tool.handler(
      {
        appointment_id: "11111111-1111-1111-1111-111111111111",
        customer_id: "11111111-1111-1111-1111-111111111111",
        name: "Test",
        from_date: "2026-08-01",
        to_date: "2026-08-07",
      },
      ctx(false),
    );
    expect(result.isError).toBe(true);
    expect(supabaseForUser).not.toHaveBeenCalled();
  });
});

describe("input schema validation", () => {
  it("bounds list limits and rejects malformed dates", () => {
    const appts = toolByName("list_appointments").inputSchema;
    expect(appts.limit.safeParse(500).success).toBe(false);
    expect(appts.limit.safeParse(0).success).toBe(false);
    expect(appts.limit.safeParse(25).success).toBe(true);
    expect(appts.from_date.safeParse("08/01/2026").success).toBe(false);
    expect(appts.from_date.safeParse("2026-8-1").success).toBe(false);
    expect(appts.from_date.safeParse("2026-08-01").success).toBe(true);
    expect(appts.status.safeParse("bogus_status").success).toBe(false);
    expect(appts.status.safeParse("completed").success).toBe(true);
    expect(appts.service_zone_id.safeParse("not-a-uuid").success).toBe(false);
  });

  it("requires dates on capacity and enumerates group_by values", () => {
    const capacity = toolByName("get_capacity").inputSchema;
    expect(capacity.from_date.safeParse(undefined).success).toBe(false);
    const revenue = toolByName("get_revenue_summary").inputSchema;
    expect(revenue.group_by.safeParse("region").success).toBe(false);
    expect(revenue.group_by.safeParse("city").success).toBe(true);
  });

  it("rejects out-of-range date windows instead of scanning", async () => {
    supabaseForUser.mockClear();
    const result = await toolByName("get_capacity").handler(
      { from_date: "2026-01-01", to_date: "2026-12-31" },
      ctx(true),
    );
    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toMatch(/maximum/i);
    expect(supabaseForUser).not.toHaveBeenCalled();

    const backwards = await toolByName("get_booking_performance").handler(
      { from_date: "2026-08-10", to_date: "2026-08-01" },
      ctx(true),
    );
    expect(backwards.isError).toBe(true);
  });
});

describe("tenant isolation and field hygiene", () => {
  it("never filters on a caller-supplied tenant id — scoping is RLS only", async () => {
    for (const name of ["list_appointments", "list_vehicles", "list_customers", "list_promotions"]) {
      const stub = stubClient({ data: [], error: null });
      supabaseForUser.mockReturnValue(stub.client);
      await toolByName(name).handler({}, ctx(true));
      const eqCalls = stub.calls.filter((c) => c.method === "eq").map((c) => String(c.args[0]));
      expect(eqCalls).not.toContain("user_id");
      for (const select of stub.selects) {
        expect(select).not.toMatch(/\buser_id\b/);
      }
    }
  });

  it("selects no secret, credential, or token columns", async () => {
    for (const name of TOOL_NAMES) {
      const stub = stubClient({ data: [], error: null });
      supabaseForUser.mockReturnValue(stub.client);
      await toolByName(name)
        .handler(
          {
            appointment_id: "11111111-1111-1111-1111-111111111111",
            customer_id: "11111111-1111-1111-1111-111111111111",
            name: "Schema Probe",
            from_date: "2026-08-01",
            to_date: "2026-08-07",
          },
          ctx(true),
        )
        .catch(() => undefined);
      for (const select of stub.selects) {
        for (const forbidden of FORBIDDEN_FIELDS) {
          expect(select).not.toContain(forbidden);
        }
      }
    }
  });

  it("requires a verified token before building a client", () => {
    const actual = jest.requireActual("../supabase");
    expect(() => actual.supabaseForUser(ctx(false))).toThrow(/verified OAuth token/i);
  });
});

describe("capacity computation on representative data", () => {
  it("derives capacity from configured hours and booked appointments", async () => {
    const profile = {
      timezone: "America/New_York",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      day_hours: {
        monday: { open: "09:00", close: "17:00", is_open: true },
        tuesday: { open: "09:00", close: "17:00", is_open: true },
      },
      opening_time: "09:00",
      closing_time: "17:00",
      slot_duration_minutes: 30,
      buffer_time_before: 0,
      buffer_time_after: 0,
      min_lead_time_hours: 2,
      max_advance_days: 30,
      booking_enabled: true,
    };
    const responses: Record<string, { data: unknown; error: null }> = {
      business_profiles: { data: profile, error: null },
      blocked_dates: { data: [{ blocked_date: "2026-08-18", reason: "Holiday" }], error: null },
      appointments: {
        data: [
          {
            id: "a1",
            scheduled_date: "2026-08-17",
            scheduled_time: "10:00",
            duration_minutes: 60,
            status: "confirmed",
            customer_city: "Norristown",
            customer_postal_code: "19401",
          },
          {
            id: "a2",
            scheduled_date: "2026-08-17",
            scheduled_time: "13:00",
            duration_minutes: 60,
            status: "cancelled",
            customer_city: "Norristown",
            customer_postal_code: "19401",
          },
        ],
        error: null,
      },
      technicians: { data: [{ id: "t1", name: "Tech One", is_active: true, max_jobs_per_day: 6 }], error: null },
    };

    const builderFor = (table: string) =>
      new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (value: unknown) => unknown) => resolve(responses[table]);
            }
            if (prop === "maybeSingle") return () => Promise.resolve(responses[table]);
            return () => builderFor(table);
          },
        },
      );
    supabaseForUser.mockReturnValue({ from: (table: string) => builderFor(table) });

    const result = await toolByName("get_capacity").handler(
      { from_date: "2026-08-17", to_date: "2026-08-18", city: "Norristown" },
      ctx(true),
    );

    const payload = result.structuredContent as any;
    const monday = payload.days.find((d: any) => d.date === "2026-08-17");
    // 09:00-17:00 with one active technician = 480 capacity minutes, 60 booked.
    expect(monday.capacity_minutes).toBe(480);
    expect(monday.booked_minutes).toBe(60);
    expect(monday.booked_jobs).toBe(1);
    expect(monday.cancelled_jobs).toBe(1);
    expect(monday.approx_open_slots).toBe(14);
    expect(monday.booked_in_location).toBe(1);

    const blocked = payload.days.find((d: any) => d.date === "2026-08-18");
    expect(blocked.blocked).toBe(true);
    expect(blocked.capacity_minutes).toBe(0);
    expect(payload.limitations.some((l: string) => /travel time/i.test(l))).toBe(true);
  });

  it("reports an explicit limitation when no business profile exists", async () => {
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
          if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
          return () => builder;
        },
      },
    );
    supabaseForUser.mockReturnValue({ from: () => builder });
    const result = await toolByName("get_capacity").handler(
      { from_date: "2026-08-17", to_date: "2026-08-18" },
      ctx(true),
    );
    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toMatch(/business profile/i);
  });
});
