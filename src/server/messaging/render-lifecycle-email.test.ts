import { appointmentLifecycleVariables } from "@/server/messaging/appointment-events";
import { renderLifecycleEmailForDelivery } from "@/server/messaging/render-lifecycle-email";

describe("renderLifecycleEmailForDelivery", () => {
  it("renders technician job assignments as concise operational dispatch emails", () => {
    const result = renderLifecycleEmailForDelivery("appointment_booking_sequence.new_job_assigned", {
      "business.name": "MOMS Mobile Oil Change",
      "business.timezone": "America/New_York",
      "customer.first_name": "Jessica",
      "customer.full_name": "Jessica Lee",
      "appointment.service": "Full Synthetic Oil Change",
      "appointment.date": "9/9/2026",
      "appointment.time": "9:00 AM",
      "appointment.address": "123 Main Street, Ambler, PA",
      "technician.name": "Edward Smith",
      "vehicle.description": "2020 BMW X2",
      "email.primary_action_url": "https://servicewriter.xyz/appointments/abc",
    });

    expect(result.subject).toContain("Jessica Lee");
    expect(result.body).toContain("Hi Edward,");
    expect(result.body).not.toContain("Hello Jessica");
    expect(result.body).toContain("Customer: Jessica Lee");
    expect(result.body).toContain("Vehicle: 2020 BMW X2");
    expect(result.body).toContain("Date: 9/9/2026");
    expect(result.body).toContain("Location: 123 Main Street, Ambler, PA");
    expect(result.body).not.toContain("This message concerns your appointment");
    expect(result.body).not.toContain("Please review it carefully");
    expect(result.body).not.toContain("America/New_York");
    expect(result.text).toContain("View assigned job: https://servicewriter.xyz/appointments/abc");
    expect(result.html).toContain("Technician dispatch");
    expect(result.html).toContain("View assigned job");
  });

  it("replaces generic boilerplate for non-marketing lifecycle delivery", () => {
    const result = renderLifecycleEmailForDelivery("new_platform_subscriber_sequence.welcome_to_service_writer", {
      "business.name": "MOMS Mobile Oil Change",
      "workspace.name": "MOMS Mobile Oil Change",
      "email.recipient_role": "staff",
      "email.primary_action_url": "https://servicewriter.xyz/dashboard",
    });

    expect(result.body).not.toContain("This message concerns");
    expect(result.body).not.toContain("Please review it carefully");
    expect(result.body).not.toContain("This message is part of the service record");
    expect(result.body).not.toContain("Thank you for your attention to this update");
    expect(result.body).toContain("Workspace: MOMS Mobile Oil Change");
    expect(result.text).toContain("Open dashboard: https://servicewriter.xyz/dashboard");
    expect(result.html).toContain("Powered by Service Writer");
  });

  it("formats appointment lifecycle dates as M/D/YYYY in the workspace timezone", () => {
    const variables = appointmentLifecycleVariables({
      appointment: {
        id: "12345678-1234-4234-9234-123456789012",
        workspace_id: "12345678-1234-4234-9234-123456789012",
        starts_at: "2026-09-09T13:00:00.000Z",
        customers: { first_name: "Jessica", last_name: "Lee", email: "jessica@example.com" },
        vehicles: { year: 2020, make: "BMW", model: "X2" },
        metadata: { service_name: "Full Synthetic Oil Change", service_address: "123 Main Street" },
      },
      workspaceName: "MOMS Mobile Oil Change",
      workspaceTimezone: "America/New_York",
      actionUrl: "https://servicewriter.xyz/appointments/abc",
      technicianName: "Edward Smith",
    });

    expect(variables["appointment.date"]).toBe("9/9/2026");
    expect(variables["appointment.time"]).toBe("9:00 AM");
  });
  it("renders enriched multi-vehicle appointment lifecycle details without unresolved placeholders", () => {
    const shared = {
      "business.name": "MOMS Mobile Oil Change",
      "business.timezone": "America/New_York",
      "customer.first_name": "Jordan",
      "customer.full_name": "Jordan Lee",
      "appointment.service": "Oil Change, Tire Rotation",
      "appointment.services": "Oil Change × 1 — $99.99, Tire Rotation × 1 — $50.00",
      "appointment.vehicles": "2021 Cadillac XT5, 2024 GMC Sierra 2500",
      "appointment.date": "9/18/2026",
      "appointment.time": "10:00 AM",
      "appointment.address": "500 New Service Rd, Ambler, PA",
      "appointment.total": "$149.99",
      "appointment.confirmation_code": "ABC12345",
      "appointment.payment_method": "Pay at service",
      "appointment.changed_fields": "starts_at, location_address",
      "appointment.manage_url": "https://servicewriter.xyz/my-bookings",
      "technician.name": "Edward Smith",
      "vehicle.year": "2021",
      "vehicle.make": "Cadillac",
      "vehicle.model": "XT5",
      "vehicle.description": "2021 Cadillac XT5",
      "invoice.number": "INV-1042",
      "invoice.total": "$149.99",
      "invoice.status": "issued",
      "email.recipient_role": "customer",
      "email.primary_action_url": "https://servicewriter.xyz/my-bookings",
    };

    for (const key of [
      "appointment_booking_sequence.appointment_rescheduled",
      "appointment_booking_sequence.appointment_cancelled",
      "appointment_booking_sequence.technician_assigned",
      "technician_and_live_service_sequence.technician_en_route",
      "technician_and_live_service_sequence.technician_arrived",
      "technician_and_live_service_sequence.service_completed",
    ]) {
      const rendered = renderLifecycleEmailForDelivery(key, shared);
      expect(rendered.text).not.toMatch(/{{/);
      expect(rendered.html).not.toMatch(/{{/);
      expect(rendered.text).toContain("2021 Cadillac XT5, 2024 GMC Sierra 2500");
      expect(rendered.text).toContain("500 New Service Rd, Ambler, PA");
    }

    const completed = renderLifecycleEmailForDelivery("technician_and_live_service_sequence.service_completed", shared);
    expect(completed.text).toContain("INV-1042");
    expect(completed.text).toContain("$149.99");
    expect(completed.text).toContain("issued");
  });

});
