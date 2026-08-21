import { supabase } from "@/integrations/supabase/client";
import { startCheckout, type CheckoutRequest } from "../checkout.command";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

const invoke = supabase.functions.invoke as jest.Mock;

function request(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    tenantId: "provider-1",
    paymentProvider: "stripe",
    serviceCatalogIds: ["oil-service", "tire-service"],
    customerEmail: "customer@example.com",
    customerName: "Customer",
    customerPhone: "555-0100",
    oilPriceAdjustment: 12,
    oilExtraQuarts: 1,
    oilPricePerQuart: 12,
    appointmentData: {
      scheduledDate: "2026-08-20",
      scheduledTime: "10:00",
      dropOffOption: "pickup",
      vehicles: [{ year: "2021", make: "Toyota", model: "Camry" }, { year: "2022", make: "Honda", model: "Civic" }],
      vehicleServiceAssignments: { "vehicle-1": { serviceCatalogIds: ["oil-service"] }, "vehicle-2": { serviceCatalogIds: ["tire-service"] } },
      tireItems: [{ inventoryItemId: "tire-1", quantity: 4 }],
      bookingConfiguration: { version: 1, vehicles: [] },
    },
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
    ...overrides,
  };
}

describe("startCheckout", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails closed for missing tenant, services, and email", async () => {
    expect((await startCheckout(request({ tenantId: "" }))).error?.type).toBe("tenant_not_found");
    expect((await startCheckout(request({ serviceCatalogIds: [] }))).error?.type).toBe("validation_error");
    expect((await startCheckout(request({ customerEmail: "" }))).error?.message).toBe("Email address is required.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("routes Stripe checkout and forwards independent vehicle assignments", async () => {
    invoke.mockResolvedValue({ data: { url: "https://checkout.stripe.test/session", session_id: "cs_1" }, error: null });
    const result = await startCheckout(request());
    expect(result).toEqual({ success: true, redirectUrl: "https://checkout.stripe.test/session", sessionId: "cs_1" });
    expect(invoke).toHaveBeenCalledWith("create-booking-payment", expect.objectContaining({ body: expect.objectContaining({
      service_catalog_ids: ["oil-service", "tire-service"],
      oil_extra_quarts: 1,
      appointment_data: expect.objectContaining({
        hasPickupService: true,
        vehicleServiceAssignments: { "vehicle-1": { serviceCatalogIds: ["oil-service"] }, "vehicle-2": { serviceCatalogIds: ["tire-service"] } },
        tireItems: [{ inventoryItemId: "tire-1", quantity: 4 }],
      }),
    }) }));
  });

  it("routes Square checkout and normalizes provider errors", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { error: "square not configured" } } });
    const result = await startCheckout(request({ paymentProvider: "square" }));
    expect(invoke).toHaveBeenCalledWith("create-square-payment", expect.anything());
    expect(result.error?.type).toBe("payment_provider_not_enabled");
  });

  it("normalizes rate-limit and missing-url responses", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "rate_limit retry_after: 42" } });
    expect((await startCheckout(request())).error).toMatchObject({ type: "rate_limited", retryAfter: 42 });
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    expect((await startCheckout(request())).error?.type).toBe("unknown");
  });
});
