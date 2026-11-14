/**
 * Job-step notifications at the tech-app doors (2026-11-13):
 *
 * 1. POST /v1/tech-app/jobs/:appointmentId/step-notification —
 *    the call the app makes the moment a stepper button advances
 *    a step. Tech-app scope (the caller's own assigned job), the
 *    app's step vocabulary mapped to the server's (in_progress →
 *    started), and the fan-out's report returned verbatim.
 *
 * 2. The sync push hook — a transition that lands via
 *    POST /v1/tech-app/sync/push fires the same fan-out (the
 *    offline path); a re-push of an already-applied transition
 *    fires nothing (and the fan-out's deterministic event ids
 *    dedupe against the door besides — service-level tests pin
 *    those).
 *
 * The fan-out itself is mocked here; its behavior is pinned in
 * src/server/messaging/job-status-notifications.test.ts.
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
jest.mock("@/lib/supabase", () => mockMakeSupabaseLibMock());
jest.mock("@/server/messaging/job-status-notifications", () => ({
  notifyJobStepAdvanced: jest.fn(async (input: { appointmentId: string; step: string }) => ({
    appointmentId: input.appointmentId,
    step: input.step,
    notifications: [
      {
        channel: "email",
        role: "customer",
        recipient: "casey@example.com",
        status: "queued",
        templateKey: "technician_and_live_service_sequence.technician_en_route",
        at: "2026-11-13T19:00:00.000Z",
      },
    ],
  })),
}));

import { workOrdersRouter as workOrdersRouterRaw } from "@/server/hono/routes/work-orders";
import { notifyJobStepAdvanced } from "@/server/messaging/job-status-notifications";
import { testRouter } from "../test-support/routerTest";
import {
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const router = testRouter(workOrdersRouterRaw);
const notifyMock = notifyJobStepAdvanced as unknown as jest.Mock;

const APPT = "990e8400-e29b-41d4-a716-446655440021";
const OTHER_USER = "660e8400-e29b-41d4-a716-446655440777";

function seedMembership() {
  db["workspace_members"] = { data: [{ workspace_id: WS_ID }], error: null };
}

function doorRequest(step: unknown) {
  return router.request(`/v1/tech-app/jobs/${APPT}/step-notification`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step }),
  });
}

describe("POST /v1/tech-app/jobs/:appointmentId/step-notification", () => {
  beforeEach(() => {
    resetHarness();
    seedMembership();
  });

  it("fans out once for the caller's own job and returns the report", async () => {
    db["appointments:single"] = {
      data: { id: APPT, assigned_user_id: USER_ID },
      error: null,
    };
    const res = await doorRequest("en_route");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.appointment_id).toBe(APPT);
    expect(body.data.step).toBe("en_route");
    expect(body.data.notifications).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        workspaceId: WS_ID,
        appointmentId: APPT,
        step: "en_route",
        actorUserId: USER_ID,
      }),
    );
  });

  it("maps the app's in_progress step to the server's started transition", async () => {
    db["appointments:single"] = {
      data: { id: APPT, assigned_user_id: USER_ID },
      error: null,
    };
    const res = await doorRequest("in_progress");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.step).toBe("in_progress");
    expect(notifyMock.mock.calls[0][0].step).toBe("started");
  });

  it("refuses a job assigned to someone else and sends nothing", async () => {
    db["appointments:single"] = {
      data: { id: APPT, assigned_user_id: OTHER_USER },
      error: null,
    };
    const res = await doorRequest("en_route");
    expect(res.status).toBe(403);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("404s a job that is not in the caller's workspace", async () => {
    db["appointments:single"] = { data: null, error: null };
    const res = await doorRequest("en_route");
    expect(res.status).toBe(404);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("rejects a step outside the workflow vocabulary", async () => {
    db["appointments:single"] = {
      data: { id: APPT, assigned_user_id: USER_ID },
      error: null,
    };
    const res = await doorRequest("assigned");
    expect(res.status).toBe(400);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("sync push — the offline path notifies when a transition lands", () => {
  const TECH_ID = "880e8400-e29b-41d4-a716-446655440001";

  function seedPushWorld(appt: Record<string, unknown>) {
    seedMembership();
    db["appointments"] = { data: [appt], error: null };
    db["technicians:single"] = { data: { id: TECH_ID }, error: null };
  }

  function pushJob(status: string) {
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
                status,
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

  beforeEach(() => {
    resetHarness();
  });

  it("an en_route transition that lands fires the fan-out for that step", async () => {
    seedPushWorld({
      id: APPT,
      vehicle_id: null,
      status: "scheduled",
      dispatch_status: null,
      completed_at: null,
    });
    const res = await pushJob("en_route");
    expect(res.status).toBe(200);
    const transitions = calls.rpc.filter((r) => r.fn === "technician_transition_job_v2");
    expect(transitions).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ appointmentId: APPT, step: "en_route", workspaceId: WS_ID }),
    );
  });

  it("a re-push of an already-applied transition fires nothing", async () => {
    seedPushWorld({
      id: APPT,
      vehicle_id: null,
      status: "en_route",
      dispatch_status: "en_route",
      completed_at: null,
    });
    const res = await pushJob("en_route");
    expect(res.status).toBe(200);
    expect(calls.rpc.filter((r) => r.fn === "technician_transition_job_v2")).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
