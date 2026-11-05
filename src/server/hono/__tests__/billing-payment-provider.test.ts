/**
 * Grey-box tests for GET /v1/billing/payment-provider (Settings → Payments &
 * Tax provider card).
 *
 * The Stripe status must derive from the SAME execution state that charges
 * cards (resolveStripeWorkspaceExecution over
 * workspace_settings.operational_settings), never from provider_connections:
 * that record is written only by the connect edge function, so a workspace
 * whose charges succeed rendered "Not connected" whenever the connect flow
 * had never run. These tests pin the one-source-of-truth behavior.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  quotePaymentEventsFactory as mockQuotePaymentEventsFactory,
  stripeInvoiceSyncFactory as mockStripeInvoiceSyncFactory,
  stripeWorkspaceExecutionFactory as mockStripeWorkspaceExecutionFactory,
  workspaceBillingFactory as mockWorkspaceBillingFactory,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () => mockMakeSupabaseLibMock());
jest.mock("@/server/billing/workspace-billing", () =>
  mockWorkspaceBillingFactory(),
);
jest.mock("@/server/messaging/quote-payment-events", () =>
  mockQuotePaymentEventsFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/payments/stripe-workspace-execution", () =>
  mockStripeWorkspaceExecutionFactory(),
);

import { billingRouter as billingRouterRaw } from "@/server/hono/routes/billing";
import { testRouter } from "../test-support/routerTest";
import { db, resetHarness, WS_ID } from "../test-support/state";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

const billingRouter = testRouter(billingRouterRaw);

type MockFn = {
  mockReturnValue: (value: unknown) => void;
  mockImplementation: (fn: () => unknown) => void;
};
const mockResolveExecution =
  resolveStripeWorkspaceExecution as unknown as MockFn;

function seedMembershipAndSettings(operationalSettings: unknown) {
  db["workspace_members"] = {
    data: [
      { workspace_id: WS_ID, is_active: true, workspaces: { is_active: true } },
    ],
    error: null,
  };
  db["workspace_settings:single"] = {
    data: {
      payment_provider: "stripe",
      operational_settings: operationalSettings,
    },
    error: null,
  };
}

beforeEach(() => {
  resetHarness();
  db["provider_connections"] = { data: [], error: null };
});

describe("GET /v1/billing/payment-provider — Stripe truth", () => {
  it("reports connected from execution state with NO provider_connections row (the split-brain case)", async () => {
    seedMembershipAndSettings({
      stripe_payment_mode: "connect",
      stripe_account_id: "acct_connected_1",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_complete: true,
    });
    // No provider_connections rows at all — the production MOMS shape.
    db["provider_connections"] = { data: [], error: null };
    mockResolveExecution.mockReturnValue({
      mode: "connect",
      accountId: "acct_connected_1",
      stripe: {},
    });

    const res = await billingRouter.request("/v1/billing/payment-provider");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.provider).toBe("stripe");
    expect(body.data.stripeStatus).toEqual({
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      accountId: "acct_connected_1",
    });
  });

  it("reports NOT connected when execution cannot resolve, even with a stale connected provider_connections row", async () => {
    seedMembershipAndSettings({});
    db["provider_connections"] = {
      data: [
        {
          provider: "stripe",
          status: "connected",
          external_account_id: "acct_stale_1",
          metadata: {
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
          },
          last_synced_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    mockResolveExecution.mockImplementation(() => {
      throw new Error("Workspace Stripe Connect account is not configured.");
    });

    const res = await billingRouter.request("/v1/billing/payment-provider");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stripeStatus.connected).toBe(false);
    expect(body.data.stripeStatus.chargesEnabled).toBe(false);
    expect(body.data.stripeStatus.accountId).toBeUndefined();
  });

  it("reads direct-mode flags from the stripe_direct_* execution cache", async () => {
    seedMembershipAndSettings({
      stripe_payment_mode: "direct",
      stripe_direct_account_id: "acct_direct_1",
      stripe_direct_charges_enabled: true,
      stripe_direct_payouts_enabled: false,
      stripe_direct_details_submitted: true,
      // Connect-mode flags must be ignored in direct mode.
      stripe_charges_enabled: false,
      stripe_payouts_enabled: true,
      stripe_onboarding_complete: false,
    });
    mockResolveExecution.mockReturnValue({
      mode: "direct",
      accountId: "acct_direct_1",
      stripe: {},
    });

    const res = await billingRouter.request("/v1/billing/payment-provider");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stripeStatus).toEqual({
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      accountId: "acct_direct_1",
    });
  });

  it("keeps Square status on its connection record (unchanged)", async () => {
    seedMembershipAndSettings({ square_charges_enabled: true });
    db["provider_connections"] = {
      data: [
        {
          provider: "square",
          status: "connected",
          external_account_id: "sq-merchant-1",
          metadata: { location_id: "sq-loc-1" },
          last_synced_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      error: null,
    };
    mockResolveExecution.mockImplementation(() => {
      throw new Error("Workspace Stripe Connect account is not configured.");
    });

    const res = await billingRouter.request("/v1/billing/payment-provider");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stripeStatus.connected).toBe(false);
    expect(body.data.squareStatus.connected).toBe(true);
    expect(body.data.squareStatus.merchantId).toBe("sq-merchant-1");
    expect(body.data.squareStatus.locationId).toBe("sq-loc-1");
  });
});
