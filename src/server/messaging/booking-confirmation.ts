import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

type AppointmentRow = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

function formatDateTime(value: string, timezone: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  };
}

export async function sendBookingConfirmation(input: {
  appointment: AppointmentRow;
  workspaceName: string;
  workspaceTimezone: string;
  recipientEmail: string;
}) {
  const metadata = input.appointment.metadata ?? {};
  const appointmentDateTime = formatDateTime(input.appointment.starts_at, input.workspaceTimezone);
  const title = String(metadata.title || "Service appointment");
  const guestName = String(metadata.guest_name || "Customer");
  const vehicleInfo = String(metadata.vehicle_info || "Vehicle details not provided");
  const address = String(metadata.service_address || metadata.address || "Address provided by the shop");
  const paymentMethod = String(metadata.payment_method || "Pay at time of service");
  const estimatedCost = Number(metadata.estimated_cost || 0);
  const total = Number.isFinite(estimatedCost)
    ? estimatedCost.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : String(metadata.estimated_cost || "See appointment details");
  const confirmationCode = input.appointment.id.slice(0, 8).toUpperCase();
  const manageUrl = String(metadata.manage_url || "{{appointment.manage_url}}");

  return dispatchLifecycleEvent({
    workspaceId: input.appointment.workspace_id,
    customerId: input.appointment.customer_id,
    recipientEmail: input.recipientEmail,
    recipientRole: "customer",
    templateKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
    eventId: input.appointment.id,
    variables: {
      "business.name": input.workspaceName,
      "business.timezone": input.workspaceTimezone,
      "customer.first_name": guestName.split(/\s+/)[0],
      "customer.full_name": guestName,
      "appointment.service": title,
      "appointment.date": appointmentDateTime.date,
      "appointment.time": appointmentDateTime.time,
      "appointment.address": address,
      "appointment.total": total,
      "appointment.confirmation_code": confirmationCode,
      "appointment.payment_method": paymentMethod,
      "appointment.manage_url": manageUrl,
      "vehicle.year": vehicleInfo,
      "vehicle.make": "",
      "vehicle.model": "",
      "email.primary_action_url": manageUrl,
    },
    metadata: { appointmentId: input.appointment.id },
  });
}
