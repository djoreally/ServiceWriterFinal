import { renderLifecycleEmailForDelivery } from "@/server/messaging/render-lifecycle-email";

describe("renderLifecycleEmailForDelivery", () => {
  it("renders technician job assignments as concise operational dispatch emails", () => {
    const result = renderLifecycleEmailForDelivery("appointment_booking_sequence.new_job_assigned", {
      "business.name": "MOMS Mobile Oil Change",
      "business.timezone": "America/New_York",
      "customer.first_name": "Jessica",
      "customer.full_name": "Jessica Lee",
      "appointment.service": "Full Synthetic Oil Change",
      "appointment.date": "Wednesday, September 9, 2026",
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
    expect(result.body).toContain("Location: 123 Main Street, Ambler, PA");
    expect(result.body).not.toContain("This message concerns your appointment");
    expect(result.body).not.toContain("Please review it carefully");
    expect(result.text).toContain("View assigned job: https://servicewriter.xyz/appointments/abc");
    expect(result.html).toContain("Technician dispatch");
    expect(result.html).toContain("View assigned job");
  });
});
