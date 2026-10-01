jest.mock("@/server/messaging/lifecycle-sender", () => ({
  enqueueLifecycleEmail: jest.fn(),
}));

import { enqueueLifecycleEmail } from "@/server/messaging/lifecycle-sender";
import {
  dispatchLifecycleEvent,
  dispatchLifecycleEvents,
  LIFECYCLE_EVENT_CATALOG,
  LIFECYCLE_EVENT_KEYS,
  lifecycleEvent,
  type LifecycleEvent,
} from "@/server/messaging/lifecycle-events";

const mockEnqueue = enqueueLifecycleEmail as jest.Mock;

function baseEvent(overrides: Partial<LifecycleEvent> = {}): LifecycleEvent {
  return {
    templateKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
    eventId: "evt-1",
    entityType: "appointment",
    entityId: "appt-1",
    workspaceId: "ws-1",
    recipientEmail: "Customer@Example.com",
    recipientRole: "customer",
    customerId: "cust-1",
    variables: { "customer.first_name": "Jordan" },
    metadata: { source: "unit-test" },
    ...overrides,
  };
}

describe("lifecycleEvent", () => {
  it("builds a typed event payload with the given template key", () => {
    const event = lifecycleEvent(LIFECYCLE_EVENT_KEYS.quoteReady, {
      eventId: "evt-q1",
      workspaceId: "ws-1",
      recipientEmail: "customer@example.com",
      recipientRole: "customer",
      variables: { "customer.first_name": "Jordan" },
    });
    expect(event.templateKey).toBe("quotes_and_service_authorization.your_quote_is_ready");
    expect(event.eventId).toBe("evt-q1");
    expect(event.workspaceId).toBe("ws-1");
    expect(event.recipientRole).toBe("customer");
  });
});

describe("LIFECYCLE_EVENT_CATALOG and LIFECYCLE_EVENT_KEYS", () => {
  it("catalog includes the booking confirmation entry with expected fields", () => {
    const entry = LIFECYCLE_EVENT_CATALOG.find(
      (item) => item.key === "appointment_booking_sequence.booking_confirmation",
    );
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ category: expect.any(String), title: expect.any(String) });
  });

  it("maps friendly key names to template keys", () => {
    expect(LIFECYCLE_EVENT_KEYS.bookingCreated).toBe(
      "appointment_booking_sequence.booking_confirmation",
    );
    expect(LIFECYCLE_EVENT_KEYS.quoteReady).toBe(
      "quotes_and_service_authorization.your_quote_is_ready",
    );
    expect(LIFECYCLE_EVENT_KEYS.paymentReceipt).toBe(
      "invoice_and_payment_sequence.payment_receipt",
    );
    expect(LIFECYCLE_EVENT_KEYS.reminder24Hours).toBe("appointment_reminders.24_hours_before");
  });
});

describe("dispatchLifecycleEvent", () => {
  beforeEach(() => {
    mockEnqueue.mockResolvedValue({ status: "queued", idempotencyKey: "x", messageLogId: "log-1" });
  });

  it("routes the event through the mocked sender with an idempotent key", async () => {
    const result = await dispatchLifecycleEvent(baseEvent());

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const payload = mockEnqueue.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.workspaceId).toBe("ws-1");
    expect(payload.templateKey).toBe("appointment_booking_sequence.booking_confirmation");
    expect(payload.eventId).toBe("evt-1");
    expect(payload.entityType).toBe("appointment");
    expect(payload.entityId).toBe("appt-1");
    expect(payload.recipientEmail).toBe("Customer@Example.com");
    expect(payload.idempotencyKey).toBe(
      "lifecycle:appointment_booking_sequence.booking_confirmation:evt-1:customer@example.com",
    );
    expect((payload.variables as Record<string, unknown>)["email.recipient_role"]).toBe("customer");
    expect((payload.variables as Record<string, unknown>)["customer.first_name"]).toBe("Jordan");
    expect(payload.metadata).toMatchObject({
      lifecycleEventId: "evt-1",
      recipientRole: "customer",
      source: "unit-test",
    });
    expect(result).toEqual({
      templateKey: "appointment_booking_sequence.booking_confirmation",
      eventId: "evt-1",
      recipientRole: "customer",
      providerMessageId: undefined,
      status: "queued",
    });
  });

  it("defaults entityType to platform and entityId to the event id", async () => {
    const event = baseEvent();
    delete event.entityType;
    delete event.entityId;
    await dispatchLifecycleEvent(event);

    const payload = mockEnqueue.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.entityType).toBe("platform");
    expect(payload.entityId).toBe("evt-1");
  });

  it("throws for an unknown template key before contacting the sender", async () => {
    await expect(dispatchLifecycleEvent(baseEvent({ templateKey: "nope.not_real" }))).rejects.toThrow(
      "Unknown lifecycle email template: nope.not_real",
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("dispatchLifecycleEvents", () => {
  beforeEach(() => {
    mockEnqueue.mockResolvedValue({ status: "queued" });
  });

  it("dispatches each event and returns a result per event", async () => {
    const results = await dispatchLifecycleEvents([
      baseEvent({ eventId: "evt-1" }),
      baseEvent({ eventId: "evt-2", templateKey: LIFECYCLE_EVENT_KEYS.quoteReady }),
    ]);

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ eventId: "evt-1", status: "queued" });
    expect(results[1]).toMatchObject({
      eventId: "evt-2",
      templateKey: "quotes_and_service_authorization.your_quote_is_ready",
      status: "queued",
    });
  });

  it("resolves an empty array without contacting the sender", async () => {
    await expect(dispatchLifecycleEvents([])).resolves.toEqual([]);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
