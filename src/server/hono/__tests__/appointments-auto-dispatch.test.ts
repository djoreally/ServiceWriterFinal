/**
 * Auto-dispatch v1 at the staff creation boundary.
 *
 * Grey-box tests for POST /v1/appointments with auto-dispatch active:
 * the booking core runs the attempt after the insert, the verdict rides
 * in the response, the canonical write lands through the same mocked
 * database the other appointment tests use, and an auto-dispatch failure
 * never fails the booking.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
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
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";

const appointmentsRouter = testRouter(appointmentsRouterRaw);

const APPT_ID = "990e8400-e29b-41d4-a716-446655440002";
const TECH_ID = "880e8400-e29b-41d4-a716-446655440002";
const OWNER_ID = "880e8400-e29b-41d4-a716-446655440003";

const validCreateBody = {
  workspace_id: WS_ID,
  customer_id: CUSTOMER_ID,
  starts_at: "2026-10-01T14:00:00Z",
  ends_at: "2026-10-01T15:00:00Z",
  override_availability: true,
};

const mockLifecycle = dispatchAppointmentLifecycle as unknown as jest.Mock;

function seedCreatePath() {
  db["customers:single"] = {
    data: { id: CUSTOMER_ID, status: "active" },
    error: null,
  };
  db["workspaces:single"] = {
    data: { timezone: "UTC", name: "MOMS Mobile Oil Change" },
    error: null,
  };
  db["workspace_settings:single"] = { data: {}, error: null };
  db["appointments:single"] = {
    data: {
      id: APPT_ID,
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      status: "confirmed",
      metadata: {},
      assigned_user_id: null,
      starts_at: "2026-10-01T14:00:00Z",
      ends_at: "2026-10-01T15:00:00Z",
    },
    error: null,
  };
  // Awaited (non-single) appointments reads: the guarded assignment
  // update resolves the updated row.
  db["appointments"] = { data: [{ id: APPT_ID }], error: null };
  db["business_profiles:single"] = {
    data: { auto_dispatch_enabled: true },
    error: null,
  };
}

function createAppointment() {
  return appointmentsRouter.request("/v1/appointments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validCreateBody),
  });
}

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /v1/appointments with auto-dispatch on", () => {
  it("assigns the only eligible technician and reports the verdict", async () => {
    seedCreatePath();
    db["workspace_members"] = {
      data: [{ user_id: TECH_ID, role: "technician" }],
      error: null,
    };

    const res = await createAppointment();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(APPT_ID);
    expect(body.auto_dispatch).toMatchObject({
      enabled: true,
      assigned: true,
      technicianId: TECH_ID,
    });

    const assignmentUpdate = calls.updates.find((u) => u.table === "appointments");
    expect(assignmentUpdate).toBeDefined();
    expect(assignmentUpdate?.patch).toMatchObject({ assigned_user_id: TECH_ID });

    const eventInsert = calls.inserts.find((i) => i.table === "dispatch_events");
    expect(eventInsert).toBeDefined();
    expect(eventInsert?.rows).toMatchObject({
      workspace_id: WS_ID,
      appointment_id: APPT_ID,
      technician_id: TECH_ID,
      event_type: "assigned",
    });

    // Rule v2: the technician notice fires; the customer send never does.
    expect(mockLifecycle).toHaveBeenCalledTimes(1);
    expect(mockLifecycle.mock.calls[0][0]).toMatchObject({
      eventKey: "jobAssigned",
      recipientRole: "technician",
    });
  });

  it("assigns the owner without sending any notice", async () => {
    seedCreatePath();
    db["workspace_members"] = {
      data: [{ user_id: OWNER_ID, role: "owner" }],
      error: null,
    };

    const res = await createAppointment();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.auto_dispatch).toMatchObject({ assigned: true, technicianId: OWNER_ID });
    expect(calls.inserts.some((i) => i.table === "dispatch_events")).toBe(true);
    expect(mockLifecycle).not.toHaveBeenCalled();
  });

  it("still creates the booking when auto-dispatch itself fails", async () => {
    seedCreatePath();
    db["business_profiles:single"] = {
      data: null,
      error: new Error("business_profiles unavailable"),
    };

    const res = await createAppointment();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(APPT_ID);
    expect(body.auto_dispatch).toBeUndefined();
    expect(calls.inserts.some((i) => i.table === "dispatch_events")).toBe(false);
  });
});
