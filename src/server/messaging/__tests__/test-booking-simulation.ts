import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";

export async function testCustomerBookingFlow() {
  const mockAppointment = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    workspace_id: "w1234567-89ab-cdef-0123-456789abcdef",
    customer_id: "c1234567-89ab-cdef-0123-456789abcdef",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    status: "confirmed",
    notes: "Customer booking for Tyreese Burton (momspubilc@gmail.com, 215-666-6668)",
    metadata: {
      title: "Oil Change & Inspection",
      guest_name: "Tyreese Burton",
      guest_email: "momspubilc@gmail.com",
      guest_phone: "215-666-6668",
      vehicle_info: "2020 Honda Civic",
      estimated_cost: 89.99,
    },
  };

  const result = await sendBookingConfirmation({
    appointment: mockAppointment,
    workspaceName: "Service Writer Shop",
    workspaceTimezone: "America/New_York",
    recipientEmail: "momspubilc@gmail.com",
    actionUrl: "https://servicewriter.app/booking/confirmation",
  });

  return result;
}
