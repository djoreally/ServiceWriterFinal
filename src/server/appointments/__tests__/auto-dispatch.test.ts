/**
 * Auto-dispatch v1 — decision, canonical write, and rule-v2 notifications.
 *
 * Drives `autoDispatchNewAppointment` / `attemptAutoDispatchNewAppointment`
 * against a stateful in-memory Supabase stand-in. The lifecycle seam and
 * Sentry are mocked so the tests can prove exactly which notifications
 * the automatic path invokes — and, for the customer leg, that it never
 * invokes any.
 */
import { jest } from "@jest/globals";

jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/server/sentry", () => ({ captureServerError: jest.fn() }));
jest.mock("@/server/messaging/appointment-events", () => ({
  dispatchAppointmentLifecycle: jest.fn(),
}));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  LIFECYCLE_EVENT_KEYS: {
    technicianAssigned: "appointment_booking_sequence.technician_assigned",
    jobAssigned: "appointment_booking_sequence.new_job_assigned",
  },
  dispatchLifecycleEvent: jest.fn(),
}));

import {
  attemptAutoDispatchNewAppointment,
  autoDispatchNewAppointment,
} from "@/server/appointments/auto-dispatch";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { captureServerError } from "@/server/sentry";

const WS_ID = "ws-1";
const APPT_ID = "appt-1";
const TECH_ID = "tech-1";
const OWNER_ID = "owner-1";
const MANAGER_ID = "manager-1";
const PERFORMER_ID = "staff-1";
const REQUEST_URL = "https://www.servicewriter.xyz/api/v1/appointments";

const mockLifecycle = dispatchAppointmentLifecycle as jest.Mock;
const mockCapture = captureServerError as jest.Mock;

interface MockState {
  profile: { auto_dispatch_enabled: boolean } | null;
  profileError: unknown;
  members: Array<{ user_id: string; role: string }>;
  appointment: Record<string, any> | null;
  workspace: { name: string; timezone: string } | null;
  technicianRow: Record<string, any> | null;
  authUser: { email: string; user_metadata: Record<string, unknown> } | null;
  events: Array<Record<string, unknown>>;
}

function baseState(overrides: Partial<MockState> = {}): MockState {
  return {
    profile: { auto_dispatch_enabled: true },
    profileError: null,
    members: [{ user_id: TECH_ID, role: "technician" }],
    appointment: {
      id: APPT_ID,
      workspace_id: WS_ID,
      customer_id: "cust-1",
      starts_at: "2026-11-12T13:00:00Z",
      ends_at: "2026-11-12T14:00:00Z",
      status: "confirmed",
      notes: null,
      metadata: { guest_email: "guest@example.com" },
      updated_at: "2026-11-11T00:00:00Z",
      assigned_user_id: null,
      customers: { id: "cust-1", first_name: "Jen", last_name: "Brennan", email: "jen@example.com" },
      vehicles: null,
    },
    workspace: { name: "MOMS Mobile Oil Change", timezone: "America/New_York" },
    technicianRow: null,
    authUser: { email: "tech@example.com", user_metadata: { full_name: "Sam Tech" } },
    events: [],
    ...overrides,
  };
}

function makeDb(state: MockState) {
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "update" | "insert" = "select";
    let patch: Record<string, unknown> | null = null;
    let insertedRow: Record<string, unknown> | null = null;

    function singleResult() {
      if (table === "business_profiles") {
        return state.profileError
          ? { data: null, error: state.profileError }
          : { data: state.profile, error: null };
      }
      if (table === "appointments") return { data: state.appointment, error: null };
      if (table === "workspaces") return { data: state.workspace, error: null };
      if (table === "technicians") return { data: state.technicianRow, error: null };
      return { data: null, error: null };
    }

    function listResult() {
      if (table === "workspace_members") return { data: state.members, error: null };
      if (table === "appointments" && mode === "update") {
        const appt = state.appointment;
        if (
          appt &&
          appt.assigned_user_id == null &&
          filters.workspace_id === appt.workspace_id &&
          filters.id === appt.id &&
          filters.assigned_user_id === null
        ) {
          appt.assigned_user_id = patch?.assigned_user_id;
          appt.metadata = patch?.metadata;
          return { data: [{ id: appt.id }], error: null };
        }
        return { data: [], error: null };
      }
      if (table === "dispatch_events" && mode === "insert") {
        if (insertedRow) state.events.push(insertedRow);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    const b: any = {
      select: () => b,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return b;
      },
      is: (column: string, value: unknown) => {
        filters[column] = value;
        return b;
      },
      in: (column: string, value: unknown) => {
        filters[column] = value;
        return b;
      },
      update: (value: Record<string, unknown>) => {
        mode = "update";
        patch = value;
        return b;
      },
      insert: (value: Record<string, unknown>) => {
        mode = "insert";
        insertedRow = value;
        return b;
      },
      maybeSingle: () => Promise.resolve(singleResult()),
      single: () => Promise.resolve(singleResult()),
      then: (resolve: (value: unknown) => void) => resolve(listResult()),
    };
    return b;
  }

  return {
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: state.authUser }, error: null })),
      },
    },
  };
}

const input = { workspaceId: WS_ID, appointmentId: APPT_ID, performedBy: PERFORMER_ID, requestUrl: REQUEST_URL };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("autoDispatchNewAppointment", () => {
  it("does nothing when the flag is off (no business_profiles row)", async () => {
    const state = baseState({ profile: null });
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome).toEqual({
      enabled: false,
      assigned: false,
      technicianId: null,
      technicianName: null,
      reason: "flag_off",
    });
    expect(state.appointment?.assigned_user_id).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(mockLifecycle).not.toHaveBeenCalled();
  });

  it("does nothing when the flag row exists but is false", async () => {
    const state = baseState({ profile: { auto_dispatch_enabled: false } });
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome.enabled).toBe(false);
    expect(outcome.assigned).toBe(false);
    expect(state.events).toHaveLength(0);
  });

  it("assigns the single eligible technician with the canonical write and sends only the technician notice", async () => {
    const state = baseState();
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);

    expect(outcome).toEqual({
      enabled: true,
      assigned: true,
      technicianId: TECH_ID,
      technicianName: "Sam Tech",
      reason: null,
    });

    // Canonical write: assigned_user_id + dispatch metadata, mirroring
    // assign_dispatch_job_v1's appointment branch.
    expect(state.appointment?.assigned_user_id).toBe(TECH_ID);
    expect(state.appointment?.metadata).toMatchObject({
      dispatch_status: "assigned",
      guest_email: "guest@example.com",
    });
    expect(typeof state.appointment?.metadata?.assigned_at).toBe("string");

    // One dispatch_events row; no work_order_assignments are written on
    // the appointment path (the mock has no such table at all).
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toEqual({
      workspace_id: WS_ID,
      appointment_id: APPT_ID,
      technician_id: TECH_ID,
      event_type: "assigned",
      previous_status: "confirmed",
      new_status: "confirmed",
      notes: null,
      performed_by: PERFORMER_ID,
    });

    // Rule v2: exactly one lifecycle call — the technician job-assigned
    // notice. The customer technician-assigned send is provably absent.
    expect(mockLifecycle).toHaveBeenCalledTimes(1);
    const call = mockLifecycle.mock.calls[0][0] as Record<string, unknown>;
    expect(call.eventKey).toBe("appointment_booking_sequence.new_job_assigned");
    expect(call.recipientRole).toBe("technician");
    expect(call.recipientEmail).toBe("tech@example.com");
    expect(call.technicianName).toBe("Sam Tech");
    expect(call.eventId).toBe(`${APPT_ID}:technician-assignment:${TECH_ID}`);
    expect(call.actionUrl).toBe(`https://www.servicewriter.xyz/tech-app/jobs/${APPT_ID}`);
    for (const [args] of mockLifecycle.mock.calls) {
      expect((args as Record<string, unknown>).eventKey).not.toBe(
        "appointment_booking_sequence.technician_assigned",
      );
    }
  });

  it("assigns the owner without sending any notice (solo owner-operator)", async () => {
    const state = baseState({
      members: [{ user_id: OWNER_ID, role: "owner" }],
      authUser: { email: "owner@example.com", user_metadata: { full_name: "Olivia Owner" } },
    });
    const outcome = await autoDispatchNewAppointment(makeDb(state), {
      ...input,
      performedBy: OWNER_ID,
    });
    expect(outcome.assigned).toBe(true);
    expect(outcome.technicianId).toBe(OWNER_ID);
    expect(outcome.technicianName).toBe("Olivia Owner");
    expect(state.appointment?.assigned_user_id).toBe(OWNER_ID);
    expect(state.events).toHaveLength(1);
    expect(mockLifecycle).not.toHaveBeenCalled();
  });

  it("assigns nobody when two technicians are eligible", async () => {
    const state = baseState({
      members: [
        { user_id: TECH_ID, role: "technician" },
        { user_id: MANAGER_ID, role: "manager" },
      ],
    });
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome).toMatchObject({ enabled: true, assigned: false, reason: "multiple_eligible_technicians" });
    expect(state.appointment?.assigned_user_id).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(mockLifecycle).not.toHaveBeenCalled();
  });

  it("assigns nobody when no technician is eligible", async () => {
    const state = baseState({ members: [] });
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome).toMatchObject({ enabled: true, assigned: false, reason: "no_eligible_technician" });
    expect(state.events).toHaveLength(0);
  });

  it("is a no-op for an already-assigned appointment (idempotent)", async () => {
    const state = baseState();
    state.appointment!.assigned_user_id = TECH_ID;
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome).toMatchObject({ enabled: true, assigned: false, reason: "already_assigned" });
    expect(state.events).toHaveLength(0);
    expect(mockLifecycle).not.toHaveBeenCalled();
  });

  it("a second run after a successful assignment writes no second event", async () => {
    const state = baseState();
    const db = makeDb(state);
    const first = await autoDispatchNewAppointment(db, input);
    const second = await autoDispatchNewAppointment(db, input);
    expect(first.assigned).toBe(true);
    expect(second).toMatchObject({ assigned: false, reason: "already_assigned" });
    expect(state.events).toHaveLength(1);
    expect(mockLifecycle).toHaveBeenCalledTimes(1);
  });

  it("keeps the assignment when the technician notice throws", async () => {
    const state = baseState();
    mockLifecycle.mockRejectedValueOnce(new Error("lifecycle down"));
    const outcome = await autoDispatchNewAppointment(makeDb(state), input);
    expect(outcome.assigned).toBe(true);
    expect(state.appointment?.assigned_user_id).toBe(TECH_ID);
    expect(state.events).toHaveLength(1);
    expect(mockCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ code: "auto_dispatch_notification_failed", workspaceId: WS_ID }),
    );
  });
});

describe("attemptAutoDispatchNewAppointment (fail-soft wrapper)", () => {
  it("converts a database failure into null and reports it — never throws", async () => {
    const state = baseState({ profileError: new Error("db down") });
    const outcome = await attemptAutoDispatchNewAppointment(input, makeDb(state));
    expect(outcome).toBeNull();
    expect(mockCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ code: "auto_dispatch_failed", workspaceId: WS_ID }),
    );
    expect(state.events).toHaveLength(0);
  });
});
