import "../../../test/api-routes/env";

// Route-level coverage for the staff overrides build (2026-11-03):
//   * POST /v1/appointments with lock_custom_price stamps the manual
//     quote lock and seeds the priced item (Piece 1);
//   * PATCH /v1/appointments/:id honors override_availability on an
//     edit/reschedule (Piece 2 — the server gate already existed; this
//     pins that the flag, when it finally reaches the route, works).
//
// NOTE on the lifecycle-events mock: instead of jest.requireActual (which
// would pull the whole email-sender chain into the test module graph),
// the keys below are copied verbatim from
// src/server/messaging/lifecycle-events.ts (same pattern as
// appointments-price-lock.test.ts).
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
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  // Route handlers schedule post-response work with after(); outside a
  // real request scope it throws. Swallow it so the handler's response
  // is what is asserted.
  after: () => undefined,
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
import * as api from "@/server/api";
import { POST as appointmentCreate } from "../../../../app/api/v1/appointments/route";
import { PATCH as appointmentPatch } from "../../../../app/api/v1/appointments/[id]/route";
import {
  makeRequest,
  readJson,
  contextWithParams,
  makeQueryBuilder,
  makeSupabaseClient,
  stubWorkspaceMember,
  WS_ID,
  APPOINTMENT_ID,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const CATALOG_ID = "77777777-7777-4777-8777-777777777777";

// Workspace configured 09:00-17:00 Mon-Fri: the production shape that
// made an 8:30 AM fleet slot impossible without the override.
const SETTINGS = {
  day_hours: {},
  opening_time: "09:00",
  closing_time: "17:00",
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  buffer_time_before: 0,
  buffer_time_after: 0,
  min_lead_time_hours: 0,
};

type Builder = ReturnType<typeof makeQueryBuilder>;

// Records every builder the client hands out, per table, so a test can
// read back the exact payload a route sent to insert()/update().
function recordingClient(tables: Parameters<typeof makeSupabaseClient>[0]) {
  const supabase = makeSupabaseClient(tables);
  const builders: Array<{ table: string; builder: Builder }> = [];
  const baseImpl = (supabase.from as jest.Mock).getMockImplementation() as (table: string) => unknown;
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const builder = baseImpl(table) as Builder;
    const record = builder as unknown as Record<string, unknown>;
    if (typeof record.not !== "function") record.not = jest.fn(() => builder);
    if (typeof record.or !== "function") record.or = jest.fn(() => builder);
    builders.push({ table, builder });
    return builder;
  });
  return { supabase: supabase as MockSupabaseClient, builders };
}

function insertPayload(
  builders: Array<{ table: string; builder: Builder }>,
  table: string,
): Record<string, unknown> | null {
  const found = builders.find(
    ({ table: t, builder }) => t === table && (builder.insert as jest.Mock).mock.calls.length > 0,
  );
  return found ? ((found.builder.insert as jest.Mock).mock.calls[0][0] as Record<string, unknown>) : null;
}

describe("POST /v1/appointments — staff manual quote lock", () => {
  const createBody = (overrides: Record<string, unknown> = {}) => ({
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    // Thursday 2026-11-12, 14:00-15:00 UTC — inside configured hours.
    starts_at: "2026-11-12T14:00:00.000Z",
    ends_at: "2026-11-12T15:00:00.000Z",
    title: "Full Synthetic Oil Change",
    service_catalog_id: CATALOG_ID,
    estimated_cost: 120,
    tax_amount: 7.2,
    ...overrides,
  });

  function createClient() {
    return recordingClient({
      customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
      workspaces: { data: { timezone: "UTC" }, error: null },
      workspace_settings: { data: SETTINGS, error: null },
      service_catalog: { data: { id: CATALOG_ID, name: "Full Synthetic Oil Change" }, error: null },
      appointments: { data: { id: APPOINTMENT_ID, workspace_id: WS_ID }, error: null },
    });
  }

  it("stamps the lock and seeds one item at the typed total when staff lock a custom price", async () => {
    const { supabase, builders } = createClient();
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await appointmentCreate(
        makeRequest("/api/v1/appointments", {
          method: "POST",
          body: createBody({ lock_custom_price: true }),
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(APPOINTMENT_ID);

    const appointmentInsert = insertPayload(builders, "appointments");
    expect(appointmentInsert).not.toBeNull();
    const metadata = appointmentInsert?.metadata as Record<string, unknown>;
    // The typed $120 is the price: stamped as the quote, tax zeroed,
    // exactly the shape the website push writes for its lock.
    expect(metadata.pricing_state).toBe("manual_quote_locked");
    expect(metadata.estimated_cost).toBe(120);
    expect(metadata.client_estimated_cost).toBe(120);
    expect(metadata.tax_amount).toBe(0);

    const itemInsert = insertPayload(builders, "appointment_items");
    expect(itemInsert).not.toBeNull();
    expect(itemInsert?.appointment_id).toBe(APPOINTMENT_ID);
    expect(itemInsert?.service_catalog_id).toBe(CATALOG_ID);
    expect(itemInsert?.description).toBe("Full Synthetic Oil Change");
    expect(itemInsert?.quantity).toBe(1);
    expect(itemInsert?.unit_price).toBe(120);
    const itemMetadata = itemInsert?.metadata as Record<string, unknown>;
    expect(itemMetadata.price_source).toBe("manual_quote");
    expect(itemMetadata.source).toBe("staff");
  });

  it("creates a native appointment — no lock, no seeded item — when the lock is not chosen", async () => {
    const { supabase, builders } = createClient();
    stubWorkspaceMember(api, supabase);
    const { status } = await readJson(
      await appointmentCreate(
        makeRequest("/api/v1/appointments", { method: "POST", body: createBody() }),
      ),
    );
    expect(status).toBe(201);
    const metadata = insertPayload(builders, "appointments")?.metadata as Record<string, unknown>;
    expect(metadata.pricing_state).toBeUndefined();
    // Native path keeps the typed estimate and tax exactly as sent; the
    // primary-service sync prices the line from the catalog afterwards.
    expect(metadata.estimated_cost).toBe(120);
    expect(metadata.tax_amount).toBe(7.2);
    expect(insertPayload(builders, "appointment_items")).toBeNull();
  });

  it("does not lock a zero custom price (mirrors the $0-quote rule of the other locks)", async () => {
    const { supabase, builders } = createClient();
    stubWorkspaceMember(api, supabase);
    const { status } = await readJson(
      await appointmentCreate(
        makeRequest("/api/v1/appointments", {
          method: "POST",
          body: createBody({ lock_custom_price: true, estimated_cost: 0, tax_amount: 0 }),
        }),
      ),
    );
    expect(status).toBe(201);
    const metadata = insertPayload(builders, "appointments")?.metadata as Record<string, unknown>;
    expect(metadata.pricing_state).toBeUndefined();
    expect(insertPayload(builders, "appointment_items")).toBeNull();
  });
});

describe("PATCH /v1/appointments/:id — override_availability on edit", () => {
  const currentRow = () => ({
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    vehicle_id: null,
    location_id: null,
    starts_at: "2026-11-12T14:00:00.000Z",
    ends_at: "2026-11-12T15:00:00.000Z",
    status: "confirmed",
    source: "staff",
    assigned_user_id: null,
    metadata: {},
    updated_at: "2026-11-03T12:00:00.000Z",
  });

  // Drives one PATCH moving the appointment to 07:00-08:00 — outside the
  // configured 09:00 open — and returns the response plus the payload
  // the route sent to appointments.update().
  async function captureReschedule(body: Record<string, unknown>) {
    const current = currentRow();
    const supabase = makeSupabaseClient({
      workspaces: { data: { name: "Shop", timezone: "UTC" }, error: null },
      workspace_settings: { data: SETTINGS, error: null },
      customers: { data: { id: CUSTOMER_ID, status: "active" }, error: null },
    });
    const builders: Builder[] = [];
    const baseImpl = (supabase.from as jest.Mock).getMockImplementation() as (table: string) => unknown;
    let appointmentReads = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "appointments") {
        appointmentReads += 1;
        const result =
          appointmentReads === 1
            ? { data: current, error: null }
            : { data: { ...current, updated_at: "2026-11-12T08:05:00.000Z" }, error: null };
        const builder = makeQueryBuilder(result);
        const record = builder as unknown as Record<string, unknown>;
        record.not = jest.fn(() => builder);
        record.or = jest.fn(() => builder);
        builders.push(builder);
        return builder;
      }
      return baseImpl(table);
    });
    stubWorkspaceMember(api, supabase);
    const response = await readJson(
      await appointmentPatch(
        makeRequest(`/api/v1/appointments/${APPOINTMENT_ID}`, { method: "PATCH", body }),
        contextWithParams({ id: APPOINTMENT_ID }),
      ),
    );
    const updateBuilder = builders.find((b) => (b.update as jest.Mock).mock.calls.length > 0);
    const payload = updateBuilder
      ? ((updateBuilder.update as jest.Mock).mock.calls[0][0] as Record<string, unknown>)
      : null;
    return { ...response, payload };
  }

  const earlySlot = {
    workspace_id: WS_ID,
    starts_at: "2026-11-12T07:00:00.000Z",
    ends_at: "2026-11-12T08:00:00.000Z",
  };

  it("rejects the off-hours reschedule with 409 when the flag is absent (tonight's failure)", async () => {
    const { status, body, payload } = await captureReschedule({ ...earlySlot });
    expect(status).toBe(409);
    expect(body.error.code).toBe("outside_business_hours");
    expect(payload).toBeNull();
  });

  it("applies the same reschedule when override_availability is sent", async () => {
    const { status, payload } = await captureReschedule({ ...earlySlot, override_availability: true });
    expect(status).toBe(200);
    expect(payload).not.toBeNull();
    expect(payload?.starts_at).toBe("2026-11-12T07:00:00.000Z");
    expect(payload?.ends_at).toBe("2026-11-12T08:00:00.000Z");
    const metadata = payload?.metadata as Record<string, unknown>;
    expect(metadata.override_availability).toBe(true);
  });
});
