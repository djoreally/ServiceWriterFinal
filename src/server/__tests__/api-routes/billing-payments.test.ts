import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/billing/workspace-billing", () => ({
  checkoutCatalogKeys: jest.fn(),
  ensureWorkspaceBilling: jest.fn(),
  getCatalogPrice: jest.fn(),
  resolveAuthorizedBillingWorkspace: jest.fn(),
  stripeBillingClient: jest.fn(),
}));
jest.mock("@/server/messaging/quote-payment-events", () => ({
  dispatchPaymentLifecycle: jest.fn(),
  LIFECYCLE_EVENT_KEYS: {
    paymentReceipt: "payment.receipt",
    paymentFailed: "payment.failed",
    paymentRequested: "payment.requested",
    refundIssued: "payment.refund_issued",
  },
}));
jest.mock("@/server/payments/stripe-invoice-sync", () => ({
  markStripeInvoicePaidOutOfBand: jest.fn(),
  syncCanonicalInvoiceToStripe: jest.fn(),
}));
jest.mock("@/server/payments/stripe-workspace-execution", () => ({
  resolveStripeWorkspaceExecution: jest.fn(),
  encryptPaymentCredential: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
const mockStripeCtor = jest.fn();
jest.mock("stripe", () => mockStripeCtor);

import * as api from "@/server/api";
import * as workspaceBilling from "@/server/billing/workspace-billing";
import { dispatchPaymentLifecycle } from "@/server/messaging/quote-payment-events";
import {
  markStripeInvoicePaidOutOfBand,
  syncCanonicalInvoiceToStripe,
} from "@/server/payments/stripe-invoice-sync";
import {
  encryptPaymentCredential,
  resolveStripeWorkspaceExecution,
} from "@/server/payments/stripe-workspace-execution";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { POST as checkoutPost } from "../../../../app/api/v1/billing/checkout/route";
import { POST as portalPost } from "../../../../app/api/v1/billing/portal/route";
import { POST as seatsPost } from "../../../../app/api/v1/billing/seats/route";
import { GET as subscriptionGet } from "../../../../app/api/v1/billing/subscription/route";
import { GET as paymentsGet, POST as paymentsPost } from "../../../../app/api/v1/payments/route";
import {
  DELETE as paymentDelete,
  GET as paymentGet,
  PATCH as paymentPatch,
} from "../../../../app/api/v1/payments/[id]/route";
import { POST as paymentActionsPost } from "../../../../app/api/v1/payments/actions/route";
import {
  DELETE as stripeDirectDelete,
  GET as stripeDirectGet,
  PUT as stripeDirectPut,
} from "../../../../app/api/v1/payments/stripe-direct/route";
import {
  WS_ID,
  USER_ID,
  TEST_USER,
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const { ApiError } = jest.requireActual("@/server/api") as typeof import("@/server/api");

const PAYMENT_ID = "44444444-4444-4444-8444-444444444444";
const INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

function authReject(status = 401, code = "unauthenticated") {
  (workspaceBilling.resolveAuthorizedBillingWorkspace as jest.Mock).mockRejectedValue(
    new ApiError(status, "Access denied", code),
  );
}

function authResolve(supabase: MockSupabaseClient, workspace = { id: WS_ID, name: "Acme Shop" }) {
  (workspaceBilling.resolveAuthorizedBillingWorkspace as jest.Mock).mockResolvedValue({
    admin: supabase,
    user: TEST_USER,
    workspace,
  });
}

function paymentsAddonReject(status = 402, code = "payments_addon_required") {
  (api.requireWorkspacePaymentsAddon as jest.Mock).mockRejectedValue(
    new ApiError(status, "The Payments add-on is required for this workspace", code),
  );
}

function paymentsAddonResolve(supabase: MockSupabaseClient) {
  (api.requireWorkspacePaymentsAddon as jest.Mock).mockResolvedValue({
    supabase,
    user: TEST_USER,
    billing: { payments_addon_active: true, subscription_status: "active" },
  });
}

function makeStripeBillingClient() {
  return {
    customers: { create: jest.fn().mockResolvedValue({ id: "cus_test123" }) },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: "cs_test123", url: "https://checkout.stripe.com/pay/cs_test123" }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: "bps_test123", url: "https://billing.stripe.com/session/bps_test123" }),
      },
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({ id: "sub_test123", status: "active", items: { data: [] }, metadata: {} }),
      update: jest.fn().mockResolvedValue({ id: "sub_test123", status: "active" }),
    },
  };
}

describe("billing/checkout (POST)", () => {
  let supabase: MockSupabaseClient;
  let stripe: ReturnType<typeof makeStripeBillingClient>;

  beforeEach(() => {
    supabase = makeSupabaseClient();
    stripe = makeStripeBillingClient();
    authResolve(supabase);
    (workspaceBilling.stripeBillingClient as jest.Mock).mockReturnValue(stripe);
  });

  // Grey-box note: this route has no ZodError mapping, so schema validation
  // failures surface as 500 internal_error via errorResponse (only 3 of the
  // 60 v1 routes map ZodError to 400 explicitly).
  it("returns 500 for an invalid plan_tier (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await checkoutPost(makeRequest("/api/v1/billing/checkout", { method: "POST", body: { plan_tier: "ultra" } })),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 401 when billing workspace authorization fails", async () => {
    authReject(401);
    const { status, body } = await readJson(
      await checkoutPost(makeRequest("/api/v1/billing/checkout", { method: "POST", body: { plan_tier: "pro" } })),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns 409 when a subscription already exists", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      stripe_subscription_id: "sub_live",
      subscription_status: "active",
    });
    const { status, body } = await readJson(
      await checkoutPost(makeRequest("/api/v1/billing/checkout", { method: "POST", body: { plan_tier: "pro" } })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("subscription_exists");
  });

  it("returns a free activation when the catalog is empty (basic tier)", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      stripe_subscription_id: null,
      subscription_status: null,
      stripe_customer_id: null,
    });
    (workspaceBilling.checkoutCatalogKeys as jest.Mock).mockReturnValue([]);
    const { status, body } = await readJson(
      await checkoutPost(makeRequest("/api/v1/billing/checkout", { method: "POST", body: { plan_tier: "basic" } })),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ free: true, redirect_url: "/dashboard" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer and checkout session for a paid tier", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      stripe_subscription_id: null,
      subscription_status: null,
      stripe_customer_id: null,
    });
    (workspaceBilling.checkoutCatalogKeys as jest.Mock).mockReturnValue([{ key: "pro_monthly", quantity: 1 }]);
    (workspaceBilling.getCatalogPrice as jest.Mock).mockResolvedValue({ stripe_price_id: "price_pro_monthly" });
    const { status, body } = await readJson(
      await checkoutPost(
        makeRequest("/api/v1/billing/checkout", {
          method: "POST",
          body: { workspace_id: WS_ID, plan_tier: "pro", billing_interval: "monthly" },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      url: "https://checkout.stripe.com/pay/cs_test123",
      session_id: "cs_test123",
      workspace_id: WS_ID,
    });
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing Stripe customer when one is stored", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      stripe_subscription_id: null,
      subscription_status: null,
      stripe_customer_id: "cus_existing",
    });
    (workspaceBilling.checkoutCatalogKeys as jest.Mock).mockReturnValue([{ key: "fleet_annual", quantity: 1 }]);
    (workspaceBilling.getCatalogPrice as jest.Mock).mockResolvedValue({ stripe_price_id: "price_fleet_annual" });
    const { status, body } = await readJson(
      await checkoutPost(
        makeRequest("/api/v1/billing/checkout", {
          method: "POST",
          body: { plan_tier: "fleet", billing_interval: "annual" },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.session_id).toBe("cs_test123");
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe("cus_existing");
  });
});

describe("billing/portal (POST)", () => {
  let supabase: MockSupabaseClient;
  let stripe: ReturnType<typeof makeStripeBillingClient>;

  beforeEach(() => {
    supabase = makeSupabaseClient();
    stripe = makeStripeBillingClient();
    authResolve(supabase);
    (workspaceBilling.stripeBillingClient as jest.Mock).mockReturnValue(stripe);
  });

  it("returns 401 when billing workspace authorization fails", async () => {
    authReject(401);
    const { status, body } = await readJson(
      await portalPost(makeRequest("/api/v1/billing/portal", { method: "POST", body: {} })),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns 409 when no Stripe customer exists yet", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({ stripe_customer_id: null });
    const { status, body } = await readJson(
      await portalPost(makeRequest("/api/v1/billing/portal", { method: "POST", body: {} })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("billing_customer_missing");
  });

  it("creates a billing portal session and returns its URL", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({ stripe_customer_id: "cus_abc" });
    const { status, body } = await readJson(
      await portalPost(makeRequest("/api/v1/billing/portal", { method: "POST", body: { workspace_id: WS_ID } })),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ url: "https://billing.stripe.com/session/bps_test123" });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_abc" }),
    );
  });
});

describe("billing/seats (POST)", () => {
  let supabase: MockSupabaseClient;
  let stripe: ReturnType<typeof makeStripeBillingClient>;

  beforeEach(() => {
    supabase = makeSupabaseClient();
    stripe = makeStripeBillingClient();
    authResolve(supabase);
    (workspaceBilling.stripeBillingClient as jest.Mock).mockReturnValue(stripe);
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      plan_tier: "pro",
      billing_interval: "monthly",
      stripe_subscription_id: "sub_test123",
      subscription_status: "active",
      payments_addon_active: false,
      additional_technician_quantity: 1,
    });
    (workspaceBilling.getCatalogPrice as jest.Mock).mockResolvedValue({ stripe_price_id: "price_seat" });
  });

  const validBody = { workspace_id: WS_ID, additional_technician_quantity: 2 };

  it("returns 500 for a negative quantity (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await seatsPost(makeRequest("/api/v1/billing/seats", { method: "POST", body: { additional_technician_quantity: -1 } })),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 401 when billing workspace authorization fails", async () => {
    authReject(401);
    const { status } = await readJson(
      await seatsPost(makeRequest("/api/v1/billing/seats", { method: "POST", body: validBody })),
    );
    expect(status).toBe(401);
  });

  it("returns 409 when the plan tier does not support seats", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      plan_tier: "basic",
      billing_interval: "monthly",
      stripe_subscription_id: null,
      subscription_status: "active",
      additional_technician_quantity: 0,
    });
    const { status, body } = await readJson(
      await seatsPost(makeRequest("/api/v1/billing/seats", { method: "POST", body: validBody })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("technician_plan_required");
  });

  it("returns 409 when no active Stripe subscription exists", async () => {
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      plan_tier: "pro",
      billing_interval: "monthly",
      stripe_subscription_id: null,
      subscription_status: "active",
      additional_technician_quantity: 0,
    });
    const { status, body } = await readJson(
      await seatsPost(makeRequest("/api/v1/billing/seats", { method: "POST", body: validBody })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("active_subscription_required");
  });

  it("returns unchanged when the quantity already matches", async () => {
    const { status, body } = await readJson(
      await seatsPost(
        makeRequest("/api/v1/billing/seats", {
          method: "POST",
          body: { workspace_id: WS_ID, additional_technician_quantity: 1 },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ workspace_id: WS_ID, additional_technician_quantity: 1, unchanged: true });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("updates the Stripe subscription items for a new seat count", async () => {
    const { status, body } = await readJson(
      await seatsPost(makeRequest("/api/v1/billing/seats", { method: "POST", body: validBody })),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      workspace_id: WS_ID,
      subscription_id: "sub_test123",
      additional_technician_quantity: 2,
      pending_webhook_reconciliation: true,
    });
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test123");
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
    const [, params] = stripe.subscriptions.update.mock.calls[0];
    expect(params.items).toEqual([{ price: "price_seat", quantity: 2 }]);
  });
});

describe("billing/subscription (GET)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient();
    authResolve(supabase);
    (workspaceBilling.ensureWorkspaceBilling as jest.Mock).mockResolvedValue({
      plan_tier: "pro",
      subscription_status: "active",
    });
  });

  it("returns 401 when billing workspace authorization fails", async () => {
    authReject(401);
    const { status, body } = await readJson(
      await subscriptionGet(makeRequest(`/api/v1/billing/subscription?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns the billing record, entitlements and technician usage", async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ entitled_technicians: 5, plan_tier: "pro" }],
      error: null,
    });
    const { status, body } = await readJson(
      await subscriptionGet(makeRequest(`/api/v1/billing/subscription?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.workspace).toMatchObject({ id: WS_ID, name: "Acme Shop" });
    expect(body.billing.plan_tier).toBe("pro");
    expect(body.entitlements).toMatchObject({ entitled_technicians: 5 });
    expect(body.usage).toMatchObject({ technician_count: 0, technicians_remaining: 5 });
  });
});

describe("payments (GET)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      payments: { data: [{ id: PAYMENT_ID, amount: 99.99, status: "succeeded" }], error: null },
    });
    paymentsAddonResolve(supabase);
  });

  it("returns 402 when the payments add-on is not active", async () => {
    paymentsAddonReject(402);
    const { status, body } = await readJson(
      await paymentsGet(makeRequest(`/api/v1/payments?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(402);
    expect(body.error.code).toBe("payments_addon_required");
  });

  it("returns the payment list with pagination", async () => {
    const { status, body } = await readJson(
      await paymentsGet(makeRequest(`/api/v1/payments?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ limit: 25, offset: 0 });
  });
});

describe("payments (POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      invoices: { data: { id: INVOICE_ID, customer_id: CUSTOMER_ID, status: "issued" }, error: null },
      payments: { data: { id: PAYMENT_ID, customer_id: null, status: "pending", metadata: {} }, error: null },
      customers: { data: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "America/New_York" }, error: null },
    });
    paymentsAddonResolve(supabase);
    (dispatchPaymentLifecycle as jest.Mock).mockResolvedValue({ ok: true });
  });

  it("returns 402 when the payments add-on is not active", async () => {
    paymentsAddonReject(402);
    const { status } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: { workspace_id: WS_ID, amount: 10, provider_payment_id: "pi_x" },
        }),
      ),
    );
    expect(status).toBe(402);
  });

  it("returns 500 for an invalid body (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", { method: "POST", body: { workspace_id: WS_ID } }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 422 when no payment provenance is supplied", async () => {
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: { workspace_id: WS_ID, amount: 10 },
        }),
      ),
    );
    expect(status).toBe(422);
    expect(body.error.code).toBe("payment_provenance_required");
  });

  it("returns 409 when the invoice is void", async () => {
    supabase = makeSupabaseClient({
      invoices: { data: { id: INVOICE_ID, customer_id: CUSTOMER_ID, status: "void" }, error: null },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: { workspace_id: WS_ID, amount: 10, invoice_id: INVOICE_ID },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invoice_void");
  });

  it("returns 409 on customer mismatch with the invoice", async () => {
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            amount: 10,
            invoice_id: INVOICE_ID,
            customer_id: "77777777-7777-4777-8777-777777777777",
          },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("customer_mismatch");
  });

  it("creates a payment and returns 201", async () => {
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: { workspace_id: WS_ID, amount: 99.99, provider_payment_id: "pi_test" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(PAYMENT_ID);
    expect(dispatchPaymentLifecycle).not.toHaveBeenCalled();
  });

  it("reuses an existing pending duplicate for the same appointment", async () => {
    supabase = makeSupabaseClient({
      payments: { data: { id: "dup-id", status: "pending" }, error: null },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            amount: 25,
            status: "pending",
            metadata: { appointment_id: "33333333-3333-4333-8333-333333333333" },
          },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    expect(body.data.id).toBe("dup-id");
  });

  it("dispatches the receipt email when a succeeded payment has a customer email", async () => {
    supabase = makeSupabaseClient({
      payments: {
        data: { id: PAYMENT_ID, customer_id: CUSTOMER_ID, status: "succeeded", metadata: {} },
        error: null,
      },
      customers: { data: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    paymentsAddonResolve(supabase);
    const { status } = await readJson(
      await paymentsPost(
        makeRequest("/api/v1/payments", {
          method: "POST",
          body: { workspace_id: WS_ID, amount: 99.99, provider_payment_id: "pi_test", status: "succeeded" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(dispatchPaymentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "payment.receipt", eventId: PAYMENT_ID }),
    );
  });
});

describe("payments/[id] (GET/PATCH/DELETE)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      payments: {
        data: { id: PAYMENT_ID, customer_id: null, status: "pending", metadata: {} },
        error: null,
      },
    });
    paymentsAddonResolve(supabase);
    (dispatchPaymentLifecycle as jest.Mock).mockResolvedValue({ ok: true });
  });

  const path = `/api/v1/payments/${PAYMENT_ID}?workspace_id=${WS_ID}`;

  it("GET returns the payment", async () => {
    const { status, body } = await readJson(await paymentGet(makeRequest(path), contextWithParams({ id: PAYMENT_ID })));
    expect(status).toBe(200);
    expect(body.data.id).toBe(PAYMENT_ID);
  });

  it("GET maps a missing row to 404", async () => {
    supabase = makeSupabaseClient({ payments: { data: null, error: { code: "PGRST116", message: "no rows" } } });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(await paymentGet(makeRequest(path), contextWithParams({ id: PAYMENT_ID })));
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("PATCH returns 500 when no updatable field is supplied (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await paymentPatch(
        makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID } }),
        contextWithParams({ id: PAYMENT_ID }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("PATCH updates the payment and returns 200", async () => {
    const { status, body } = await readJson(
      await paymentPatch(
        makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID, status: "succeeded" } }),
        contextWithParams({ id: PAYMENT_ID }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(PAYMENT_ID);
  });

  it("PATCH returns 409 when linking to a void invoice", async () => {
    supabase = makeSupabaseClient({
      invoices: { data: { id: INVOICE_ID, customer_id: CUSTOMER_ID, status: "void" }, error: null },
      payments: { data: { id: PAYMENT_ID, status: "pending", metadata: {} }, error: null },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentPatch(
        makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID, invoice_id: INVOICE_ID } }),
        contextWithParams({ id: PAYMENT_ID }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invoice_void");
  });

  it("DELETE refuses deletion to protect the audit trail", async () => {
    const { status, body } = await readJson(
      await paymentDelete(makeRequest(path, { method: "DELETE" }), contextWithParams({ id: PAYMENT_ID })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("ledger_record_immutable");
  });

  it("DELETE returns 402 when the payments add-on is not active", async () => {
    paymentsAddonReject(402);
    const { status } = await readJson(
      await paymentDelete(makeRequest(path, { method: "DELETE" }), contextWithParams({ id: PAYMENT_ID })),
    );
    expect(status).toBe(402);
  });
});

describe("payments/actions (POST)", () => {
  let supabase: MockSupabaseClient;
  const baseBody = { action: "refund", workspace_id: WS_ID, payment_id: PAYMENT_ID, amount: 5000 };

  function mockStripeExecution(refundId = "re_test123") {
    const refundsCreate = jest.fn().mockResolvedValue({ id: refundId });
    (resolveStripeWorkspaceExecution as jest.Mock).mockReturnValue({
      stripe: { refunds: { create: refundsCreate } },
      accountId: "acct_test",
      mode: "connect",
      requestOptions: (key?: string) => ({ idempotencyKey: key }),
    });
    return refundsCreate;
  }

  beforeEach(() => {
    supabase = makeSupabaseClient({
      payments: {
        data: {
          id: PAYMENT_ID,
          invoice_id: INVOICE_ID,
          status: "succeeded",
          amount: 100,
          provider: "stripe",
          provider_payment_id: "pi_test123",
          metadata: {},
        },
        error: null,
      },
      workspace_settings: {
        data: { payment_provider: "stripe", operational_settings: {} },
        error: null,
      },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    paymentsAddonResolve(supabase);
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({ supabase, user: TEST_USER });
    (dispatchPaymentLifecycle as jest.Mock).mockResolvedValue({ ok: true });
    (syncCanonicalInvoiceToStripe as jest.Mock).mockResolvedValue({
      provider: "stripe",
      hostedInvoiceUrl: "https://pay.stripe.com/i/test123",
      stripeInvoiceId: "in_test123",
      stripeCustomerId: "cus_test123",
    });
    (markStripeInvoicePaidOutOfBand as jest.Mock).mockResolvedValue({ status: "skipped" });
  });

  it("returns 500 for an unknown action (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "explode", workspace_id: WS_ID },
        }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 410 for send_manual_invoice (moved endpoint)", async () => {
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "send_manual_invoice", workspace_id: WS_ID, invoice_id: INVOICE_ID },
        }),
      ),
    );
    expect(status).toBe(410);
    expect(body.error.code).toBe("invoice_domain_required");
    expect(api.requireWorkspaceMember).toHaveBeenCalled();
  });

  it("refund: creates a Stripe refund and marks the payment refunded", async () => {
    const refundsCreate = mockStripeExecution();
    const { status, body } = await readJson(
      await paymentActionsPost(makeRequest("/api/v1/payments/actions", { method: "POST", body: baseBody })),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ success: true, refund_id: "re_test123", amount_refunded: 5000 });
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_test123", amount: 5000 }),
      expect.anything(),
    );
  });

  it("refund: returns 409 for a non-refundable payment state", async () => {
    supabase = makeSupabaseClient({
      payments: { data: { id: PAYMENT_ID, status: "pending", amount: 100, provider: "stripe", provider_payment_id: "pi_x", metadata: {} }, error: null },
      workspace_settings: { data: { payment_provider: "stripe", operational_settings: {} }, error: null },
    });
    paymentsAddonResolve(supabase);
    mockStripeExecution();
    const { status, body } = await readJson(
      await paymentActionsPost(makeRequest("/api/v1/payments/actions", { method: "POST", body: baseBody })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invalid_payment_state");
  });

  it("refund: returns 409 for a non-Stripe provider payment", async () => {
    supabase = makeSupabaseClient({
      payments: { data: { id: PAYMENT_ID, status: "succeeded", amount: 100, provider: "square", provider_payment_id: "sq_x", metadata: {} }, error: null },
      workspace_settings: { data: { payment_provider: "stripe", operational_settings: {} }, error: null },
    });
    paymentsAddonResolve(supabase);
    mockStripeExecution();
    const { status, body } = await readJson(
      await paymentActionsPost(makeRequest("/api/v1/payments/actions", { method: "POST", body: baseBody })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("stripe_payment_required");
  });

  it("refund: returns 409 when the refund exceeds the remaining balance", async () => {
    mockStripeExecution();
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { ...baseBody, amount: 20000 },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("refund_exceeds_remaining");
  });

  it("manual_payment: records an in-person payment and returns 200", async () => {
    supabase = makeSupabaseClient({
      payments: {
        data: { id: PAYMENT_ID, invoice_id: INVOICE_ID, status: "pending", amount: 100, metadata: {} },
        error: null,
      },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "manual_payment", workspace_id: WS_ID, payment_id: PAYMENT_ID, amount: 10000, payment_method: "cash" },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ success: true, payment_id: PAYMENT_ID });
    expect(markStripeInvoicePaidOutOfBand).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_ID, invoiceId: INVOICE_ID }),
    );
  });

  it("manual_payment: returns 409 when waivers are embedded", async () => {
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "manual_payment", workspace_id: WS_ID, payment_id: PAYMENT_ID, amount: 10000, payment_method: "cash", waive_fees: true },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("adjustment_required");
  });

  it("payment_link: syncs the invoice to Stripe and dispatches the request email", async () => {
    supabase = makeSupabaseClient({
      payments: {
        data: {
          id: PAYMENT_ID,
          workspace_id: WS_ID,
          invoice_id: INVOICE_ID,
          customer_id: CUSTOMER_ID,
          status: "pending",
          amount: 50,
          currency_code: "USD",
          metadata: {},
          customers: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
          invoices: { invoice_number: 1001, total: 50, status: "issued", metadata: {} },
        },
        error: null,
      },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "payment_link", workspace_id: WS_ID, payment_id: PAYMENT_ID },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      url: "https://pay.stripe.com/i/test123",
      email_sent: true,
      payment_id: PAYMENT_ID,
    });
    expect(syncCanonicalInvoiceToStripe).toHaveBeenCalled();
    expect(dispatchPaymentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "payment.requested" }),
    );
  });

  it("payment_link: returns 409 when the payment is already paid", async () => {
    supabase = makeSupabaseClient({
      payments: {
        data: { id: PAYMENT_ID, workspace_id: WS_ID, invoice_id: INVOICE_ID, status: "succeeded", amount: 50, metadata: {} },
        error: null,
      },
    });
    paymentsAddonResolve(supabase);
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "payment_link", workspace_id: WS_ID, payment_id: PAYMENT_ID },
        }),
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("already_paid");
  });

  it("verify_booking returns 501 (not available from this endpoint)", async () => {
    const { status, body } = await readJson(
      await paymentActionsPost(
        makeRequest("/api/v1/payments/actions", {
          method: "POST",
          body: { action: "verify_booking", workspace_id: WS_ID, session_id: "cs_test" },
        }),
      ),
    );
    expect(status).toBe(501);
    expect(body.error.code).toBe("action_not_implemented");
  });
});

describe("payments/stripe-direct (GET/PUT/DELETE)", () => {
  let supabase: MockSupabaseClient;
  let retrieveMock: jest.Mock;

  const settingsRow = {
    payment_provider: "stripe",
    operational_settings: {
      stripe_payment_mode: "direct",
      stripe_direct_account_id: "acct_test123",
      stripe_direct_key_last4: "4242",
      stripe_direct_charges_enabled: true,
      stripe_direct_payouts_enabled: true,
      stripe_direct_details_submitted: true,
      stripe_direct_webhook_secret_encrypted: "enc",
      stripe_direct_checked_at: "2026-01-01T00:00:00.000Z",
    },
  };

  beforeEach(() => {
    supabase = makeSupabaseClient({ workspace_settings: { data: settingsRow, error: null } });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(supabase);
    paymentsAddonResolve(supabase);
    (encryptPaymentCredential as jest.Mock).mockReturnValue("encrypted-secret");
    retrieveMock = jest.fn();
    mockStripeCtor.mockImplementation(() => ({ accounts: { retrieve: retrieveMock } }));
  });

  const path = `/api/v1/payments/stripe-direct?workspace_id=${WS_ID}`;

  it("GET returns 400 when workspace_id is missing", async () => {
    const { status, body } = await readJson(await stripeDirectGet(makeRequest("/api/v1/payments/stripe-direct")));
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_workspace");
  });

  it("GET returns 402 when the payments add-on is not active", async () => {
    paymentsAddonReject(402);
    const { status } = await readJson(await stripeDirectGet(makeRequest(path)));
    expect(status).toBe(402);
  });

  it("GET returns the direct-connection status", async () => {
    const { status, body } = await readJson(await stripeDirectGet(makeRequest(path)));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      mode: "direct",
      configured: true,
      accountId: "acct_test123",
      keyLast4: "4242",
      chargesEnabled: true,
      payoutsEnabled: true,
      webhookConfigured: true,
    });
  });

  it("PUT returns 500 for an invalid body (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await stripeDirectPut(makeRequest("/api/v1/payments/stripe-direct", { method: "PUT", body: { workspace_id: WS_ID } })),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("PUT rejects a secret key that is not a Stripe secret key", async () => {
    const { status, body } = await readJson(
      await stripeDirectPut(
        makeRequest("/api/v1/payments/stripe-direct", {
          method: "PUT",
          body: {
            workspace_id: WS_ID,
            account_id: "acct_test123",
            secret_key: "rk_test_not_a_secret_key_123456",
            webhook_secret: "whsec_test123456",
          },
        }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_stripe_key");
  });

  it("PUT returns 400 when Stripe rejects the credentials", async () => {
    retrieveMock.mockRejectedValue(new Error("Invalid API Key provided"));
    const { status, body } = await readJson(
      await stripeDirectPut(
        makeRequest("/api/v1/payments/stripe-direct", {
          method: "PUT",
          body: {
            workspace_id: WS_ID,
            account_id: "acct_test123",
            secret_key: "sk_test_12345678901234567890",
            webhook_secret: "whsec_test123456",
          },
        }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("stripe_key_rejected");
  });

  it("PUT validates credentials and persists the encrypted configuration", async () => {
    retrieveMock.mockResolvedValue({
      id: "acct_test123",
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
    const { status, body } = await readJson(
      await stripeDirectPut(
        makeRequest("/api/v1/payments/stripe-direct", {
          method: "PUT",
          body: {
            workspace_id: WS_ID,
            account_id: "acct_test123",
            secret_key: "sk_test_12345678901234567890",
            webhook_secret: "whsec_test123456",
          },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ mode: "direct", accountId: "acct_test123", keyLast4: "7890" });
    expect(retrieveMock).toHaveBeenCalledWith("acct_test123");
    expect(encryptPaymentCredential).toHaveBeenCalledTimes(2);
  });

  it("DELETE clears direct credentials and returns connect mode", async () => {
    const { status, body } = await readJson(await stripeDirectDelete(makeRequest(path, { method: "DELETE" })));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ mode: "connect", configured: false, accountId: null });
  });
});
