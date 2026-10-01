jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { reconcileServiceWriterBillingEvent } from "@/server/billing/stripe-billing-reconciliation";

type ReconcileEvent = Parameters<typeof reconcileServiceWriterBillingEvent>[0];
type ReconcileStripeClient = Parameters<typeof reconcileServiceWriterBillingEvent>[1];

const PERIOD_END = 1790000000;

function makeEvent(type: string, object: unknown): ReconcileEvent {
  return { type, data: { object } } as unknown as ReconcileEvent;
}

function makeSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sub_123",
    status: "active",
    customer: "cus_123",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: PERIOD_END }] },
    metadata: {
      service_writer_billing: "true",
      workspace_id: "ws_1",
      plan_tier: "pro",
      billing_interval: "annual",
      payments_addon_active: "true",
      additional_technician_quantity: "2",
    },
    ...overrides,
  };
}

function makeStripe(retrieveResult: unknown) {
  return {
    subscriptions: { retrieve: jest.fn().mockResolvedValue(retrieveResult) },
  } as unknown as ReconcileStripeClient;
}

describe("reconcileServiceWriterBillingEvent", () => {
  const mockUpsert = jest.fn();
  const mockFrom = jest.fn();

  beforeEach(() => {
    mockUpsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue({ from: mockFrom });
  });

  it("ignores unknown event types without touching supabase or stripe", async () => {
    const stripe = makeStripe(makeSubscription());
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("invoice.payment_succeeded", { id: "in_1" }),
      stripe,
    );
    expect(result).toBe(false);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("ignores checkout.session.completed when the billing marker is missing", async () => {
    const stripe = makeStripe(makeSubscription());
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("checkout.session.completed", {
        metadata: {},
        subscription: "sub_123",
      }),
      stripe,
    );
    expect(result).toBe(false);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("throws when checkout completes without a subscription id", async () => {
    const stripe = makeStripe(makeSubscription());
    await expect(
      reconcileServiceWriterBillingEvent(
        makeEvent("checkout.session.completed", {
          metadata: { service_writer_billing: "true" },
          subscription: null,
        }),
        stripe,
      ),
    ).rejects.toThrow("Service Writer billing checkout completed without a subscription ID");
  });

  it("reconciles checkout.session.completed by retrieving the subscription and upserting", async () => {
    const subscription = makeSubscription();
    const stripe = makeStripe(subscription);
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("checkout.session.completed", {
        metadata: { service_writer_billing: "true" },
        subscription: "sub_123",
      }),
      stripe,
    );
    expect(result).toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_123");
    expect(mockFrom).toHaveBeenCalledWith("workspace_billing");
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        workspace_id: "ws_1",
        plan_tier: "pro",
        billing_interval: "annual",
        payments_addon_active: true,
        additional_technician_quantity: 2,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        subscription_status: "active",
        current_period_end: new Date(PERIOD_END * 1000).toISOString(),
        cancel_at_period_end: false,
      },
      { onConflict: "workspace_id" },
    );
  });

  it("accepts the subscription id from an expanded checkout subscription object", async () => {
    const stripe = makeStripe(makeSubscription());
    await reconcileServiceWriterBillingEvent(
      makeEvent("checkout.session.completed", {
        metadata: { service_writer_billing: "true" },
        subscription: { id: "sub_999" },
      }),
      stripe,
    );
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_999");
  });

  it("reconciles customer.subscription.created and updated events", async () => {
    const stripe = makeStripe(null);
    for (const type of ["customer.subscription.created", "customer.subscription.updated"]) {
      const result = await reconcileServiceWriterBillingEvent(makeEvent(type, makeSubscription()), stripe);
      expect(result).toBe(true);
    }
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("downgrades to basic when a subscription is deleted", async () => {
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.deleted", makeSubscription()),
      makeStripe(null),
    );
    expect(result).toBe(true);
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      workspace_id: "ws_1",
      plan_tier: "basic",
      payments_addon_active: false,
      additional_technician_quantity: 0,
      subscription_status: "canceled",
    });
  });

  it("downgrades to basic when a subscription is canceled but not deleted", async () => {
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.updated", makeSubscription({ status: "canceled" })),
      makeStripe(null),
    );
    expect(result).toBe(true);
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      plan_tier: "basic",
      subscription_status: "canceled",
      payments_addon_active: false,
    });
  });

  it("skips upsert when workspace metadata is missing", async () => {
    const subscription = makeSubscription({ metadata: { service_writer_billing: "true" } });
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    expect(result).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("skips upsert when the service writer billing marker is missing", async () => {
    const subscription = makeSubscription({ metadata: { workspace_id: "ws_1" } });
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    expect(result).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("normalizes unknown plan, interval, addon and quantity metadata to safe defaults", async () => {
    const subscription = makeSubscription({
      metadata: {
        service_writer_billing: "true",
        workspace_id: "ws_1",
        plan_tier: "enterprise",
        billing_interval: "weekly",
        payments_addon_active: "nope",
        additional_technician_quantity: "-3",
      },
    });
    const result = await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    expect(result).toBe(true);
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      plan_tier: "basic",
      billing_interval: "monthly",
      payments_addon_active: false,
      additional_technician_quantity: 0,
    });
  });

  it("accepts the fleet plan tier and numeric quantity", async () => {
    const subscription = makeSubscription({
      metadata: {
        service_writer_billing: "true",
        workspace_id: "ws_1",
        plan_tier: "fleet",
        additional_technician_quantity: 4,
      },
    });
    await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ plan_tier: "fleet", additional_technician_quantity: 4 });
  });

  it("reads the customer id from an expanded customer object", async () => {
    const subscription = makeSubscription({ customer: { id: "cus_obj" } });
    await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.stripe_customer_id).toBe("cus_obj");
  });

  it("stores null when the subscription has no customer", async () => {
    const subscription = makeSubscription({ customer: null });
    await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.stripe_customer_id).toBeNull();
  });

  it("reads period end from the top-level field when present", async () => {
    const subscription = makeSubscription({
      current_period_end: PERIOD_END + 100,
      items: { data: [] },
    });
    await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.current_period_end).toBe(new Date((PERIOD_END + 100) * 1000).toISOString());
  });

  it("stores null period end when stripe provides none", async () => {
    const subscription = makeSubscription({ items: { data: [] } });
    await reconcileServiceWriterBillingEvent(
      makeEvent("customer.subscription.created", subscription),
      makeStripe(null),
    );
    const payload = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.current_period_end).toBeNull();
  });

  it("propagates supabase upsert errors", async () => {
    mockUpsert.mockResolvedValueOnce({ error: new Error("upsert failed") });
    await expect(
      reconcileServiceWriterBillingEvent(
        makeEvent("customer.subscription.created", makeSubscription()),
        makeStripe(null),
      ),
    ).rejects.toThrow("upsert failed");
  });
});
