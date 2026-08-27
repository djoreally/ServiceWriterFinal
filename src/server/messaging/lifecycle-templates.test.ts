import {
  getLifecycleTemplate,
  LIFECYCLE_TEMPLATES,
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
      "customer.first_name": "Jordan",
      "customer.full_name": "Jordan Lee",
      "appointment.service": "Mobile oil change",
      "appointment.date": "Friday, August 28, 2026",
      "appointment.time": "10:00 AM",
      "appointment.address": "123 Market Street, Philadelphia, PA",
      "appointment.total": "$89.00",
      "appointment.confirmation_code": "ABC12345",
      "appointment.payment_method": "Pay at time of service",
      "vehicle.description": "2019 Honda Civic",
      "email.recipient_role": "customer",
      "email.primary_action_url": "https://example.com/appointments/ABC12345",
    });

    expect(result.subject).toBe("Your appointment with MOMS Mobile Oil Change is confirmed");
    expect(result.body).toContain("Hello Jordan,");
    expect(result.body).toContain("has reserved your appointment");
    expect(result.text).toContain("Manage appointment: https://example.com/appointments/ABC12345");
    expect(result.text).toContain("Powered by Service Writer.");
    expect(result.html).toContain("<html lang=\"en\">");
    expect(result.html).toContain("MOMS Mobile Oil Change");
    expect(result.html).toContain("Powered by Service Writer");
    expect(result.html).toContain("Manage appointment");
    expect(result.html).not.toContain("open your Service Writer workspace");
    expect(result.html.match(/<p style=/g)?.length).toBeGreaterThan(2);
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
      "vehicle.description": "2019 Honda Civic",
      "email.primary_action_url": "https://example.com/appointment",
    })).toThrow(/missing required variables/);
  });

  it("covers every authored email with resolvable variables and HTML/text alternatives", () => {
    for (const template of Object.values(LIFECYCLE_TEMPLATES)) {
      expect(template.body.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(10);
      const source = [template.subject, template.preview, template.headline, template.body, template.essentialInformation].join("\n");
      const paths = [...source.matchAll(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g)].map((match) => match[1]);
      const variables = Object.fromEntries([...new Set([...paths, "email.primary_action_url", "email.preferences_url"])].map((path) => [path, "https://example.com/verified-value"]));
      const rendered = renderLifecycleEmail(template.key, variables);
      expect(rendered.subject).not.toMatch(/{{/);
      expect(rendered.body).not.toMatch(/{{/);
      expect(rendered.html).not.toMatch(/{{/);
    }
  });

  it("separates customer quote receipts from staff action alerts", () => {
    expect(getLifecycleTemplate("quotes_and_service_authorization.quote_approved").body).toContain("We recorded your approval");
    expect(getLifecycleTemplate("quotes_and_service_authorization.quote_approved_staff").body).toContain("approved the quoted work");
    expect(getLifecycleTemplate("quotes_and_service_authorization.quote_declined").body).toContain("We recorded your decision");
    expect(getLifecycleTemplate("quotes_and_service_authorization.quote_declined_staff").body).toContain("declined the quoted work");
  });

  it("requires a preferences link for consent-gated marketing email", () => {
    const variables = {
      "business.name": "MOMS Mobile Oil Change",
      "appointment.confirmation_code": "ABC12345",
      "email.primary_action_url": "https://example.com/review",
    };
    expect(() => renderLifecycleEmail("service_completion_and_follow_up.review_and_satisfaction_request", variables)).toThrow(/email.preferences_url/);
    const rendered = renderLifecycleEmail("service_completion_and_follow_up.review_and_satisfaction_request", {
      ...variables,
      "email.preferences_url": "https://example.com/messaging-preferences",
    });
    expect(rendered.purpose).toBe("marketing");
    expect(rendered.text).toContain("Manage email preferences or unsubscribe");
    expect(rendered.html).toContain("Manage email preferences or unsubscribe");
  });

  it("rejects unknown lifecycle keys", () => {
    expect(() => getLifecycleTemplate("missing.template")).toThrow("Unknown lifecycle email template");
  });
});
