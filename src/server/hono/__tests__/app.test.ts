/**
 * Grey-box tests for the Hono application factory (`createHonoApp`):
 * router mounting under `/api`, the global error contract, CORS preflight,
 * and cross-router route registration.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  accountImportFactory as mockAccountImportFactory,
  appointmentEventsFactory as mockAppointmentEventsFactory,
  auditFactory as mockAuditFactory,
  bookingConfirmationFactory as mockBookingConfirmationFactory,
  enginemailerFactory as mockEnginemailerFactory,
  invitationsMailerFactory as mockInvitationsMailerFactory,
  invoiceEventsFactory as mockInvoiceEventsFactory,
  lifecycleActionUrlsFactory as mockLifecycleActionUrlsFactory,
  lifecycleEventsFactory as mockLifecycleEventsFactory,
  lifecycleSenderFactory as mockLifecycleSenderFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  pushOutboxFactory as mockPushOutboxFactory,
  quotePaymentEventsFactory as mockQuotePaymentEventsFactory,
  reminderProducerFactory as mockReminderProducerFactory,
  resendFactory as mockResendFactory,
  stripeBillingReconciliationFactory as mockStripeBillingReconciliationFactory,
  stripeInvoiceSyncFactory as mockStripeInvoiceSyncFactory,
  stripeWorkspaceExecutionFactory as mockStripeWorkspaceExecutionFactory,
  twilioFactory as mockTwilioFactory,
  webhookIngestFactory as mockWebhookIngestFactory,
  workspaceBillingFactory as mockWorkspaceBillingFactory,
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
// appointments deps
jest.mock("@/server/messaging/appointment-events", () =>
  mockAppointmentEventsFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/messaging/lifecycle-action-urls", () =>
  mockLifecycleActionUrlsFactory(),
);
// billing deps
jest.mock("@/server/billing/workspace-billing", () =>
  mockWorkspaceBillingFactory(),
);
jest.mock("@/server/messaging/quote-payment-events", () =>
  mockQuotePaymentEventsFactory(),
);
jest.mock("@/server/payments/stripe-workspace-execution", () =>
  mockStripeWorkspaceExecutionFactory(),
);
// documents deps
jest.mock("@/server/messaging/invoice-events", () =>
  mockInvoiceEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-sender", () =>
  mockLifecycleSenderFactory(),
);
// messaging deps
jest.mock("@/server/messaging/enginemailer", () =>
  mockEnginemailerFactory(),
);
jest.mock("@/server/messaging/resend", () =>
  mockResendFactory(),
);
jest.mock("@/server/messaging/twilio", () =>
  mockTwilioFactory(),
);
jest.mock("@/server/messaging/webhook", () =>
  mockWebhookIngestFactory(),
);
jest.mock("@/server/billing/stripe-billing-reconciliation", () =>
  mockStripeBillingReconciliationFactory(),
);
jest.mock("@/server/notifications/push-outbox", () =>
  mockPushOutboxFactory(),
);
jest.mock("@/server/messaging/appointment-reminder-producer", () =>
  mockReminderProducerFactory(),
);
// platform deps
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
// shared by several routers
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);

import { createHonoApp } from "@/server/hono/app";
import {
  authState,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

beforeEach(() => {
  resetHarness();
  db["rpc:current_workspace_owner_user_id"] = { data: USER_ID, error: null };
});

describe("createHonoApp composition", () => {
  it("mounts every domain router under /api", async () => {
    const app = createHonoApp();
    db.appointments = { data: [], error: null };
    db.payments = { data: [], error: null };
    db.invoices = { data: [], error: null };
    db.work_orders = { data: [], error: null };
    db.vehicles = { data: [], error: null };
    db.customers = { data: [], error: null };
    db.service_catalog = { data: [], error: null };
    db["email_settings:single"] = { data: null, error: null };
    db.workspace_members = {
      data: [{ workspace_id: WS_ID, role: "owner" }],
      error: null,
    };

    const checks: Array<[string, number[]]> = [
      [`/api/v1/health`, [200]],
      [`/api/v1/appointments?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/payments?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/catalog/items?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/customers?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/invoices?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/vehicles?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/work-orders?workspace_id=${WS_ID}`, [200]],
      [`/api/v1/email-settings`, [200]],
    ];
    for (const [path, okStatuses] of checks) {
      const res = await app.request(path);
      expect(okStatuses).toContain(res.status);
      expect(res.status).not.toBe(404);
    }
  });

  it("returns 404 for unregistered paths", async () => {
    const app = createHonoApp();
    const res = await app.request("/api/v1/definitely-not-a-route");
    expect(res.status).toBe(404);
  });

  it("answers CORS preflight with 204", async () => {
    const app = createHonoApp();
    const res = await app.request("/api/v1/appointments", { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("maps handler errors to the { error: { code, message } } contract", async () => {
    const app = createHonoApp();
    // Missing workspace_id -> handler throws -> global onError -> errorResponse
    const res = await app.request("/api/v1/appointments");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    expect(typeof body.error.message).toBe("string");
  });

  it("maps ApiError statuses through the composed app", async () => {
    const app = createHonoApp();
    authState.mode = "unauthorized";
    const res = await app.request(`/api/v1/payments?workspace_id=${WS_ID}`);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
  });

  it("treats an unknown method on a known path as 404", async () => {
    const app = createHonoApp();
    const res = await app.request("/api/v1/health", { method: "DELETE" });
    // Hono has no 405 handling; the contract is 404.
    expect(res.status).toBe(404);
  });

  it("keeps /api prefix routing distinct from bare paths", async () => {
    const app = createHonoApp();
    // Routers are mounted under basePath("/api"), so the bare path misses.
    const res = await app.request("/v1/health");
    expect(res.status).toBe(404);
  });
});
