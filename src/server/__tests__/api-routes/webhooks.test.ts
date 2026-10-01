import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/messaging/enginemailer", () => ({ EnginemailerEmailAdapter: jest.fn() }));
jest.mock("@/server/messaging/resend", () => ({ ResendEmailAdapter: jest.fn() }));
jest.mock("@/server/messaging/twilio", () => ({ TwilioSmsAdapter: jest.fn() }));
jest.mock("@/server/messaging/webhook", () => ({
  ingestDeliveryWebhook: jest.fn(),
  ingestInboundWebhook: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/server/billing/stripe-billing-reconciliation", () => ({
  reconcileServiceWriterBillingEvent: jest.fn(),
}));
jest.mock("@/server/payments/stripe-workspace-execution", () => ({
  stripePaymentMode: jest.fn(),
  directWebhookSecret: jest.fn(),
  resolveStripeWorkspaceExecution: jest.fn(),
}));
const mockStripeCtor = jest.fn();
jest.mock("stripe", () => ({ __esModule: true, default: mockStripeCtor }));

import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";
import { ingestDeliveryWebhook, ingestInboundWebhook } from "@/server/messaging/webhook";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { reconcileServiceWriterBillingEvent } from "@/server/billing/stripe-billing-reconciliation";
import {
  stripePaymentMode,
  directWebhookSecret,
  resolveStripeWorkspaceExecution,
} from "@/server/payments/stripe-workspace-execution";

import { POST as enginemailerPost } from "../../../../app/api/v1/webhooks/enginemailer/route";
import { POST as resendPost } from "../../../../app/api/v1/webhooks/resend/route";
import { POST as twilioPost } from "../../../../app/api/v1/webhooks/twilio/route";
import { POST as twilioInboundPost } from "../../../../app/api/v1/webhooks/twilio/inbound/route";
// eslint-disable-next-line no-restricted-imports -- importing the server route under test; the stripe-import restriction targets frontend SDK usage
import { POST as stripePost } from "../../../../app/api/webhooks/stripe/route";
// eslint-disable-next-line no-restricted-imports -- importing the server route under test; the stripe-import restriction targets frontend SDK usage
import { POST as stripeDirectPost } from "../../../../app/api/webhooks/stripe/direct/[workspaceId]/route";

import {
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  makeQueryBuilder,
  WS_ID,
} from "../../../test/api-routes/helpers";

const PAYMENT_ID = "44444444-4444-4444-8444-444444444444";
const mockStripeConstructEvent = jest.fn();
const mockDirectConstructEvent = jest.fn();

const EnginemailerAdapterMock = EnginemailerEmailAdapter as unknown as jest.Mock;
const ResendAdapterMock = ResendEmailAdapter as unknown as jest.Mock;
const TwilioAdapterMock = TwilioSmsAdapter as unknown as jest.Mock;
const ingestDeliveryMock = ingestDeliveryWebhook as jest.Mock;
const ingestInboundMock = ingestInboundWebhook as jest.Mock;

const reconcileBillingMock = reconcileServiceWriterBillingEvent as jest.Mock;
const createAdminMock = createSupabaseAdminClient as jest.Mock;
const stripePaymentModeMock = stripePaymentMode as jest.Mock;
const directWebhookSecretMock = directWebhookSecret as jest.Mock;
const resolveExecutionMock = resolveStripeWorkspaceExecution as jest.Mock;

function invoiceObject() {
  return {
    id: "in_test_1",
    metadata: { payment_id: PAYMENT_ID, workspace_id: WS_ID },
    amount_paid: 5000,
    status: "paid",
    status_transitions: { paid_at: 1750000000 },
    hosted_invoice_url: null,
  };
}

function checkoutSessionObject() {
  return {
    id: "cs_test_1",
    metadata: { payment_id: PAYMENT_ID, workspace_id: WS_ID },
    payment_intent: "pi_test_1",
    amount_total: 7500,
    payment_status: "paid",
  };
}

function stripeEvent(type: string, object: Record<string, unknown>) {
  return { id: "evt_test_1", type, created: 1750000000, data: { object } };
}

function stripeAdmin() {
  return makeSupabaseClient({
    webhook_events: { data: null, error: null },
    payments: { data: { id: PAYMENT_ID, workspace_id: WS_ID, status: "pending", metadata: {} }, error: null },
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  ingestDeliveryMock.mockResolvedValue({ accepted: true, duplicate: false, count: 3 });
  ingestInboundMock.mockResolvedValue({ accepted: true, duplicate: false, count: 1 });
  mockStripeCtor.mockImplementation(() => ({ webhooks: { constructEvent: mockStripeConstructEvent } }));
  mockStripeConstructEvent.mockReturnValue(stripeEvent("invoice.paid", invoiceObject()));
  reconcileBillingMock.mockResolvedValue(false);
  stripePaymentModeMock.mockReturnValue("direct");
  directWebhookSecretMock.mockReturnValue("whsec_direct_1");
  resolveExecutionMock.mockReturnValue({ stripe: { webhooks: { constructEvent: mockDirectConstructEvent } } });
  mockDirectConstructEvent.mockReturnValue(stripeEvent("invoice.paid", invoiceObject()));
  createAdminMock.mockReturnValue(stripeAdmin());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function rawWebhookRequest(path: string, headers: Record<string, string> = {}) {
  return makeRequest(path, { method: "POST", body: "raw-webhook-payload", headers });
}

describe("POST /api/v1/webhooks/enginemailer", () => {
  it("accepts a valid delivery webhook and returns counts", async () => {
    const res = await enginemailerPost(rawWebhookRequest("/api/v1/webhooks/enginemailer"));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, accepted: 3, duplicate: false });
    expect(EnginemailerAdapterMock).toHaveBeenCalled();
    const call = ingestDeliveryMock.mock.calls[0];
    expect(call[0]).toBe("enginemailer");
    expect(call[3]).toBe("raw-webhook-payload");
  });

  it("returns 401 when the signature is rejected", async () => {
    ingestDeliveryMock.mockResolvedValue({ accepted: false, duplicate: false, count: 0 });
    const res = await enginemailerPost(rawWebhookRequest("/api/v1/webhooks/enginemailer"));
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Invalid webhook signature" });
  });

  it("returns 500 when ingestion throws", async () => {
    ingestDeliveryMock.mockRejectedValue(new Error("boom"));
    const res = await enginemailerPost(rawWebhookRequest("/api/v1/webhooks/enginemailer"));
    const { status, body } = await readJson(res);
    expect(status).toBe(500);
    expect(body.error).toBe("Webhook processing failed");
    expect(typeof body.requestId).toBe("string");
  });
});

describe("POST /api/v1/webhooks/resend", () => {
  it("accepts a valid delivery webhook and returns counts", async () => {
    const res = await resendPost(rawWebhookRequest("/api/v1/webhooks/resend"));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, accepted: 3, duplicate: false });
    expect(ResendAdapterMock).toHaveBeenCalled();
    const call = ingestDeliveryMock.mock.calls[0];
    expect(call[0]).toBe("resend");
    expect(call[3]).toBe("raw-webhook-payload");
  });

  it("returns 401 when the signature is rejected", async () => {
    ingestDeliveryMock.mockResolvedValue({ accepted: false, duplicate: false, count: 0 });
    const res = await resendPost(rawWebhookRequest("/api/v1/webhooks/resend"));
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Invalid webhook signature" });
  });

  it("returns 500 when ingestion throws", async () => {
    ingestDeliveryMock.mockRejectedValue(new Error("boom"));
    const res = await resendPost(rawWebhookRequest("/api/v1/webhooks/resend"));
    const { status, body } = await readJson(res);
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Webhook processing failed" });
  });
});

describe("POST /api/v1/webhooks/twilio", () => {
  it("accepts a valid delivery webhook and returns counts", async () => {
    const res = await twilioPost(rawWebhookRequest("/api/v1/webhooks/twilio"));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, accepted: 3, duplicate: false });
    expect(TwilioAdapterMock).toHaveBeenCalled();
    const call = ingestDeliveryMock.mock.calls[0];
    expect(call[0]).toBe("twilio");
    expect(call[3]).toBe("raw-webhook-payload");
  });

  it("returns 401 when the signature is rejected", async () => {
    ingestDeliveryMock.mockResolvedValue({ accepted: false, duplicate: false, count: 0 });
    const res = await twilioPost(rawWebhookRequest("/api/v1/webhooks/twilio"));
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Invalid webhook signature" });
  });

  it("returns 500 when ingestion throws", async () => {
    ingestDeliveryMock.mockRejectedValue(new Error("boom"));
    const res = await twilioPost(rawWebhookRequest("/api/v1/webhooks/twilio"));
    const { status, body } = await readJson(res);
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Webhook processing failed" });
  });
});

describe("POST /api/v1/webhooks/twilio/inbound", () => {
  it("accepts a valid inbound webhook and returns counts", async () => {
    const res = await twilioInboundPost(rawWebhookRequest("/api/v1/webhooks/twilio/inbound"));
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, accepted: 1, duplicate: false });
    expect(TwilioAdapterMock).toHaveBeenCalled();
    const call = ingestInboundMock.mock.calls[0];
    expect(call[0]).toBe("twilio");
    expect(call[3]).toBe("raw-webhook-payload");
  });

  it("returns 401 when the signature is rejected", async () => {
    ingestInboundMock.mockResolvedValue({ accepted: false, duplicate: false, count: 0 });
    const res = await twilioInboundPost(rawWebhookRequest("/api/v1/webhooks/twilio/inbound"));
    const { status, body } = await readJson(res);
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Invalid webhook signature" });
  });

  it("returns 500 when ingestion throws", async () => {
    ingestInboundMock.mockRejectedValue(new Error("boom"));
    const res = await twilioInboundPost(rawWebhookRequest("/api/v1/webhooks/twilio/inbound"));
    const { status, body } = await readJson(res);
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Webhook processing failed" });
  });
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when the stripe signature header is missing", async () => {
    const res = await stripePost(makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Missing Stripe signature");
  });

  it("returns 400 when signature verification throws", async () => {
    mockStripeConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Webhook error");
  });

  it("reconciles an invoice.paid event and returns received", async () => {
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockStripeConstructEvent).toHaveBeenCalledWith("{}", "sig", "whsec_test_123");
    expect(reconcileBillingMock).toHaveBeenCalled();
  });

  it("returns billing:true when the billing reconciler handles the event", async () => {
    reconcileBillingMock.mockResolvedValue(true);
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, billing: true });
  });

  it("reconciles a checkout.session.completed event", async () => {
    mockStripeConstructEvent.mockReturnValue(stripeEvent("checkout.session.completed", checkoutSessionObject()));
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it("ignores unsupported event types", async () => {
    mockStripeConstructEvent.mockReturnValue(stripeEvent("customer.created", {}));
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, ignored: "unsupported_event_type" });
  });

  it("returns duplicate:true when the event was already recorded", async () => {
    const from = jest
      .fn()
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { code: "23505" } }))
      .mockReturnValueOnce(makeQueryBuilder({ data: { status: "processed" }, error: null }))
      .mockReturnValue(makeQueryBuilder());
    createAdminMock.mockReturnValue({ from, rpc: jest.fn(), auth: { getUser: jest.fn() } });
    const res = await stripePost(
      makeRequest("/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
  });
});

function directAdmin() {
  return makeSupabaseClient({
    workspace_settings: { data: { operational_settings: { stripe_payment_mode: "direct" } }, error: null },
    webhook_events: { data: null, error: null },
    payments: { data: { id: PAYMENT_ID, metadata: {} }, error: null },
  });
}

describe("POST /api/webhooks/stripe/direct/[workspaceId]", () => {
  beforeEach(() => {
    createAdminMock.mockReturnValue(directAdmin());
  });

  function directRequest(headers: Record<string, string> = {}) {
    return stripeDirectPost(
      makeRequest(`/api/webhooks/stripe/direct/${WS_ID}`, { method: "POST", body: "{}", headers }),
      contextWithParams({ workspaceId: WS_ID }),
    );
  }

  it("returns 400 when the stripe signature header is missing", async () => {
    const res = await directRequest();
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Missing Stripe signature");
  });

  it("rejects when the workspace is not in direct stripe mode", async () => {
    stripePaymentModeMock.mockReturnValue("platform");
    await expect(directRequest({ "stripe-signature": "sig" })).rejects.toThrow(
      "not configured for direct Stripe mode",
    );
  });

  it("rejects when the direct webhook secret is not configured", async () => {
    directWebhookSecretMock.mockReturnValue(null);
    await expect(directRequest({ "stripe-signature": "sig" })).rejects.toThrow(
      "Direct Stripe webhook secret is not configured",
    );
  });

  it("reconciles an invoice.paid event and returns handled:true", async () => {
    const res = await directRequest({ "stripe-signature": "sig" });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, handled: true });
    expect(mockDirectConstructEvent).toHaveBeenCalledWith("{}", "sig", "whsec_direct_1");
  });

  it("reconciles a checkout.session.completed event", async () => {
    mockDirectConstructEvent.mockReturnValue(stripeEvent("checkout.session.completed", checkoutSessionObject()));
    const res = await directRequest({ "stripe-signature": "sig" });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, handled: true });
  });

  it("ignores unsupported event types", async () => {
    mockDirectConstructEvent.mockReturnValue(stripeEvent("customer.created", {}));
    const res = await directRequest({ "stripe-signature": "sig" });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, handled: false });
  });

  it("returns duplicate:true when the event row already exists", async () => {
    createAdminMock.mockReturnValue(
      makeSupabaseClient({
        workspace_settings: { data: { operational_settings: { stripe_payment_mode: "direct" } }, error: null },
        webhook_events: { data: null, error: { code: "23505" } },
        payments: { data: { id: PAYMENT_ID, metadata: {} }, error: null },
      }),
    );
    const res = await directRequest({ "stripe-signature": "sig" });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
  });
});
