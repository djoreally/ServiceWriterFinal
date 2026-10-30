/**
 * Grey-box tests for Provider Sync (platform + appointments routers).
 *
 * Provider Sync used to proxy to two Supabase Edge Functions that do not
 * exist (`sync-appointment-to-provider`, `provider-sync-manager`): the
 * version probe failed ("fn unreachable") and the proxy 401'd every
 * signed-in caller ("Not authenticated"). These tests pin the native
 * replacement: the sync runs through the canonical Stripe invoice sync,
 * attempts are recorded in payment_provider_records /
 * payment_provider_sync_logs, and a missing canonical payment is created
 * in the exact shape appointment closeout uses.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  accountImportFactory as mockAccountImportFactory,
  appointmentEventsFactory as mockAppointmentEventsFactory,
  auditFactory as mockAuditFactory,
  bookingConfirmationFactory as mockBookingConfirmationFactory,
  invitationsMailerFactory as mockInvitationsMailerFactory,
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
jest.mock("@/server/invitations/mailer", () =>
  mockInvitationsMailerFactory(),
);
jest.mock("@/server/audit", () =>
  mockAuditFactory(),
);
jest.mock("@/server/accountImport", () =>
  mockAccountImportFactory(),
);
jest.mock("@/server/messaging/booking-confirmation", () =>
  mockBookingConfirmationFactory(),
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

import { platformRouter as platformRouterRaw } from "@/server/hono/routes/platform";
import { appointmentsRouter as appointmentsRouterRaw } from "@/server/hono/routes/appointments";
import { syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const platformRouter = testRouter(platformRouterRaw);
const appointmentsRouter = testRouter(appointmentsRouterRaw);

const APPT_ID = "a1111111-1111-4111-8111-111111111111";
const INV_ID = "b2222222-2222-4222-8222-222222222222";
const PAY_ID = "c3333333-3333-4333-8333-333333333333";
const NEW_PAY_ID = "d4444444-4444-4444-8444-444444444444";
const REC_ID = "e5555555-5555-4555-8555-555555555555";

const syncMock = syncCanonicalInvoiceToStripe as unknown as jest.Mock;

const appointmentRow = { id: APPT_ID, workspace_id: WS_ID, customer_id: CUSTOMER_ID };
const invoiceRow = {
  id: INV_ID,
  customer_id: CUSTOMER_ID,
  subtotal: 119,
  tax_total: 7.14,
  total: 126.14,
  status: "issued",
  metadata: { appointment_id: APPT_ID },
};

function seedStripeWorkspace() {
  db["appointments:single"] = { data: appointmentRow, error: null };
  db["workspace_settings:single"] = {
    data: { payment_provider: "stripe", operational_settings: {} },
    error: null,
  };
}

function seedInvoiceAndPayment() {
  db.invoices = { data: [invoiceRow], error: null };
  db.payments = { data: [{ id: PAY_ID }], error: null };
  db.payment_provider_records = { data: [], error: null };
  db["payment_provider_records:single"] = { data: { id: REC_ID }, error: null };
}

function postSyncRequest() {
  return platformRouter.request("/v1/platform/provider-sync/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appointment_id: APPT_ID, sync_mode: "manual_resync" }),
  });
}

beforeEach(() => {
  resetHarness();
  syncMock.mockReset();
  syncMock.mockResolvedValue({
    provider: "stripe",
    status: "synced",
    stripeAccountId: "acct_test",
    stripeCustomerId: "cus_test",
    stripeInvoiceId: "in_test",
    hostedInvoiceUrl: "https://invoice.stripe.com/i/test",
    invoiceStatus: "open",
    paymentMode: "connect",
  });
});

describe("GET /v1/platform/provider-sync/function-version", () => {
  it("answers the probe locally, even unauthenticated (no more 'fn unreachable')", async () => {
    authState.mode = "unauthorized";
    const res = await platformRouter.request("/v1/platform/provider-sync/function-version");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.function).toBe("sync-appointment-to-provider");
    expect(body.version).toBe("2.0.0");
    expect(body.capabilities.stripe_invoice_sync).toBe(true);
  });
});

describe("POST /v1/platform/provider-sync/request", () => {
  it("syncs the appointment's invoice to Stripe and records the attempt", async () => {
    seedStripeWorkspace();
    seedInvoiceAndPayment();

    const res = await postSyncRequest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("succeeded");
    expect(body.version).toBe("2.0.0");
    expect(body.external_invoice_id).toBe("in_test");
    expect(body.hosted_invoice_url).toBe("https://invoice.stripe.com/i/test");

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith({
      supabase: expect.anything(),
      workspaceId: WS_ID,
      appointmentId: APPT_ID,
      invoiceId: INV_ID,
      paymentId: PAY_ID,
    });

    const recordInsert = calls.inserts.find((entry) => entry.table === "payment_provider_records");
    expect(recordInsert).toBeDefined();
    expect((recordInsert!.rows as Record<string, unknown>).sync_status).toBe("processing");

    const recordUpdate = calls.updates.find((entry) => entry.table === "payment_provider_records");
    expect(recordUpdate).toBeDefined();
    expect((recordUpdate!.patch as Record<string, unknown>).sync_status).toBe("succeeded");
    expect((recordUpdate!.patch as Record<string, unknown>).external_invoice_id).toBe("in_test");

    const logStatuses = calls.inserts
      .filter((entry) => entry.table === "payment_provider_sync_logs")
      .map((entry) => (entry.rows as Record<string, unknown>).status);
    expect(logStatuses).toEqual(["started", "succeeded"]);
  });

  it("creates the canonical pending payment when the appointment has none yet", async () => {
    seedStripeWorkspace();
    db.invoices = { data: [invoiceRow], error: null };
    db.payments = { data: [], error: null };
    db["payments:single"] = { data: { id: NEW_PAY_ID }, error: null };
    db.payment_provider_records = { data: [], error: null };
    db["payment_provider_records:single"] = { data: { id: REC_ID }, error: null };

    const res = await postSyncRequest();
    expect(res.status).toBe(200);

    const paymentInsert = calls.inserts.find((entry) => entry.table === "payments");
    expect(paymentInsert).toBeDefined();
    const rows = paymentInsert!.rows as Record<string, any>;
    expect(rows.status).toBe("pending");
    expect(rows.amount).toBe(126.14);
    expect(rows.invoice_id).toBe(INV_ID);
    expect(rows.customer_id).toBe(CUSTOMER_ID);
    expect(rows.created_by).toBe(USER_ID);
    expect(rows.metadata).toMatchObject({
      appointment_id: APPT_ID,
      invoice_id: INV_ID,
      source: "provider_sync",
      payment_type: "pay_at_service",
      subtotal: 119,
      tax_amount: 7.14,
      subtotal_cents: 11900,
      tax_amount_cents: 714,
    });
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: INV_ID, paymentId: NEW_PAY_ID }),
    );
  });

  it("rejects with 409 when the appointment has no invoice yet", async () => {
    seedStripeWorkspace();
    db.invoices = { data: [], error: null };

    const res = await postSyncRequest();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("invoice_required");
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers with 401 (the old proxy bug inverted)", async () => {
    authState.mode = "unauthorized";
    seedStripeWorkspace();

    const res = await postSyncRequest();
    expect(res.status).toBe(401);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("returns 402 when the workspace lacks the Payments add-on", async () => {
    authState.mode = "payments_required";
    seedStripeWorkspace();

    const res = await postSyncRequest();
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("payments_addon_required");
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown appointment", async () => {
    db["appointments:single"] = { data: null, error: null };

    const res = await postSyncRequest();
    expect(res.status).toBe(404);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("records an honest failure for Square workspaces instead of a silent no-op", async () => {
    db["appointments:single"] = { data: appointmentRow, error: null };
    db["workspace_settings:single"] = {
      data: { payment_provider: "square", operational_settings: {} },
      error: null,
    };
    db.payment_provider_records = { data: [], error: null };
    db["payment_provider_records:single"] = { data: { id: REC_ID }, error: null };

    const res = await postSyncRequest();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("provider_sync_unsupported");
    expect(syncMock).not.toHaveBeenCalled();

    const recordInsert = calls.inserts.find((entry) => entry.table === "payment_provider_records");
    expect(recordInsert).toBeDefined();
    expect((recordInsert!.rows as Record<string, unknown>).provider).toBe("square");
    expect((recordInsert!.rows as Record<string, unknown>).sync_status).toBe("failed");
  });

  it("marks the record failed and surfaces the error when Stripe sync throws", async () => {
    seedStripeWorkspace();
    seedInvoiceAndPayment();
    syncMock.mockRejectedValue(
      new Error("Connected Stripe account is not enabled to accept charges."),
    );

    const res = await postSyncRequest();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("provider_sync_failed");
    expect(body.error.message).toContain("not enabled to accept charges");

    const failedUpdate = calls.updates.find(
      (entry) =>
        entry.table === "payment_provider_records" &&
        (entry.patch as Record<string, unknown>).sync_status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(
      (failedUpdate!.patch as Record<string, unknown>).last_error as string,
    ).toContain("not enabled to accept charges");
  });

  it("maps a skipped canonical sync to 409 active_provider_not_stripe", async () => {
    seedStripeWorkspace();
    seedInvoiceAndPayment();
    syncMock.mockResolvedValue({ provider: "square", status: "skipped" });

    const res = await postSyncRequest();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("active_provider_not_stripe");
  });
});

describe("POST /v1/platform/provider-sync/manage (retry)", () => {
  it("re-runs the sync for an existing record, incrementing its attempt count", async () => {
    seedStripeWorkspace();
    seedInvoiceAndPayment();
    const existingRecord = {
      id: REC_ID,
      appointment_id: APPT_ID,
      payment_record_id: PAY_ID,
      provider: "stripe",
      sync_mode: "manual_resync",
      sync_status: "failed",
      attempt_count: 1,
      metadata: {},
    };
    db["payment_provider_records:single"] = { data: existingRecord, error: null };
    db.payment_provider_records = { data: [existingRecord], error: null };

    const res = await platformRouter.request("/v1/platform/provider-sync/manage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retry", record_id: REC_ID }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("succeeded");
    expect(syncMock).toHaveBeenCalledTimes(1);

    const processingUpdate = calls.updates.find(
      (entry) =>
        entry.table === "payment_provider_records" &&
        (entry.patch as Record<string, unknown>).sync_status === "processing",
    );
    expect(processingUpdate).toBeDefined();
    expect((processingUpdate!.patch as Record<string, unknown>).attempt_count).toBe(2);
    // No second record row is created for a retry.
    expect(
      calls.inserts.filter((entry) => entry.table === "payment_provider_records"),
    ).toHaveLength(0);
  });
});

describe("GET /v1/platform/provider-sync/summary + records", () => {
  function seedWorkspaceReads() {
    db.workspace_members = {
      data: [
        {
          workspace_id: WS_ID,
          role: "owner",
          is_active: true,
          workspaces: {
            id: WS_ID,
            name: "MOMS",
            slug: "moms",
            kind: "shop",
            timezone: "America/New_York",
            currency_code: "USD",
            is_active: true,
          },
        },
      ],
      error: null,
    };
    db.appointments = { data: [{ id: APPT_ID }], error: null };
    db.payment_provider_records = {
      data: [
        { id: REC_ID, appointment_id: APPT_ID, provider: "stripe", sync_status: "succeeded", dead_letter: false },
        { id: "f6666666-6666-4666-8666-666666666666", appointment_id: APPT_ID, provider: "stripe", sync_status: "failed", dead_letter: false },
      ],
      error: null,
    };
  }

  it("summarizes the workspace's sync records", async () => {
    seedWorkspaceReads();
    const res = await platformRouter.request("/v1/platform/provider-sync/summary");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ total: 2, succeeded: 1, failed: 1, stripe: 2, square: 0, dead_letter: 0 });
  });

  it("lists the workspace's sync records", async () => {
    seedWorkspaceReads();
    const res = await platformRouter.request("/v1/platform/provider-sync/records");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(2);
  });
});

describe("appointments router provider-sync reads", () => {
  it("GET /v1/appointments/:id/provider-sync serves records from the sync table", async () => {
    db["appointments:single"] = { data: appointmentRow, error: null };
    db.payment_provider_records = {
      data: [
        {
          id: REC_ID,
          appointment_id: APPT_ID,
          provider: "stripe",
          sync_status: "succeeded",
          external_invoice_id: "in_test",
        },
      ],
      error: null,
    };

    const res = await appointmentsRouter.request(`/v1/appointments/${APPT_ID}/provider-sync`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.records).toHaveLength(1);
    expect(body.data.records[0].external_invoice_id).toBe("in_test");
  });

  it("GET /v1/appointments/provider-sync-logs serves the record's logs", async () => {
    db["appointments:single"] = { data: appointmentRow, error: null };
    db["payment_provider_records:single"] = {
      data: { id: REC_ID, appointment_id: APPT_ID },
      error: null,
    };
    db.payment_provider_sync_logs = {
      data: [
        {
          id: "f6666666-6666-4666-8666-666666666666",
          attempt_number: 1,
          status: "succeeded",
          error_message: null,
          duration_ms: 42,
          context: {},
          created_at: "2026-10-30T17:00:00Z",
        },
      ],
      error: null,
    };

    const res = await appointmentsRouter.request(
      `/v1/appointments/provider-sync-logs?record_id=${REC_ID}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.logs[0].status).toBe("succeeded");
  });
});
