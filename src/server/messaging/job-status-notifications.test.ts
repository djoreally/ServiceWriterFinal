/**
 * Job-step notifications (2026-11-13): the fan-out behind the tech
 * app's stepper buttons. These tests pin the notification matrix
 * (step × recipient × channel), the deterministic event ids that
 * make a double-tap — or the door racing the sync push — enqueue
 * exactly one email per (job, step, recipient), the honest skips
 * (no customer email on file never blocks the office), and the
 * 10DLC-dark SMS seam (gate closed ⇒ the provider is never
 * touched).
 */
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("@/server/messaging/appointment-events", () => ({
  dispatchAppointmentLifecycle: jest.fn(),
  appointmentCustomerEmail: (appointment: {
    customers?: { email?: string | null } | Array<{ email?: string | null }> | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const customer = Array.isArray(appointment.customers)
      ? appointment.customers[0]
      : appointment.customers;
    const guestEmail = appointment.metadata?.guest_email;
    return customer?.email || (typeof guestEmail === "string" ? guestEmail : null);
  },
}));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  // Copied verbatim from lifecycle-events.ts (the routes/tests
  // convention) so the sender chain stays out of this graph.
  LIFECYCLE_EVENT_KEYS: {
    technicianEnRoute: "technician_and_live_service_sequence.technician_en_route",
    technicianArrived: "technician_and_live_service_sequence.technician_arrived",
    serviceStarted: "technician_and_live_service_sequence.service_started",
    serviceCompleted: "technician_and_live_service_sequence.service_completed",
  },
}));
jest.mock("@/server/audit", () => ({
  logMutation: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { logMutation } from "@/server/audit";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";
import {
  jobStatusSmsGate,
  notifyJobStepAdvanced,
  type JobStep,
} from "@/server/messaging/job-status-notifications";

const WS_ID = "11111111-1111-4111-8111-111111111111";
const APPT_ID = "33333333-3333-4333-8333-333333333333";
const TECH_ID = "44444444-4444-4444-8444-444444444444";
const OWNER_ID = "55555555-5555-4555-8555-555555555555";
const ORIGIN = "https://www.servicewriter.xyz";

const dispatchMock = dispatchAppointmentLifecycle as jest.Mock;
const logMutationMock = logMutation as jest.Mock;

type Fixture = {
  customerEmail: string | null;
  officeEmails: string[];
  ownerEmail: string | null;
};

function installAdmin(fixture: Fixture) {
  const appointment = {
    id: APPT_ID,
    workspace_id: WS_ID,
    customer_id: "66666666-6666-4666-8666-666666666666",
    starts_at: "2026-11-13T14:00:00.000Z",
    ends_at: "2026-11-13T14:45:00.000Z",
    status: "scheduled",
    notes: null,
    metadata: {},
    assigned_user_id: TECH_ID,
    customers: {
      id: "66666666-6666-4666-8666-666666666666",
      first_name: "Casey",
      last_name: "Customer",
      email: fixture.customerEmail,
      phone: "215-555-0142",
    },
    vehicles: { id: "77777777-7777-4777-8777-777777777777", year: 2023, make: "Ford", model: "Transit-250" },
  };
  const builderFor = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.single = jest.fn(async () => {
      if (table === "workspaces") return { data: { created_by: OWNER_ID }, error: null };
      return { data: null, error: null };
    });
    builder.maybeSingle = jest.fn(async () => {
      if (table === "appointments") return { data: appointment, error: null };
      if (table === "workspaces") return { data: { name: "MOMS Mobile Oil Change", timezone: "America/New_York" }, error: null };
      if (table === "workspace_settings") {
        return {
          data: {
            operational_settings: {
              booking_notification_emails: fixture.officeEmails,
            },
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    return builder;
  };
  const admin = {
    from: jest.fn((table: string) => builderFor(table)),
    auth: {
      admin: {
        getUserById: jest.fn(async (id: string) => {
          if (id === OWNER_ID) {
            return { data: { user: { id: OWNER_ID, email: fixture.ownerEmail, user_metadata: {} } }, error: null };
          }
          if (id === TECH_ID) {
            return {
              data: {
                user: { id: TECH_ID, email: "marcus@momsoilchange.com", user_metadata: { full_name: "Marcus Tech" } },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: null };
        }),
      },
    },
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
  return admin;
}

function dispatchCall(role: "customer" | "shop_owner", index = 0) {
  const matches = dispatchMock.mock.calls
    .map((call) => call[0])
    .filter((input) => (input.recipientRole ?? "customer") === role);
  return matches[index];
}

function notify(step: JobStep) {
  return notifyJobStepAdvanced({
    workspaceId: WS_ID,
    appointmentId: APPT_ID,
    step,
    actorUserId: TECH_ID,
    origin: ORIGIN,
  });
}

const DEFAULT_FIXTURE: Fixture = {
  customerEmail: "casey@example.com",
  officeEmails: ["office@momsoilchange.com"],
  ownerEmail: "owner@momsoilchange.com",
};

describe("notifyJobStepAdvanced — the matrix", () => {
  beforeEach(() => {
    installAdmin(DEFAULT_FIXTURE);
    dispatchMock.mockImplementation(async (input: Record<string, unknown>) => ({
      templateKey: input.eventKey,
      eventId: input.eventId,
      recipientRole: input.recipientRole ?? "customer",
      status: "queued",
    }));
  });

  it("en_route emails the customer (technician on the way) and every office inbox", async () => {
    const report = await notify("en_route");

    const customer = dispatchCall("customer");
    expect(customer.eventKey).toBe("technician_and_live_service_sequence.technician_en_route");
    // Shared with the office dispatch routes: a step advanced from
    // either surface enqueues one customer email, never two.
    expect(customer.eventId).toBe(`${APPT_ID}:technician-status:en_route`);
    expect(customer.technicianName).toBe("Marcus Tech");

    const office = [dispatchCall("shop_owner", 0), dispatchCall("shop_owner", 1)];
    expect(office.map((call) => call.recipientEmail).sort()).toEqual([
      "office@momsoilchange.com",
      "owner@momsoilchange.com",
    ]);
    for (const call of office) {
      expect(call.eventKey).toBe("technician_and_live_service_sequence.technician_en_route");
      expect(call.eventId).toBe(`${APPT_ID}:job-step:en_route`);
      expect(call.actionUrl).toBe(`${ORIGIN}/appointments/${APPT_ID}`);
    }

    expect(report.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", role: "customer", recipient: "casey@example.com", status: "queued" }),
        expect.objectContaining({ channel: "email", role: "shop_owner", recipient: "office@momsoilchange.com", status: "queued" }),
        expect.objectContaining({ channel: "email", role: "shop_owner", recipient: "owner@momsoilchange.com", status: "queued" }),
        // Text stays dark until 10DLC — recorded, never sent.
        expect.objectContaining({ channel: "sms", role: "customer", status: "disabled" }),
      ]),
    );
  });

  it("arrived emails the customer (technician arrived) and the office", async () => {
    await notify("arrived");
    expect(dispatchCall("customer").eventKey).toBe(
      "technician_and_live_service_sequence.technician_arrived",
    );
    expect(dispatchCall("customer").eventId).toBe(`${APPT_ID}:technician-status:arrived`);
    expect(dispatchCall("shop_owner").eventKey).toBe(
      "technician_and_live_service_sequence.technician_arrived",
    );
  });

  it("started notifies the office only — no customer email, no text entry", async () => {
    const report = await notify("started");
    expect(dispatchMock.mock.calls.map((call) => call[0].recipientRole ?? "customer")).toEqual([
      "shop_owner",
      "shop_owner",
    ]);
    expect(dispatchCall("shop_owner").eventKey).toBe(
      "technician_and_live_service_sequence.service_started",
    );
    expect(report.notifications.some((entry) => entry.role === "customer")).toBe(false);
  });

  it("completed emails the customer (service complete) and the office", async () => {
    await notify("completed");
    expect(dispatchCall("customer").eventKey).toBe(
      "technician_and_live_service_sequence.service_completed",
    );
    expect(dispatchCall("customer").eventId).toBe(`${APPT_ID}:job-step:completed`);
    expect(dispatchCall("shop_owner").eventKey).toBe(
      "technician_and_live_service_sequence.service_completed",
    );
  });

  it("is idempotent per (job, step): a repeat advance produces the identical event ids", async () => {
    await notify("en_route");
    const firstIds = dispatchMock.mock.calls.map((call) => call[0].eventId).sort();
    dispatchMock.mockClear();
    await notify("en_route");
    const secondIds = dispatchMock.mock.calls.map((call) => call[0].eventId).sort();
    // The lifecycle outbox + message log dedupe on the idempotency
    // key built from these ids — identical ids are what make a
    // double-tap (or the door racing the sync push) send once.
    expect(secondIds).toEqual(firstIds);
  });

  it("records every send on the job's audit trail", async () => {
    await notify("arrived");
    expect(logMutationMock).toHaveBeenCalledTimes(1);
    const entry = logMutationMock.mock.calls[0][0];
    expect(entry.action).toBe("appointment.job_step_notified");
    expect(entry.entityType).toBe("appointment");
    expect(entry.entityId).toBe(APPT_ID);
    expect(entry.after.step).toBe("arrived");
    for (const send of entry.after.notifications) {
      expect(send).toEqual(
        expect.objectContaining({
          channel: expect.any(String),
          role: expect.any(String),
          status: expect.any(String),
          at: expect.any(String),
        }),
      );
    }
  });
});

describe("notifyJobStepAdvanced — honest gaps", () => {
  beforeEach(() => {
    dispatchMock.mockImplementation(async (input: Record<string, unknown>) => {
      // Mirror dispatchAppointmentLifecycle: no recipient resolved
      // for the customer ⇒ null; office calls carry one explicitly.
      if (!input.recipientEmail) return null;
      return { templateKey: input.eventKey, eventId: input.eventId, recipientRole: input.recipientRole, status: "queued" };
    });
  });

  it("customer email absent: office still notified, customer marked skipped, nothing throws", async () => {
    installAdmin({ ...DEFAULT_FIXTURE, customerEmail: null });
    const report = await notify("en_route");
    expect(report.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", role: "customer", recipient: null, status: "skipped_no_customer_email" }),
        expect.objectContaining({ channel: "email", role: "shop_owner", recipient: "office@momsoilchange.com", status: "queued" }),
      ]),
    );
  });

  it("no office recipient configured: the gap is recorded, the customer still hears", async () => {
    installAdmin({ customerEmail: "casey@example.com", officeEmails: [], ownerEmail: null });
    dispatchMock.mockImplementation(async (input: Record<string, unknown>) => ({
      templateKey: input.eventKey,
      eventId: input.eventId,
      recipientRole: input.recipientRole ?? "customer",
      status: "queued",
    }));
    const report = await notify("completed");
    expect(report.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", role: "customer", status: "queued" }),
        expect.objectContaining({ channel: "email", role: "shop_owner", recipient: null, status: "skipped_no_office_recipient" }),
      ]),
    );
  });
});

describe("the 10DLC SMS seam", () => {
  const SMS_ENV_KEYS = [
    "SMS_10DLC_ENABLED",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_MESSAGING_SERVICE_SID",
    "TWILIO_FROM_NUMBER",
  ];
  let savedEnv: Record<string, string | undefined>;
  beforeEach(() => {
    savedEnv = Object.fromEntries(SMS_ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of SMS_ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of SMS_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("gate is closed by default and names why", () => {
    const gate = jobStatusSmsGate({});
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/10DLC/);
  });

  it("gate stays closed on the switch alone — provider pieces are required too", () => {
    expect(jobStatusSmsGate({ SMS_10DLC_ENABLED: "true" }).enabled).toBe(false);
    expect(
      jobStatusSmsGate({ SMS_10DLC_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "tok" }).enabled,
    ).toBe(false);
  });

  it("gate opens on configuration only: switch + credentials + a registered sender", () => {
    expect(
      jobStatusSmsGate({
        SMS_10DLC_ENABLED: "true",
        TWILIO_ACCOUNT_SID: "AC",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_MESSAGING_SERVICE_SID: "MG",
      }).enabled,
    ).toBe(true);
  });

  it("with the gate closed the provider is never touched", async () => {
    const send = jest.spyOn(TwilioSmsAdapter.prototype, "send");
    installAdmin(DEFAULT_FIXTURE);
    dispatchMock.mockResolvedValue({ status: "queued" });
    const report = await notify("en_route");
    expect(send).not.toHaveBeenCalled();
    expect(report.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "sms", status: "disabled" }),
      ]),
    );
    send.mockRestore();
  });
});
