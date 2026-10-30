/**
 * Grey-box tests for the appointments Hono router.
 * Drives the router over HTTP with Supabase + messaging pipelines mocked.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  appointmentEventsFactory as mockAppointmentEventsFactory,
  lifecycleActionUrlsFactory as mockLifecycleActionUrlsFactory,
  lifecycleEventsFactory as mockLifecycleEventsFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  stripeInvoiceSyncFactory as mockStripeInvoiceSyncFactory,
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
jest.mock("@/server/messaging/appointment-events", () =>
  mockAppointmentEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/messaging/lifecycle-action-urls", () =>
  mockLifecycleActionUrlsFactory(),
);

import { appointmentsRouter as appointmentsRouterRaw } from "@/server/hono/routes/appointments";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const appointmentsRouter = testRouter(appointmentsRouterRaw);

const APPT_ID = "990e8400-e29b-41d4-a716-446655440001";

const validCreateBody = {
  workspace_id: WS_ID,
  customer_id: CUSTOMER_ID,
  starts_at: "2026-10-01T14:00:00Z",
  ends_at: "2026-10-01T15:00:00Z",
  override_availability: true,
};

beforeEach(() => {
  resetHarness();
});

describe("appointments router", () => {
  describe("GET /v1/appointments", () => {
    it("lists appointments with pagination for a member", async () => {
      db.appointments = {
        data: [{ id: APPT_ID, status: "confirmed" }],
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}&limit=10&offset=0`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toEqual({ limit: 10, offset: 0 });
    });

    it("requires workspace_id", async () => {
      const res = await appointmentsRouter.request("/v1/appointments");
      // Grey-box: the handler throws a plain Error; the contract maps it to 500.
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("internal_error");
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthenticated");
    });

    it("returns 403 for non-members", async () => {
      authState.mode = "forbidden";
      const res = await appointmentsRouter.request(
        `/v1/appointments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/appointments", () => {
    function seedHappyPath() {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, status: "active" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      db["workspace_settings:single"] = { data: {}, error: null };
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
    }

    it("creates an appointment and returns 201", async () => {
      seedHappyPath();
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(APPT_ID);
      // A create writes two rows: the appointment itself, plus the
      // audit_events record from the route's logMutation call
      // (action "appointment.created"). The audit write is part of the
      // current contract, so the insert count is 2, not 1.
      expect(calls.inserts).toHaveLength(2);
      expect(calls.inserts[0].table).toBe("appointments");
      expect(calls.inserts[1].table).toBe("audit_events");
      expect(
        (calls.inserts[1].rows as Record<string, unknown>).action,
      ).toBe("appointment.created");
    });

    it("rejects an unknown customer with 400", async () => {
      db["customers:single"] = { data: null, error: null };
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_customer");
      expect(calls.inserts).toHaveLength(0);
    });

    it("rejects ends_at before starts_at", async () => {
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validCreateBody,
          ends_at: "2026-10-01T13:00:00Z",
        }),
      });
      // zod superRefine violation -> ZodError -> 400 invalid_input via
      // errorResponse: client validation failures are a 400, never a 500.
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
    });

    it("enforces staff roles on create", async () => {
      authState.role = "technician";
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v1/appointments/:id", () => {
    it("returns the appointment with explicit workspace_id", async () => {
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(APPT_ID);
    });

    it("rejects a malformed id with 404 (route pattern only matches uuid-shaped ids)", async () => {
      const res = await appointmentsRouter.request(
        `/v1/appointments/not-a-uuid?workspace_id=${WS_ID}`,
      );
      // The GET route is registered with an id pattern of
      // {[0-9a-fA-F-]{36}}, so a malformed id matches no route and the
      // router answers 404 rather than reaching the handler at all.
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /v1/appointments/:id", () => {
    const current = {
      id: APPT_ID,
      workspace_id: WS_ID,
      customer_id: null,
      vehicle_id: null,
      location_id: null,
      starts_at: "2026-10-01T14:00:00Z",
      ends_at: "2026-10-01T15:00:00Z",
      status: "scheduled",
      assigned_user_id: null,
      metadata: {},
    };

    it("applies a status/notes patch and returns 200", async () => {
      db["appointments:single"] = {
        data: { ...current, status: "confirmed", notes: "updated" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_id: WS_ID,
            status: "confirmed",
            notes: "updated",
          }),
        },
      );
      expect(res.status).toBe(200);
      expect(calls.updates).toHaveLength(1);
      expect(calls.updates[0].table).toBe("appointments");
    });

    it("enforces staff roles on update", async () => {
      authState.role = "technician";
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, notes: "x" }),
        },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /v1/appointments/:id", () => {
    it("soft-cancels the appointment and returns 200", async () => {
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "cancelled" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      expect(calls.updates).toHaveLength(1);
      expect(
        (calls.updates[0].patch as Record<string, unknown>).status,
      ).toBe("cancelled");
      expect((await res.json()).data.status).toBe("cancelled");
    });
  });

  describe("Google Calendar auto-sync", () => {
    function seedConnectedUser(action = "created") {
      db["google_calendar_sync_tokens"] = {
        data: { sync_enabled: true },
        error: null,
      };
      db["fn:google-calendar-sync"] = {
        data: { synced: true, action, google_event_id: "evt-1" },
        error: null,
      };
    }

    function seedCreateHappyPath() {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, status: "active" },
        error: null,
      };
      db["workspaces:single"] = { data: { timezone: "UTC" }, error: null };
      db["workspace_settings:single"] = { data: {}, error: null };
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "confirmed" },
        error: null,
      };
    }

    /** calendar_sync records written by the auto-sync hook (not the route's own update). */
    function calendarSyncRecords() {
      return calls.updates
        .map((u) => (u.patch as Record<string, unknown>).metadata)
        .filter(
          (metadata): metadata is Record<string, unknown> =>
            Boolean(metadata) && typeof metadata === "object" && "calendar_sync" in metadata,
        )
        .map((metadata) => metadata.calendar_sync as Record<string, unknown>);
    }

    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("syncs on create and records a synced status in metadata", async () => {
      seedCreateHappyPath();
      seedConnectedUser("created");
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("created");
      expect(records[0].google_event_id).toBe("evt-1");
    });

    it("syncs on update (reschedule) and records the updated action", async () => {
      seedConnectedUser("updated");
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          workspace_id: WS_ID,
          starts_at: "2026-10-01T16:00:00Z",
          ends_at: "2026-10-01T17:00:00Z",
          status: "confirmed",
          metadata: {},
        },
        error: null,
      };
      db["workspaces:single"] = { data: { name: "Test Shop", timezone: "UTC" }, error: null };
      const res = await appointmentsRouter.request(`/v1/appointments/${APPT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: WS_ID,
          starts_at: "2026-10-01T16:00:00Z",
        }),
      });
      expect(res.status).toBe(200);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("updated");
    });

    it("syncs on cancel so the edge function removes the calendar event", async () => {
      seedConnectedUser("deleted");
      db["appointments:single"] = {
        data: { id: APPT_ID, status: "cancelled", metadata: {} },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("synced");
      expect(records[0].action).toBe("deleted");
    });

    it("still returns 201 when the edge function fails, recording a failed sync status", async () => {
      seedCreateHappyPath();
      db["google_calendar_sync_tokens"] = {
        data: { sync_enabled: true },
        error: null,
      };
      db["fn:google-calendar-sync"] = {
        data: null,
        error: new Error("edge function unavailable"),
      };
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);

      const records = calendarSyncRecords();
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("failed");
      expect(records[0].error).toContain("edge function unavailable");
    });

    it("does not touch calendar state when the user never connected Google", async () => {
      seedCreateHappyPath();
      // No google_calendar_sync_tokens row and no edge-function stub.
      const res = await appointmentsRouter.request("/v1/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCreateBody),
      });
      expect(res.status).toBe(201);
      expect(calendarSyncRecords()).toHaveLength(0);
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("POST /v1/appointments/:id/complete", () => {
    it("runs closeout and returns completion summary", async () => {
      db["workspace_members"] = {
        data: [{ workspace_id: WS_ID }],
        error: null,
      };
      db["rpc:complete_appointment_closeout_v1"] = {
        data: { service_record_id: "sr-1", invoice_id: "", payment_id: "" },
        error: null,
      };
      db["workspace_billing:single"] = { data: null, error: null };
      db["appointments:single"] = {
        data: {
          id: APPT_ID,
          status: "completed",
          customer_id: CUSTOMER_ID,
          metadata: {},
        },
        error: null,
      };
      db["workspaces:single"] = {
        data: { name: "Test Shop", timezone: "UTC" },
        error: null,
      };
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.service_record_id).toBe("sr-1");
      expect(body.data.completion_email.status).toBe("queued");
      expect(
        calls.rpc.some((r) => r.fn === "complete_appointment_closeout_v1"),
      ).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await appointmentsRouter.request(
        `/v1/appointments/${APPT_ID}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID }),
        },
      );
      expect(res.status).toBe(401);
    });
  });

  describe("route registration", () => {
    it("exposes the dispatch event endpoints", async () => {
      db["dispatch_events"] = { data: [], error: null };
      const res = await appointmentsRouter.request(
        `/v1/dispatch-events?workspace_id=${WS_ID}`,
      );
      expect([200, 400, 401, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await appointmentsRouter.request("/v1/appointments-zzz");
      expect(res.status).toBe(404);
    });
  });
});
