/**
 * Public booking funnel tracker tests (src/lib/telemetry/public.ts).
 * Fresh module registry per case, `@/lib/api-client` mocked — same
 * pattern as the signed-in client tests.
 */
jest.mock("@/lib/api-client", () => ({
  apiRequest: jest.fn(async () => ({})),
}));

interface ApiClientMock {
  apiRequest: jest.Mock;
}

async function loadPublic() {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const mod = await import("@/lib/telemetry/public");
  const apiClientMock = (await import("@/lib/api-client")) as unknown as ApiClientMock;
  return { mod, apiClientMock };
}

function bodies(apiClientMock: ApiClientMock): Array<Record<string, unknown>> {
  return apiClientMock.apiRequest.mock.calls.map(
    (call) => (call[1] as { body: Record<string, unknown> }).body,
  );
}

describe("booking funnel tracker", () => {
  it("sends nothing before a shop is bound", async () => {
    const { mod, apiClientMock } = await loadPublic();
    mod.trackFunnelStep("service");
    expect(apiClientMock.apiRequest).not.toHaveBeenCalled();
  });

  it("emits an ordered journey under one visitor session, with commerce properties", async () => {
    const { mod, apiClientMock } = await loadPublic();
    mod.initBookingTelemetry({ ownerUserId: "owner-1" });
    mod.trackFunnelStep("address");
    mod.trackServiceSelected("service", [{ id: "svc-1", name: "Full Synthetic", price: 119 }], 119);
    mod.trackPriceShown("service", 119);
    mod.trackTimeSlotSelected("time", { date: "2026-11-14", time: "09:00" });
    mod.trackPaymentViewed("payment", 133.83);
    mod.trackBookingConfirmed({ quote_total: 133.83 });

    const sent = bodies(apiClientMock);
    const funnelEvents = sent.filter((body) => body.event_type !== "pageview");
    expect(funnelEvents.map((body) => body.funnel_step)).toEqual([
      "landing",
      "address",
      "service",
      "service",
      "time",
      "payment",
      "confirmed",
    ]);
    const sessionIds = new Set(sent.map((body) => body.session_id));
    expect(sessionIds.size).toBe(1);
    for (const body of sent) {
      expect(body.owner_user_id).toBe("owner-1");
      expect(typeof body.visitor_id).toBe("string");
    }
    const selected = sent.find((body) => body.event_type === "service_selected");
    expect(selected?.metadata).toMatchObject({
      services: [{ id: "svc-1", name: "Full Synthetic", price: 119 }],
      quote_total: 119,
    });
    const priceShown = sent.find((body) => body.event_type === "price_shown");
    expect(priceShown?.metadata).toMatchObject({ quote_total: 119 });
  });

  it("reports abandonment with last step and journey time on pagehide, unless confirmed", async () => {
    const { mod, apiClientMock } = await loadPublic();
    mod.initBookingTelemetry({ ownerUserId: "owner-1" });
    mod.trackFunnelStep("service");
    apiClientMock.apiRequest.mockClear();

    window.dispatchEvent(new Event("pagehide"));
    const sent = bodies(apiClientMock);
    const abandoned = sent.find((body) => body.event_type === "booking_abandoned");
    expect(abandoned).toBeTruthy();
    expect(abandoned?.funnel_step).toBe("service");
    expect(abandoned?.metadata).toMatchObject({ last_step: "service" });
    expect(typeof (abandoned?.metadata as { journey_elapsed_ms: unknown }).journey_elapsed_ms).toBe("number");
  });
});
