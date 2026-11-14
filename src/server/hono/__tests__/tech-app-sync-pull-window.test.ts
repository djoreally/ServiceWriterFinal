/**
 * Window regression (2026-11-14, LIVE): a completed job older than
 * 36 hours vanished from the tech app. The sync pull (and the jobs
 * door) windowed appointments to starts_at >= now − 36h, so when
 * the Nov 13 app redeploys forced fresh full pulls, Dave
 * Hamilton's completed Nov 12 jobs fell outside the window and
 * dropped off the phone. The server records never changed — the
 * office app showed both jobs the whole time; only the phone's
 * display window lost them.
 *
 * Fix: the look-back widened to −31 days on BOTH doors, symmetric
 * with the +31-day forward horizon Ty ruled on 2026-11-11 (the
 * phone shows the whole coming month; it now keeps the whole
 * month behind too). Location pings deliberately keep their own
 * transient 36h look-back — GPS history is a live trail, not a
 * job record.
 *
 * The grey-box harness (test-support/state.ts) discards filter
 * arguments, so these tests swap in a RECORDING query builder and
 * pin the exact bounds the handlers send to PostgREST, with
 * Date.now frozen: the bounds are the contract — PostgREST applies
 * them verbatim. Fixture start times are asserted against the
 * recorded bounds (10 days ago is inside, 40 days ago is outside).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);

import { workOrdersRouter as workOrdersRouterRaw } from "@/server/hono/routes/work-orders";
import { testRouter } from "../test-support/routerTest";
import {
  db,
  mockSupabase,
  resetHarness,
  USER_ID,
  WS_ID,
  type DbResult,
} from "../test-support/state";

const router = testRouter(workOrdersRouterRaw);

// Frozen "now": Saturday Nov 14, 2026, noon UTC.
const NOW_ISO = "2026-11-14T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const EXPECTED_WINDOW_START = "2026-10-14T12:00:00.000Z"; // now − 31 days
const EXPECTED_WINDOW_END = "2026-12-15T12:00:00.000Z"; // now + 31 days
const EXPECTED_LOCATION_START = "2026-11-13T00:00:00.000Z"; // now − 36 hours

const CUST = "770e8400-e29b-41d4-a716-446655440021";
const VEH = "aa0e8400-e29b-41d4-a716-446655440021";
const APPT_DONE_10D = "990e8400-e29b-41d4-a716-446655440021";
const APPT_CANCELLED = "990e8400-e29b-41d4-a716-446655440022";
const CAT_OIL = "bb0e8400-e29b-41d4-a716-446655440021";
const TECH_ID = "880e8400-e29b-41d4-a716-446655440021";

// Fixture start times the window must classify correctly.
const START_10D_AGO = "2026-11-04T15:00:00.000Z"; // inside the widened window
const START_40D_AGO = "2026-10-05T15:00:00.000Z"; // still outside it

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}
const recorded: RecordedCall[] = [];

function resultFor(table: string, terminal?: "single"): DbResult {
  const key = terminal ? `${table}:${terminal}` : table;
  return db[key] ?? db[table] ?? { data: null, error: null };
}

/**
 * Same chainable/thenable contract as the harness builder in
 * test-support/state.ts, but every chained call is recorded so the
 * test can assert the exact filter bounds a handler computed.
 */
function recordingBuilder(table: string): unknown {
  const builder = new Proxy(function () {}, {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (resolve: (value: DbResult) => void) => resolve(resultFor(table));
      }
      if (prop === "single" || prop === "maybeSingle") {
        return async () => resultFor(table, "single");
      }
      if (typeof prop === "string") {
        return (...args: unknown[]) => {
          recorded.push({ table, method: prop, args });
          return recordingBuilder(table);
        };
      }
      return undefined;
    },
    apply() {
      return recordingBuilder(table);
    },
  });
  return builder;
}

function callsFor(table: string, method: string, column: string): unknown[] {
  return recorded
    .filter((call) => call.table === table && call.method === method && call.args[0] === column)
    .map((call) => call.args[1]);
}

function seedWindowCensus() {
  db["workspace_members"] = { data: [{ workspace_id: WS_ID }], error: null };
  db["appointments"] = {
    data: [
      {
        id: APPT_DONE_10D,
        workspace_id: WS_ID,
        customer_id: CUST,
        vehicle_id: VEH,
        assigned_user_id: USER_ID,
        status: "completed",
        dispatch_status: "completed",
        starts_at: START_10D_AGO,
        ends_at: "2026-11-04T15:45:00.000Z",
        source: "office",
        confirmation_code: "DAVE-10D",
        notes: null,
        metadata: {},
        created_at: "2026-11-01T15:00:00.000Z",
        updated_at: "2026-11-04T16:05:00.000Z",
        completed_at: "2026-11-04T16:05:00.000Z",
      },
      {
        id: APPT_CANCELLED,
        workspace_id: WS_ID,
        customer_id: CUST,
        vehicle_id: VEH,
        assigned_user_id: USER_ID,
        status: "cancelled",
        dispatch_status: null,
        starts_at: "2026-11-10T15:00:00.000Z",
        ends_at: "2026-11-10T15:45:00.000Z",
        source: "office",
        confirmation_code: "CNCL-1",
        notes: null,
        metadata: {},
        created_at: "2026-11-09T15:00:00.000Z",
        updated_at: "2026-11-10T09:00:00.000Z",
        completed_at: null,
      },
    ],
    error: null,
  };
  db["customers"] = {
    data: [
      { id: CUST, first_name: "Dave", last_name: "Hamilton", company_name: "Atlantic Refrigeration Company", email: "dave@atlanticice.com", phone: "215-426-4722", address_line1: "529 E Thompson St", address_line2: null, city: "Philadelphia", region: "PA", postal_code: "19125" },
    ],
    error: null,
  };
  db["vehicles"] = {
    data: [
      { id: VEH, vin: "1FTBR1Y86PKB51521", year: 2023, make: "Ford", model: "Transit T250", trim: null, mileage: 57700, license_plate: "ZXB-9797" },
    ],
    error: null,
  };
  db["appointment_items"] = {
    data: [
      { id: "cc21", appointment_id: APPT_DONE_10D, service_catalog_id: CAT_OIL, item_type: "service", description: "Oil Change Service", quantity: 1, unit_price: 120, sort_order: 0, service_catalog: { id: CAT_OIL, name: "Oil Change Service" } },
    ],
    error: null,
  };
  db["service_playbooks"] = { data: [], error: null };
  db["service_playbook_templates"] = { data: [], error: null };
  db["service_inspections"] = { data: [], error: null };
  db["service_recommendations"] = { data: [], error: null };
  db["job_photos"] = { data: [], error: null };
  db["inspection_results"] = { data: [], error: null };
  db["location_history"] = { data: [], error: null };
  db["job_execution_checklists"] = { data: [], error: null };
  db["technicians:single"] = { data: { id: TECH_ID }, error: null };
}

const originalFrom = mockSupabase.from as (table: string) => unknown;
let nowSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  resetHarness();
  recorded.length = 0;
  seedWindowCensus();
  (mockSupabase as Record<string, unknown>).from = (table: string) =>
    recordingBuilder(table);
  nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
});

afterEach(() => {
  (mockSupabase as Record<string, unknown>).from = originalFrom;
  nowSpy.mockRestore();
});

describe("GET /v1/tech-app/sync/pull — appointment window (2026-11-14 widening)", () => {
  it("queries appointments from now−31d to now+31d: 10 days ago is in, 40 days ago is out", async () => {
    const res = await router.request("/v1/tech-app/sync/pull?last_pulled_at=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body?.data?.timestamp).toBe(NOW_MS);

    const starts = callsFor("appointments", "gte", "starts_at");
    const ends = callsFor("appointments", "lt", "starts_at");
    expect(starts).toContain(EXPECTED_WINDOW_START);
    expect(ends).toContain(EXPECTED_WINDOW_END);

    // The classification the phone's jobs live or die by, computed
    // against the bounds the handler actually sent.
    const windowStart = starts[0] as string;
    const windowEnd = ends[0] as string;
    expect(START_10D_AGO >= windowStart && START_10D_AGO < windowEnd).toBe(true);
    expect(START_40D_AGO >= windowStart).toBe(false);
  });

  it("a completed job inside the widened window is created on a full pull", async () => {
    const res = await router.request("/v1/tech-app/sync/pull?last_pulled_at=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const jobs = body?.data?.changes?.jobs;
    const createdIds = (jobs?.created ?? []).map((row: Record<string, any>) => row.id);
    expect(createdIds).toContain(APPT_DONE_10D);
  });

  it("a cancelled appointment inside the window still lands in deleted", async () => {
    const res = await router.request("/v1/tech-app/sync/pull?last_pulled_at=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const jobs = body?.data?.changes?.jobs;
    expect(jobs?.deleted ?? []).toContain(APPT_CANCELLED);
    const upsertedIds = [...(jobs?.created ?? []), ...(jobs?.updated ?? [])].map(
      (row: Record<string, any>) => row.id,
    );
    expect(upsertedIds).not.toContain(APPT_CANCELLED);
  });

  it("the moved-away deletes query on incremental pulls uses the same widened window", async () => {
    const lastPulled = NOW_MS - 24 * 60 * 60 * 1000; // pulled yesterday
    const res = await router.request(
      `/v1/tech-app/sync/pull?last_pulled_at=${lastPulled}`,
    );
    expect(res.status).toBe(200);
    // Census query + moved-away query both bound starts_at below
    // by the SAME widened window start — never the old 36h.
    const starts = callsFor("appointments", "gte", "starts_at");
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const bound of starts) {
      expect(bound).toBe(EXPECTED_WINDOW_START);
    }
    // The moved-away query is the one carrying the .or(…) filter.
    const orCalls = recorded.filter(
      (call) => call.table === "appointments" && call.method === "or",
    );
    expect(orCalls.length).toBe(1);
  });

  it("location pings keep their own 36h look-back and never widen", async () => {
    const res = await router.request("/v1/tech-app/sync/pull?last_pulled_at=0");
    expect(res.status).toBe(200);
    const locationStarts = callsFor("location_history", "gte", "recorded_at");
    expect(locationStarts).toEqual([EXPECTED_LOCATION_START]);
  });
});

describe("GET /v1/tech-app/jobs — the jobs door agrees with the pull window", () => {
  it("queries appointments from now−31d to now+31d", async () => {
    const res = await router.request("/v1/tech-app/jobs");
    expect(res.status).toBe(200);
    const starts = callsFor("appointments", "gte", "starts_at");
    const ends = callsFor("appointments", "lt", "starts_at");
    expect(starts).toEqual([EXPECTED_WINDOW_START]);
    expect(ends).toEqual([EXPECTED_WINDOW_END]);
  });
});
