import "../../../test/api-routes/env";

import { z as mockZ } from "zod";
import { makeServerApiMock as mockMakeServerApiMock } from "../../hono/test-support/serverApiMock";
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
} from "../../hono/test-support/moduleMocks";

jest.mock("@/server/api", () =>
  mockMakeServerApiMock(
    jest.requireActual("@/server/api"),
  ),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);
jest.mock("@/server/messaging/quote-payment-events", () =>
  mockQuotePaymentEventsFactory(),
);
jest.mock("@/server/messaging/invoice-events", () =>
  mockInvoiceEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-sender", () =>
  mockLifecycleSenderFactory(),
);
jest.mock("@/server/messaging/appointment-events", () =>
  mockAppointmentEventsFactory(),
);
jest.mock("@/server/messaging/appointment-reminder-producer", () =>
  mockReminderProducerFactory(),
);
jest.mock("@/server/messaging/booking-confirmation", () =>
  mockBookingConfirmationFactory(),
);
jest.mock("@/server/messaging/lifecycle-action-urls", () =>
  mockLifecycleActionUrlsFactory(),
);
jest.mock("@/server/messaging/webhook", () =>
  mockWebhookIngestFactory(),
);
jest.mock("@/server/messaging/enginemailer", () =>
  mockEnginemailerFactory(),
);
jest.mock("@/server/messaging/resend", () =>
  mockResendFactory(),
);
jest.mock("@/server/messaging/twilio", () =>
  mockTwilioFactory(),
);
jest.mock("@/server/notifications/push-outbox", () =>
  mockPushOutboxFactory(),
);
jest.mock("@/server/billing/stripe-billing-reconciliation", () =>
  mockStripeBillingReconciliationFactory(),
);
jest.mock("@/server/billing/workspace-billing", () =>
  mockWorkspaceBillingFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/payments/stripe-workspace-execution", () =>
  mockStripeWorkspaceExecutionFactory(),
);
jest.mock("@/server/invitations/mailer", () =>
  mockInvitationsMailerFactory(),
);
jest.mock("@/server/audit", () =>
  mockAuditFactory(),
);
jest.mock("@/server/accountImport", () => ({
  ...mockAccountImportFactory(),
  accountExportSchema: mockZ.unknown(),
}));
jest.mock("@/server/crm/newsletter", () => ({
  processDueNewsletterSubscribers: jest.fn(),
  enrollNewsletterFromBooking: jest.fn(),
}));
jest.mock("stripe", () => jest.fn());

import { GET, POST, OPTIONS } from "../../../../app/api/[[...route]]/route";
import {
  authState,
  db,
  resetHarness,
  WS_ID,
} from "../../hono/test-support/state";
import { makeRequest, readJson } from "../../../test/api-routes/helpers";

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetHarness();
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("hono catch-all ([[...route]])", () => {
  it("returns 404 for an unknown /api path", async () => {
    const res = await GET(new Request("https://test.local/api/v1/reviews/actions"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for POST to an unknown /api path", async () => {
    const res = await POST(new Request("https://test.local/api/v1/nope", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unregistered method on a known path", async () => {
    const res = await GET(new Request("https://test.local/api/v1/catalog/items", { method: "PUT" }));
    expect(res.status).toBe(404);
  });

  it("forwards a known Hono route through handle(app) and returns its payload", async () => {
    db.service_catalog = {
      data: [{ id: "880e8400-e29b-41d4-a716-446655440001", name: "Oil Change", labor_price: 49.99 }],
      error: null,
    };
    const res = await GET(makeRequest(`/api/v1/catalog/items?workspace_id=${WS_ID}`));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Oil Change");
  });

  it("propagates 401 from the shared auth layer through the catch-all", async () => {
    authState.mode = "unauthorized";
    const res = await GET(makeRequest(`/api/v1/catalog/items?workspace_id=${WS_ID}`));
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("propagates 403 from the shared auth layer through the catch-all", async () => {
    authState.mode = "forbidden";
    const res = await GET(makeRequest(`/api/v1/catalog/items?workspace_id=${WS_ID}`));
    const { status, body } = await readJson(res);
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("answers OPTIONS preflight with 204 and CORS headers", async () => {
    process.env.NEXT_PUBLIC_CORS_ORIGIN = "https://app.example.com";
    const res = await OPTIONS(makeRequest("/api/v1/catalog/items", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
