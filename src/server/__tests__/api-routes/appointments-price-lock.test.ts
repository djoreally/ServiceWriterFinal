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
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  // Route handlers schedule post-response work with after(); outside a real
  // request scope it throws, which is a harness limit of the framework, not
  // route behavior. Swallow it so the handler's response is what is asserted.
  // (The pre-existing appointments suite's PATCH success tests fail on this
  // exact point at baseline; this file does not inherit that failure.)
  after: () => undefined,
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
import * as api from "@/server/api";
import { PATCH as appointmentPatch } from "../../../../app/api/v1/appointments/[id]/route";
import { PUT as itemsPut } from "../../../../app/api/v1/appointment-items/route";
import { appointmentsRouter } from "@/server/hono/routes/appointments";
import { testRouter } from "../../hono/test-support/routerTest";
import {
  makeRequest,
  readJson,
  contextWithParams,
  makeQueryBuilder,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubRequireUser,
  WS_ID,
  APPOINTMENT_ID,
  TEST_USER,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const app = testRouter(appointmentsRouter);

const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const SERVICE_ID = "66666666-6666-4666-8666-666666666666";
const CATALOG_A = "77777777-7777-4777-8777-777777777777";
const CATALOG_B = "88888888-8888-4888-8888-888888888888";

const LOCKED_METADATA = {
  pricing_state: "website_quote_locked",
  estimated_cost: 122.57,
  client_estimated_cost: 122.57,
  tax_amount: 0,
  service_catalog_id: CATALOG_A,
  website_booking_id: "e38138f6-de07-4d75-8942-f4ce3d891fc7",
  source_channel: "website /lp/mobile-oil-change-philly",
};

function stubMember(supabase: MockSupabaseClient, role = "owner") {
  (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
    supabase,
    user: TEST_USER,
    membership: { role },
  });
}

// The shared builder stub does not implement .not()/.or(); add them so routes
// that use them keep chaining (same pattern as appointments.test.ts).
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

type Builder = ReturnType<typeof makeQueryBuilder>;

describe("PATCH /v1/appointments/:id — website quote lock", () => {
  const currentRow = (overrides: Record<string, unknown> = {}) => ({
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    vehicle_id: null,
    location_id: null,
    starts_at: "2026-10-05T14:00:00.000Z",
    ends_at: "2026-10-05T15:00:00.000Z",
    status: "confirmed",
    source: "moms_website",
    assigned_user_id: null,
    metadata: { ...LOCKED_METADATA },
    updated_at: "2026-09-22T12:00:00.000Z",
    ...overrides,
  });

  // Drives one PATCH and returns the payload the route sent to
  // appointments.update(), captured from the mock builders.
  async function capturePatchPayload(current: Record<string, unknown>, body: Record<string, unknown>) {
    const supabase = withExtraChains(
      makeSupabaseClient({
        workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
        customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
        service_catalog: { data: { id: CATALOG_B }, error: null },
      }),
    );
    const builders: Builder[] = [];
    const baseImpl = (supabase.from as jest.Mock).getMockImplementation() as (table: string) => unknown;
    let appointmentReads = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "appointments") {
        appointmentReads += 1;
        const result =
          appointmentReads === 1
            ? { data: current, error: null }
            : { data: { ...current, updated_at: "2026-10-05T15:05:00.000Z" }, error: null };
        const builder = makeQueryBuilder(result);
        // The route's availability/conflict queries chain .not()/.or(), which
        // the shared builder stub does not implement.
        (builder as unknown as Record<string, unknown>).not = jest.fn(() => builder);
        (builder as unknown as Record<string, unknown>).or = jest.fn(() => builder);
        builders.push(builder);
        return builder;
      }
      return baseImpl(table);
    });
    stubWorkspaceMember(api, supabase);
    const { status } = await readJson(
      await appointmentPatch(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, { method: "PATCH", body }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    const updateBuilder = builders.find((b) => (b.update as jest.Mock).mock.calls.length > 0);
    const payload = updateBuilder
      ? ((updateBuilder.update as jest.Mock).mock.calls[0][0] as Record<string, unknown>)
      : null;
    return { status, payload };
  }

  it("keeps the locked quote, tax, service and channel when the staff edit-save re-prices", async () => {
    const { status, payload } = await capturePatchPayload(currentRow(), {
      workspace_id: WS_ID,
      source: "staff",
      estimated_cost: 144.41,
      tax_amount: 11.41,
      service_catalog_id: CATALOG_B,
      notes: "Gate code 4321",
    });
    expect(status).toBe(200);
    expect(payload).not.toBeNull();
    // The channel is write-once: an edit-save must not relabel the booking.
    expect(payload).not.toHaveProperty("source");
    // Non-price fields still update.
    expect(payload?.notes).toBe("Gate code 4321");
    // Price-bearing metadata is untouched: the website quote stays the price.
    const metadata = payload?.metadata as Record<string, unknown>;
    expect(metadata.estimated_cost).toBe(122.57);
    expect(metadata.tax_amount).toBe(0);
    expect(metadata.service_catalog_id).toBe(CATALOG_A);
    expect(metadata.pricing_state).toBe("website_quote_locked");
  });

  it("still applies price edits for a native staff appointment, but never rewrites source", async () => {
    const { status, payload } = await capturePatchPayload(
      currentRow({ source: "staff", metadata: { estimated_cost: 100, tax_amount: 6 } }),
      { workspace_id: WS_ID, source: "staff", estimated_cost: 150, tax_amount: 9 },
    );
    expect(status).toBe(200);
    expect(payload).not.toHaveProperty("source");
    const metadata = payload?.metadata as Record<string, unknown>;
    expect(metadata.estimated_cost).toBe(150);
    expect(metadata.tax_amount).toBe(9);
  });
});

describe("PUT /v1/appointment-items — website quote lock", () => {
  it("is a no-op for a locked appointment and never touches items or the catalog", async () => {
    const supabase = makeSupabaseClient({
      appointments: {
        data: { id: APPOINTMENT_ID, source: "moms_website", metadata: { ...LOCKED_METADATA } },
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await itemsPut(
        makeRequest("/api/v1/appointment-items", {
          method: "PUT",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, service_catalog_id: CATALOG_B },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.price_locked).toBe(true);
    const tables = (supabase.from as jest.Mock).mock.calls.map((call) => call[0] as string);
    expect(tables).not.toContain("appointment_items");
    expect(tables).not.toContain("service_catalog");
  });

  it("still syncs the primary service at the catalog price for a native appointment", async () => {
    const supabase = makeSupabaseClient({
      appointments: { data: { id: APPOINTMENT_ID, source: "staff", metadata: {} }, error: null },
      service_catalog: {
        data: { id: CATALOG_B, name: "Full Synthetic Oil Change", labor_price: 119 },
        error: null,
      },
      appointment_items: {
        data: { id: SERVICE_ID, description: "Full Synthetic Oil Change", unit_price: 119 },
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await itemsPut(
        makeRequest("/api/v1/appointment-items", {
          method: "PUT",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, service_catalog_id: CATALOG_B },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.unit_price).toBe(119);
  });
});

describe("appointment service lines — website quote lock (Hono router)", () => {
  const serviceBody = {
    service_catalog_id: CATALOG_B,
    name: "Full Synthetic Oil Change",
    description: null,
    price: 119,
    quantity: 1,
    is_prepaid: false,
    added_at_service: false,
  };

  // Per-table result queues: each from(table) call shifts the next result, so
  // the workspace resolution read and the staff-role read of
  // workspace_members can return different shapes.
  function sequencedSupabase(queues: Record<string, Array<{ data: unknown; error: unknown }>>) {
    const client = makeSupabaseClient();
    const baseImpl = (client.from as jest.Mock).getMockImplementation() as (table: string) => unknown;
    (client.from as jest.Mock).mockImplementation((table: string) => {
      const queue = queues[table];
      if (queue && queue.length) {
        const result = queue.shift() as { data: unknown; error: unknown };
        return makeQueryBuilder({ data: result.data, error: result.error });
      }
      return baseImpl(table);
    });
    return client;
  }

  function staffQueues(appointment: { data: unknown; error: unknown }) {
    return {
      workspace_members: [
        { data: [{ workspace_id: WS_ID }], error: null },
        { data: { role: "owner" }, error: null },
      ],
      appointments: [appointment],
    };
  }

  it("rejects adding a service line to a locked appointment with 409 price_locked", async () => {
    const supabase = sequencedSupabase(
      staffQueues({ data: { source: "moms_website", metadata: { ...LOCKED_METADATA } }, error: null }),
    );
    stubRequireUser(api, supabase);
    const { status, body } = await readJson(
      await app.request(`/v1/appointments/${APPOINTMENT_ID}/services?selected_workspace_id=${WS_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceBody),
      }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_locked");
  });

  it("allows adding a service line to a native appointment", async () => {
    const supabase = sequencedSupabase({
      ...staffQueues({ data: { source: "staff", metadata: {} }, error: null }),
      appointment_items: [{ data: { id: SERVICE_ID, description: "Full Synthetic Oil Change" }, error: null }],
    });
    stubRequireUser(api, supabase);
    const { status, body } = await readJson(
      await app.request(`/v1/appointments/${APPOINTMENT_ID}/services?selected_workspace_id=${WS_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceBody),
      }),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(SERVICE_ID);
  });

  it("rejects editing a service line on a locked appointment", async () => {
    const supabase = sequencedSupabase({
      ...staffQueues({ data: { source: "moms_website", metadata: { ...LOCKED_METADATA } }, error: null }),
      appointment_items: [{ data: { appointment_id: APPOINTMENT_ID }, error: null }],
    });
    stubRequireUser(api, supabase);
    const { status, body } = await readJson(
      await app.request(`/v1/appointments/services/${SERVICE_ID}?selected_workspace_id=${WS_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceBody),
      }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_locked");
  });

  it("rejects removing a service line from a locked appointment", async () => {
    const supabase = sequencedSupabase({
      ...staffQueues({ data: { source: "moms_website", metadata: { ...LOCKED_METADATA } }, error: null }),
      appointment_items: [{ data: { appointment_id: APPOINTMENT_ID }, error: null }],
    });
    stubRequireUser(api, supabase);
    const { status, body } = await readJson(
      await app.request(`/v1/appointments/services/${SERVICE_ID}`, { method: "DELETE" }),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_locked");
  });
});
