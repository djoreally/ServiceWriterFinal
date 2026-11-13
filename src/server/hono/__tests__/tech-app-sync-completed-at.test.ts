/**
 * SW-87 (SW-23 follow-up): the tech app stamps jobs.completed_at
 * on-device at Complete Job (Watermelon schema v5) and pushes it
 * with the job change set — but the server mapping dropped it: the
 * push read only the job's status, the transition RPC stamps the
 * appointment with the server's now(), and the pull's local job
 * shape had no completed_at at all. The device's actual finish
 * time lived only on the phone that did the job.
 *
 * These tests run the round trip against the actual sync handlers
 * in the repo's grey-box harness: push a completed job carrying
 * its stamp → the stamp lands on the server record (the captured
 * appointments update) → re-seed the server record as written and
 * pull → the same value comes back for a fresh device.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
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
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const router = testRouter(workOrdersRouterRaw);

const APPT = "990e8400-e29b-41d4-a716-446655440021";
const CUST = "770e8400-e29b-41d4-a716-446655440021";
const VEH = "aa0e8400-e29b-41d4-a716-446655440021";
const TECH_ID = "880e8400-e29b-41d4-a716-446655440001";

/** The moment the technician tapped Complete Job on the device. */
const STAMP_ISO = "2026-11-13T15:42:00.000Z";
const STAMP_MS = Date.parse(STAMP_ISO);
const ORIGINAL_ISO = "2026-11-13T15:30:00.000Z";

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPT,
    workspace_id: WS_ID,
    customer_id: CUST,
    vehicle_id: VEH,
    assigned_user_id: USER_ID,
    status: "in_progress",
    dispatch_status: "started",
    starts_at: "2026-11-13T14:00:00.000Z",
    ends_at: "2026-11-13T14:45:00.000Z",
    source: "office",
    confirmation_code: "RT-1",
    notes: null,
    metadata: { dispatch_status: "started" },
    created_at: "2026-11-12T15:00:00.000Z",
    updated_at: "2026-11-13T14:02:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function seedWorld(appt: Record<string, unknown>) {
  db["workspace_members"] = { data: [{ workspace_id: WS_ID }], error: null };
  db["appointments"] = { data: [appt], error: null };
  db["customers"] = {
    data: [
      { id: CUST, first_name: "Round", last_name: "Trip", company_name: null, email: null, phone: "215-555-0142", address_line1: "1 Main St", address_line2: null, city: "Ambler", region: "PA", postal_code: "19002" },
    ],
    error: null,
  };
  db["vehicles"] = {
    data: [
      { id: VEH, vin: "1FTBR1Y86PKB51521", year: 2023, make: "Ford", model: "Transit T250", trim: null, mileage: 57700, license_plate: "ZXB-9797" },
    ],
    error: null,
  };
  db["appointment_items"] = { data: [], error: null };
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

function pushCompleted(completedAt: unknown) {
  return router.request("/v1/tech-app/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      changes: {
        jobs: {
          created: [],
          updated: [
            {
              id: APPT,
              server_id: APPT,
              status: "completed",
              completed_at: completedAt,
              updated_at: "2026-11-13T15:42:05.000Z",
            },
          ],
          deleted: [],
        },
      },
      last_pulled_at: 0,
    }),
  });
}

const appointmentUpdates = () =>
  calls.updates.filter((u) => u.table === "appointments");

describe("tech-app sync completed_at round trip (SW-87)", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("push persists the device stamp on the server record, and pull returns it verbatim", async () => {
    seedWorld(appointmentRow());

    // The device pushes the completed job; the stamp travels as an
    // epoch-ms number, the Watermelon date-column wire form.
    const pushRes = await pushCompleted(STAMP_MS);
    expect(pushRes.status).toBe(200);
    const pushBody = (await pushRes.json()) as any;
    expect(pushBody?.data?.applied?.jobs?.updated).toBe(1);
    expect(pushBody?.data?.errors?.jobs).toBeUndefined();

    // The completion itself still rides the canonical transition RPC.
    const transitions = calls.rpc.filter((r) => r.fn === "technician_transition_job_v2");
    expect(transitions).toHaveLength(1);
    expect((transitions[0].params as any).p_next_status).toBe("completed");
    expect((transitions[0].params as any).p_job_id).toBe(APPT);

    // The stamp landed on the server record, normalized to ISO.
    expect(appointmentUpdates()).toEqual([
      { table: "appointments", patch: { completed_at: STAMP_ISO } },
    ]);

    // The server record as written (the update above is the write):
    // a fresh device pulling now sees the same completion time.
    seedWorld(
      appointmentRow({
        status: "completed",
        dispatch_status: "completed",
        metadata: { dispatch_status: "completed" },
        completed_at: STAMP_ISO,
        updated_at: "2026-11-13T15:42:05.000Z",
      }),
    );
    const pullRes = await router.request("/v1/tech-app/sync/pull?last_pulled_at=0");
    expect(pullRes.status).toBe(200);
    const pullBody = (await pullRes.json()) as any;
    const created = pullBody?.data?.changes?.jobs?.created ?? [];
    expect(created).toHaveLength(1);
    expect(created[0].id).toBe(APPT);
    expect(created[0].status).toBe("completed");
    expect(created[0].completed_at).toBe(STAMP_ISO);
  });

  it("accepts the stamp as an ISO string too", async () => {
    seedWorld(appointmentRow());
    const res = await pushCompleted(STAMP_ISO);
    expect(res.status).toBe(200);
    expect(appointmentUpdates()).toEqual([
      { table: "appointments", patch: { completed_at: STAMP_ISO } },
    ]);
  });

  it("first stamp wins: a re-push never overwrites the stamp already on the record", async () => {
    seedWorld(
      appointmentRow({
        status: "completed",
        dispatch_status: "completed",
        metadata: { dispatch_status: "completed" },
        completed_at: ORIGINAL_ISO,
      }),
    );
    const res = await pushCompleted(STAMP_MS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body?.data?.applied?.jobs?.updated).toBe(0);
    expect(body?.data?.applied?.jobs?.skipped).toBe(1);
    expect(calls.rpc.filter((r) => r.fn === "technician_transition_job_v2")).toHaveLength(0);
    expect(appointmentUpdates()).toEqual([]);
  });

  it("lands a missing stamp on an already-completed job without re-running the transition", async () => {
    seedWorld(
      appointmentRow({
        status: "completed",
        dispatch_status: "completed",
        metadata: { dispatch_status: "completed" },
        completed_at: null,
      }),
    );
    const res = await pushCompleted(STAMP_MS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body?.data?.applied?.jobs?.updated).toBe(1);
    expect(calls.rpc.filter((r) => r.fn === "technician_transition_job_v2")).toHaveLength(0);
    expect(appointmentUpdates()).toEqual([
      { table: "appointments", patch: { completed_at: STAMP_ISO } },
    ]);
  });
});
