import {
  getLifecycleTemplate,
  LIFECYCLE_TEMPLATE_COUNT,
  renderLifecycleEmail,
} from "@/server/messaging/lifecycle-templates";
import { LIFECYCLE_EVENT_CATALOG } from "@/server/messaging/lifecycle-events";

describe("Service Writer lifecycle template registry", () => {
  it("contains the complete lifecycle set", () => {
    expect(LIFECYCLE_TEMPLATE_COUNT).toBe(175);
    expect(LIFECYCLE_EVENT_CATALOG).toHaveLength(175);
    expect(new Set(LIFECYCLE_EVENT_CATALOG.map((event) => event.key)).size).toBe(175);
    expect(getLifecycleTemplate("appointment_booking_sequence.booking_confirmation").title).toBe("Booking confirmation");
    expect(getLifecycleTemplate("invoice_and_payment_sequence.payment_receipt").title).toBe("Payment receipt");
  });

  it("renders subject, body, details, CTA, and text fallback from variables", () => {
    const result = renderLifecycleEmail("appointment_booking_sequence.booking_confirmation", {
      "business.name": "MOMS Mobile Oil Change",
      "business.timezone": "America/New_York",
      "business.phone": "215-555-0100",
      "business.email": "hello@example.com",
      "customer.full_name": "Jordan Lee",
      "appointment.service": "Mobile oil change",
      "appointment.date": "Friday, August 28, 2026",
      "appointment.time": "10:00 AM",
      "appointment.address": "123 Market Street, Philadelphia, PA",
      "appointment.total": "$89.00",
      "appointment.confirmation_code": "ABC12345",
      "vehicle.year": "2019",
      "vehicle.make": "Honda",
      "vehicle.model": "Civic",
      "email.primary_action_url": "https://example.com/appointments/ABC12345",
    });

    expect(result.subject).toBe("Your appointment with MOMS Mobile Oil Change is confirmed");
    expect(result.body).toContain("Your service appointment is confirmed.");
    expect(result.text).toContain("View appointment: https://example.com/appointments/ABC12345");
    expect(result.text).toContain("Powered by Service Writer.");
    expect(result.html).toContain("<html lang=\"en\">");
    expect(result.html).toContain("View appointment");
  });

  it("rejects unresolved variables before delivery", () => {
    expect(() => renderLifecycleEmail("appointment_booking_sequence.booking_confirmation", {
      "business.name": "Service Writer",
      "business.timezone": "UTC",
      "customer.full_name": "Jordan Lee",
      "appointment.service": "Service",
      "appointment.date": "Friday",
      "appointment.time": "10:00 AM",
      "appointment.address": "123 Main Street",
      "appointment.total": "$89.00",
      "appointment.confirmation_code": "ABC12345",
      "vehicle.year": "2019",
      "vehicle.make": "Honda",
      "email.primary_action_url": "https://example.com/appointment",
    })).toThrow(/missing required variables/);
  });

  it("rejects unknown lifecycle keys", () => {
    expect(() => getLifecycleTemplate("missing.template")).toThrow("Unknown lifecycle email template");
  });
});
