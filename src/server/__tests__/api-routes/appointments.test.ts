import "../../../test/api-routes/env";

// NOTE on the lifecycle-events mock: instead of jest.requireActual (which would
// pull the whole email-sender chain — resend/enginemailer adapters — into the
// test module graph), the keys below are copied verbatim from
// src/server/messaging/lifecycle-events.ts. Routes only read these constants.
jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/messaging/appointment-events", () => ({
  dispatchAppointmentLifecycle: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: jest.fn().mockResolvedValue(undefined),
  LIFECYCLE_EVENT_KEYS: {
    bookingCreated: "appointment_booking_sequence.booking_confirmation",
    newAppointmentBooked: "appointment_booking_sequence.new_appointment_booked",
    bookingPendingApproval: "appointment_booking_sequence.booking_received_pending_approval",
    appointmentApproved: "appointment_booking_sequence.appointment_approved",
    appointmentDeclined: "appointment_booking_sequence.appointment_declined",
    appointmentRescheduled: "appointment_booking_sequence.appointment_rescheduled",
    appointmentCancelled: "appointment_booking_sequence.appointment_cancelled",
    technicianAssigned: "appointment_booking_sequence.technician_assigned",
    jobAssigned: "appointment_booking_sequence.new_job_assigned",
    assignmentChanged: "appointment_booking_sequence.assignment_changed",
    bookingDetailsChanged: "appointment_booking_sequence.booking_details_changed",
    serviceAuthorizationRequested: "appointment_booking_sequence.add_service_authorization",
    serviceAuthorizationResponded: "appointment_booking_sequence.service_authorization_response",
    appointmentRestored: "appointment_booking_sequence.appointment_restored",
    reminder7Days: "appointment_reminders.7_days_before",
    reminder72Hours: "appointment_reminders.72_hours_before",
    reminder24Hours: "appointment_reminders.24_hours_before",
    reminder60Minutes: "appointment_reminders.60_minutes_before",
    technicianEnRoute: "technician_and_live_service_sequence.technician_en_route",
    technicianArrivingSoon: "technician_and_live_service_sequence.technician_arriving_soon",
    technicianArrived: "technician_and_live_service_sequence.technician_arrived",
    serviceStarted: "technician_and_live_service_sequence.service_started",
    inspectionCompleted: "technician_and_live_service_sequence.inspection_completed",
    additionalWorkRecommended: "technician_and_live_service_sequence.additional_work_recommended",
    authorizationReceived: "technician_and_live_service_sequence.authorization_received",
    jobDelayed: "technician_and_live_service_sequence.job_delayed",
    jobPaused: "technician_and_live_service_sequence.job_paused",
    serviceCompleted: "technician_and_live_service_sequence.service_completed",
    quoteReady: "quotes_and_service_authorization.your_quote_is_ready",
    quoteApproved: "quotes_and_service_authorization.quote_approved",
    quoteDeclined: "quotes_and_service_authorization.quote_declined",
    quoteApprovedStaff: "quotes_and_service_authorization.quote_approved_staff",
    quoteDeclinedStaff: "quotes_and_service_authorization.quote_declined_staff",
    estimateConverted: "quotes_and_service_authorization.estimate_converted_to_appointment",
    invoiceCreated: "invoice_and_payment_sequence.invoice_created",
    paymentRequested: "invoice_and_payment_sequence.payment_requested",
    paymentReceipt: "invoice_and_payment_sequence.payment_receipt",
    paymentReceived: "invoice_and_payment_sequence.payment_received",
    paymentFailed: "invoice_and_payment_sequence.payment_failed",
    refundIssued: "invoice_and_payment_sequence.refund_issued",
    disputeOpened: "invoice_and_payment_sequence.dispute_opened",
    payoutSent: "invoice_and_payment_sequence.payout_sent",
    serviceCompletionSummary: "service_completion_and_follow_up.service_completion_summary",
    reviewRequest: "service_completion_and_follow_up.review_and_satisfaction_request",
    supportFollowUp: "service_completion_and_follow_up.report_a_problem_or_request_support",
    staffInvited: "staff_onboarding_and_account_management.you_ve_been_invited",
    roleChanged: "staff_onboarding_and_account_management.role_changed",
    accessSuspended: "staff_onboarding_and_account_management.access_suspended",
    newAdminAdded: "staff_onboarding_and_account_management.new_admin_added",
    newSubscriber: "platform_owner_and_support_notifications.new_subscriber_registered",
    providerOnboardingCompleted: "platform_owner_and_support_notifications.provider_completed_onboarding",
    subscriptionStarted: "platform_owner_and_support_notifications.subscription_started",
    subscriptionChanged: "platform_owner_and_support_notifications.subscription_upgraded_downgraded",
    subscriptionCancelled: "platform_owner_and_support_notifications.subscription_cancelled",
    emailDeliveryFailure: "platform_owner_and_support_notifications.email_delivery_failure",
    smsDeliveryFailure: "platform_owner_and_support_notifications.sms_delivery_failure",
  },
}));
jest.mock("@/server/payments/stripe-invoice-sync", () => ({
  syncCanonicalInvoiceToStripe: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import * as api from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { GET as appointmentsGet, POST as appointmentsPost } from "../../../../app/api/v1/appointments/route";
import {
  GET as appointmentGet,
  PATCH as appointmentPatch,
  DELETE as appointmentDelete,
} from "../../../../app/api/v1/appointments/[id]/route";
import { POST as appointmentComplete } from "../../../../app/api/v1/appointments/[id]/complete/route";
import { POST as appointmentConfirmation } from "../../../../app/api/v1/appointments/[id]/confirmation/route";
import { POST as appointmentStart } from "../../../../app/api/v1/appointments/[id]/start/route";
import { POST as technicianStatusPost } from "../../../../app/api/v1/appointments/[id]/technician-status/route";
import { GET as itemsGet, PUT as itemsPut } from "../../../../app/api/v1/appointment-items/route";
import {
  makeRequest,
  readJson,
  contextWithParams,
  makeQueryBuilder,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  WS_ID,
  USER_ID,
  APPOINTMENT_ID,
  TEST_USER,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";

// The shared builder stub does not implement .not()/.or(); add them so routes
// that use them (conflict checks, customer search) keep chaining.
function withExtraChains(client: MockSupabaseClient): MockSupabaseClient {
  const origFrom = client.from;
  client.from = jest.fn((table: string) => {
    const builder = origFrom(table) as unknown as Record<string, unknown>;
    if (typeof builder.not !== "function") builder.not = jest.fn(() => builder);
    if (typeof builder.or !== "function") builder.or = jest.fn(() => builder);
    return builder;
  }) as unknown as MockSupabaseClient["from"];
  return client;
}

// Several routes destructure `membership` from requireWorkspaceMember; the
// shared stub only returns { supabase, user }.
function stubMember(supabase: MockSupabaseClient, role = "owner") {
  (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
    supabase,
    user: TEST_USER,
    membership: { role },
  });
}

const validAppointmentBody = () => ({
  workspace_id: WS_ID,
  customer_id: CUSTOMER_ID,
  starts_at: "2026-10-05T14:00:00.000Z",
  ends_at: "2026-10-05T15:00:00.000Z",
  override_availability: true,
});

describe("appointments/route (collection)", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status, body } = await readJson(
        await appointmentsGet(makeRequest(`/api/v1/appointments?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(401);
      expect(body.error.code).toBe("unauthenticated");
    });

    it("returns 500 when workspace_id is missing (route throws before auth)", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status, body } = await readJson(await appointmentsGet(makeRequest("/api/v1/appointments")));
      expect(status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });

    it("returns 200 with paginated appointments", async () => {
      const supabase = makeSupabaseClient({ appointments: { data: [{ id: APPOINTMENT_ID }], error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentsGet(makeRequest(`/api/v1/appointments?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(APPOINTMENT_ID);
      expect(body.pagination).toEqual({ limit: 25, offset: 0 });
    });
  });

  describe("POST", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await appointmentsPost(makeRequest("/api/v1/appointments", { method: "POST", body: validAppointmentBody() })),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      // errorResponse maps ZodError to 500 internal_error (no zod-specific branch).
      const supabase = makeSupabaseClient();
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentsPost(makeRequest("/api/v1/appointments", { method: "POST", body: {} })),
      );
      expect(status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });

    it("returns 500 when ends_at is not after starts_at", async () => {
      const supabase = makeSupabaseClient();
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await appointmentsPost(
          makeRequest("/api/v1/appointments", {
            method: "POST",
            body: { ...validAppointmentBody(), ends_at: "2026-10-05T13:00:00.000Z" },
          }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 400 invalid_customer when the customer is not in the workspace", async () => {
      const supabase = makeSupabaseClient({ customers: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentsPost(makeRequest("/api/v1/appointments", { method: "POST", body: validAppointmentBody() })),
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe("invalid_customer");
    });

    it("returns 409 outside_business_hours when the slot is outside configured hours", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
        workspaces: { data: { timezone: "UTC" }, error: null },
        workspace_settings: { data: { working_days: [] }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentsPost(
          makeRequest("/api/v1/appointments", {
            method: "POST",
            body: { ...validAppointmentBody(), override_availability: false },
          }),
        ),
      );
      expect(status).toBe(409);
      expect(body.error.code).toBe("outside_business_hours");
    });

    it("returns 201 with the created appointment", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
        workspaces: { data: { timezone: "UTC" }, error: null },
        workspace_settings: { data: { working_days: ["monday"] }, error: null },
        appointments: { data: { id: APPOINTMENT_ID, workspace_id: WS_ID, status: "confirmed" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentsPost(makeRequest("/api/v1/appointments", { method: "POST", body: validAppointmentBody() })),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(APPOINTMENT_ID);
    });
  });
});

describe("appointments/[id]/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await appointmentGet(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status, body } = await readJson(
        await appointmentGet(
          makeRequest(`/api/v1/appointments/not-a-uuid?workspace_id=${WS_ID}`),
          contextWithParams({ id: "not-a-uuid" }),
        ),
      );
      expect(status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });

    it("returns 200 with the appointment", async () => {
      const supabase = makeSupabaseClient({ appointments: { data: { id: APPOINTMENT_ID }, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentGet(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(APPOINTMENT_ID);
    });
  });

  describe("PATCH", () => {
    const currentRow = () => ({
      id: APPOINTMENT_ID,
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      vehicle_id: null,
      location_id: null,
      starts_at: "2026-10-05T14:00:00.000Z",
      ends_at: "2026-10-05T15:00:00.000Z",
      status: "confirmed",
      assigned_user_id: null,
      metadata: {},
      updated_at: "2026-09-22T12:00:00.000Z",
    });

    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await appointmentPatch(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, notes: "x" },
          }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body has no updatable fields", async () => {
      const supabase = makeSupabaseClient();
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await appointmentPatch(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID },
          }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 and dispatches bookingDetailsChanged for a notes update", async () => {
      const supabase = withExtraChains(
        makeSupabaseClient({
          appointments: { data: currentRow(), error: null },
          workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
          customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
        }),
      );
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentPatch(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, notes: "Bring the keys" },
          }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(APPOINTMENT_ID);
      expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: LIFECYCLE_EVENT_KEYS.bookingDetailsChanged }),
      );
    });

    it("returns 200 and dispatches appointmentRescheduled when moved via scheduled_date/time", async () => {
      // The route reads the appointment, checks conflicts, then returns the
      // UPDATED row — stub each appointments query in order so the rescheduled
      // times show up in the update result.
      const current = currentRow();
      const reads = [
        { data: current, error: null },
        { data: [], error: null }, // conflict check: no overlapping appointments
        {
          data: { ...current, starts_at: "2026-10-06T09:30:00.000Z", ends_at: "2026-10-06T10:30:00.000Z" },
          error: null,
        },
      ];
      let readIndex = 0;
      const supabase = withExtraChains(
        makeSupabaseClient({
          workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
          customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
        }),
      );
      const origFrom = supabase.from;
      const baseImpl = (origFrom as jest.Mock).getMockImplementation() as (table: string) => unknown;
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "appointments") {
          const builder = makeQueryBuilder(reads[Math.min(readIndex++, reads.length - 1)]);
          (builder as unknown as Record<string, unknown>).not = jest.fn(() => builder);
          return builder;
        }
        return baseImpl(table);
      });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await appointmentPatch(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, {
            method: "PATCH",
            body: {
              workspace_id: WS_ID,
              scheduled_date: "2026-10-06",
              scheduled_time: "09:30",
              duration_minutes: 60,
            },
          }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: LIFECYCLE_EVENT_KEYS.appointmentRescheduled }),
      );
    });
  });

  describe("DELETE", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await appointmentDelete(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await appointmentDelete(
          makeRequest(`/api/v1/appointments/not-a-uuid?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: "not-a-uuid" }),
        ),
      );
      expect(status).toBe(500);
    });

    it("soft-cancels the appointment and dispatches appointmentCancelled", async () => {
      const supabase = makeSupabaseClient({
        appointments: {
          data: {
            id: APPOINTMENT_ID,
            workspace_id: WS_ID,
            customer_id: CUSTOMER_ID,
            starts_at: "2026-10-05T14:00:00.000Z",
            ends_at: "2026-10-05T15:00:00.000Z",
            status: "cancelled",
            notes: null,
            metadata: {},
            updated_at: "2026-09-22T12:00:00.000Z",
          },
          error: null,
        },
        workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await appointmentDelete(
          makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: APPOINTMENT_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.status).toBe("cancelled");
      expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: LIFECYCLE_EVENT_KEYS.appointmentCancelled }),
      );
    });
  });
});

describe("appointments/[id]/complete/route", () => {
  const fullAppointment = () => ({
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    starts_at: "2026-10-05T14:00:00.000Z",
    ends_at: "2026-10-05T15:00:00.000Z",
    status: "completed",
    notes: null,
    metadata: {},
    updated_at: "2026-09-22T12:00:00.000Z",
    customers: [{ id: CUSTOMER_ID, first_name: "Ava", last_name: "Roe", email: "ava@example.com" }],
    vehicles: [{ id: VEHICLE_ID, year: 2020, make: "Honda", model: "Civic" }],
  });

  it("returns 401 when workspace membership check fails", async () => {
    stubWorkspaceMemberReject(api);
    const { status } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(401);
  });

  it("returns 500 when the body fails zod validation", async () => {
    stubMember(makeSupabaseClient());
    const { status } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, { method: "POST", body: {} }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(500);
  });

  it("returns 403 when a technician completes someone else's appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { assigned_user_id: OTHER_USER_ID, status: "in_progress" }, error: null },
    });
    stubMember(supabase, "technician");
    const { status, body } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 when a technician completes a missing appointment", async () => {
    const supabase = makeSupabaseClient({ appointments: { data: null, error: null } });
    stubMember(supabase, "technician");
    const { status, body } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 200 with skipped stripe sync when the payments add-on is inactive", async () => {
    (dispatchLifecycleEvent as jest.Mock).mockResolvedValue({ status: "queued" });
    const supabase = makeSupabaseClient({
      appointments: { data: fullAppointment(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
    });
    stubMember(supabase, "owner");
    const { status, body } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.stripe_sync.status).toBe("skipped");
    expect(syncCanonicalInvoiceToStripe).not.toHaveBeenCalled();
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: LIFECYCLE_EVENT_KEYS.serviceCompleted }),
    );
    expect(dispatchLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: LIFECYCLE_EVENT_KEYS.serviceCompletionSummary }),
    );
  });

  it("syncs to Stripe when invoice/payment ids exist and the payments add-on is active", async () => {
    (dispatchLifecycleEvent as jest.Mock).mockResolvedValue({ status: "queued" });
    (syncCanonicalInvoiceToStripe as jest.Mock).mockResolvedValue({
      status: "synced",
      hostedInvoiceUrl: "https://pay.example/i/inv",
    });
    const supabase = makeSupabaseClient({
      appointments: { data: fullAppointment(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
      workspace_billing: {
        data: { payments_addon_active: true, subscription_status: "active" },
        error: null,
      },
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { service_record_id: "sr-1", invoice_id: "inv-1", payment_id: "pay-1" },
      error: null,
    });
    stubMember(supabase, "owner");
    const { status, body } = await readJson(
      await appointmentComplete(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/complete`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(syncCanonicalInvoiceToStripe).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_ID, appointmentId: APPOINTMENT_ID, invoiceId: "inv-1", paymentId: "pay-1" }),
    );
    expect(body.data.stripe_sync.status).toBe("synced");
  });
});

describe("appointments/[id]/confirmation/route", () => {
  const fullAppointment = () => ({
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    starts_at: "2026-10-05T14:00:00.000Z",
    ends_at: "2026-10-05T15:00:00.000Z",
    status: "confirmed",
    notes: null,
    metadata: {},
    updated_at: "2026-09-22T12:00:00.000Z",
  });

  it("returns 401 when workspace membership check fails", async () => {
    stubWorkspaceMemberReject(api);
    const { status } = await readJson(
      await appointmentConfirmation(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/confirmation`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(401);
  });

  it("returns 500 when the body fails zod validation", async () => {
    stubWorkspaceMember(api, makeSupabaseClient());
    const { status } = await readJson(
      await appointmentConfirmation(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/confirmation`, { method: "POST", body: {} }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(500);
  });

  it("returns 422 missing_recipient when no customer email resolves", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: fullAppointment(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await appointmentConfirmation(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/confirmation`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(422);
    expect(body.error.code).toBe("missing_recipient");
  });

  it("returns 200 and enriches metadata from items and invoices", async () => {
    (dispatchAppointmentLifecycle as jest.Mock).mockResolvedValue({ status: "queued" });
    const supabase = makeSupabaseClient({
      appointments: { data: fullAppointment(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
      appointment_items: {
        data: [{ description: "Oil change", quantity: 1, unit_price: 49.99, sort_order: 0, created_at: "2026-09-22T12:00:00.000Z" }],
        error: null,
      },
      invoices: {
        data: [{ id: "inv-1", invoice_number: "INV-1", total: 120, status: "paid", amount_paid: 120 }],
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await appointmentConfirmation(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/confirmation`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.status).toBe("queued");
    expect(body.data.invoice_id).toBe("inv-1");
    expect(body.data.invoice_number).toBe("INV-1");
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: LIFECYCLE_EVENT_KEYS.bookingCreated }),
    );
  });
});

describe("appointments/[id]/start/route", () => {
  const startable = () => ({
    id: APPOINTMENT_ID,
    status: "confirmed",
    assigned_user_id: USER_ID,
    metadata: {},
    customer_id: CUSTOMER_ID,
    vehicle_id: VEHICLE_ID,
  });

  it("returns 401 when workspace membership check fails", async () => {
    stubWorkspaceMemberReject(api);
    const { status } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(401);
  });

  it("returns 500 when the body fails zod validation", async () => {
    stubMember(makeSupabaseClient());
    const { status } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, { method: "POST", body: {} }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(500);
  });

  it("returns 404 when the appointment is not in the workspace", async () => {
    const supabase = makeSupabaseClient({ appointments: { data: null, error: null } });
    stubMember(supabase);
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 409 invalid_status for a completed appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...startable(), status: "completed" }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invalid_status");
  });

  it("returns 409 missing_job_context when customer/vehicle are absent", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...startable(), customer_id: null, vehicle_id: null }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("missing_job_context");
  });

  it("returns 403 when a technician starts someone else's appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...startable(), assigned_user_id: OTHER_USER_ID }, error: null },
    });
    stubMember(supabase, "technician");
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns already_started for an in_progress appointment without updating", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...startable(), status: "in_progress" }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.already_started).toBe(true);
    expect(body.data.status).toBe("in_progress");
  });

  it("starts the job and returns already_started=false", async () => {
    const supabase = makeSupabaseClient({ appointments: { data: startable(), error: null } });
    stubMember(supabase);
    const { status, body } = await readJson(
      await appointmentStart(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/start`, {
          method: "POST",
          body: { workspace_id: WS_ID },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.already_started).toBe(false);
    expect(body.data.id).toBe(APPOINTMENT_ID);
  });
});

describe("appointments/[id]/technician-status/route", () => {
  const currentRow = () => ({
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    starts_at: "2026-10-05T14:00:00.000Z",
    ends_at: "2026-10-05T15:00:00.000Z",
    status: "confirmed",
    assigned_user_id: null,
    notes: null,
    metadata: {},
    updated_at: "2026-09-22T12:00:00.000Z",
    customers: [{ id: CUSTOMER_ID, first_name: "Ava", last_name: "Roe", email: "ava@example.com" }],
    vehicles: [{ id: VEHICLE_ID, year: 2020, make: "Honda", model: "Civic" }],
  });

  it("returns 401 when workspace membership check fails", async () => {
    stubWorkspaceMemberReject(api);
    const { status } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "en_route" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(401);
  });

  it("returns 500 when the status enum fails validation", async () => {
    stubMember(makeSupabaseClient());
    const { status } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "flying" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(500);
  });

  it("returns 409 invalid_status for a completed appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...currentRow(), status: "completed" }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "en_route" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invalid_status");
  });

  it("returns 403 when a technician updates someone else's appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { ...currentRow(), assigned_user_id: OTHER_USER_ID }, error: null },
    });
    stubMember(supabase, "technician");
    const { status, body } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "en_route" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("updates dispatch metadata and dispatches technicianEnRoute", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: currentRow(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "en_route" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(APPOINTMENT_ID);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: LIFECYCLE_EVENT_KEYS.technicianEnRoute,
        technicianName: "Your technician",
      }),
    );
  });

  it("resolves the technician name via the admin client when assigned", async () => {
    const getUserById = jest.fn().mockResolvedValue({
      data: { user: { user_metadata: { full_name: "Sam Tech" }, email: "sam@example.com" } },
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue({ auth: { admin: { getUserById } } });
    const supabase = makeSupabaseClient({
      appointments: { data: { ...currentRow(), assigned_user_id: USER_ID }, error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
    });
    stubMember(supabase, "dispatcher");
    const { status } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "arrived" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(USER_ID);
    expect(dispatchAppointmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: LIFECYCLE_EVENT_KEYS.technicianArrived,
        technicianName: "Sam Tech",
      }),
    );
  });

  it("acknowledged updates metadata without dispatching", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: currentRow(), error: null },
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
    });
    stubMember(supabase);
    const { status, body } = await readJson(
      await technicianStatusPost(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}/technician-status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "acknowledged" },
        }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(APPOINTMENT_ID);
    expect(dispatchAppointmentLifecycle).not.toHaveBeenCalled();
  });
});

describe("appointment-items/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(await itemsGet(makeRequest(`/api/v1/appointment-items?workspace_id=${WS_ID}`)));
      expect(status).toBe(401);
    });

    it("returns 500 when workspace_id is missing", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(await itemsGet(makeRequest("/api/v1/appointment-items")));
      expect(status).toBe(500);
    });

    it("returns 500 when appointment_id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await itemsGet(makeRequest(`/api/v1/appointment-items?workspace_id=${WS_ID}&appointment_id=nope`)),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the item list", async () => {
      const supabase = makeSupabaseClient({
        appointment_items: { data: [{ id: "item-1", description: "Oil change" }], error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await itemsGet(makeRequest(`/api/v1/appointment-items?workspace_id=${WS_ID}&appointment_id=${APPOINTMENT_ID}`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].description).toBe("Oil change");
    });
  });

  describe("PUT", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await itemsPut(
          makeRequest("/api/v1/appointment-items", {
            method: "PUT",
            body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, service_catalog_id: null },
          }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await itemsPut(makeRequest("/api/v1/appointment-items", { method: "PUT", body: {} })),
      );
      expect(status).toBe(500);
    });

    it("clears form-sourced items and returns null when no service is selected", async () => {
      const supabase = makeSupabaseClient({
        appointments: { data: { id: APPOINTMENT_ID }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await itemsPut(
          makeRequest("/api/v1/appointment-items", {
            method: "PUT",
            body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, service_catalog_id: null },
          }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data).toBeNull();
    });

    it("inserts the primary service row when a catalog service is selected", async () => {
      const supabase = makeSupabaseClient({
        appointments: { data: { id: APPOINTMENT_ID }, error: null },
        service_catalog: { data: { id: "svc-1", name: "Oil Change", labor_price: 49.99 }, error: null },
        appointment_items: { data: { id: "item-1", description: "Oil Change" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await itemsPut(
          makeRequest("/api/v1/appointment-items", {
            method: "PUT",
            body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, service_catalog_id: "11111111-1111-4111-8111-111111111112" },
          }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.description).toBe("Oil Change");
    });
  });
});
