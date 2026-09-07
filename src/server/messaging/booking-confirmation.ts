import { createSupabaseAdminClient } from "@/lib/supabase";
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

type BookingVehicle = {
  year?: string | number;
  make?: string;
  model?: string;
};

type BookingService = {
  name?: string;
  price?: number | string;
  quantity?: number | string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatCurrency(value: unknown): string | null {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : null;
}

function bookingSummary(metadata: Record<string, unknown>) {
  const configuration = asRecord(metadata.booking_configuration);
  const vehicles = Array.isArray(configuration?.vehicles) ? configuration.vehicles : [];
  const vehicle = asRecord(vehicles[0]) ?? null;
  const vehicleDetails = asRecord(vehicle?.vehicle) as BookingVehicle | null;
  const services = Array.isArray(vehicle?.services) ? vehicle.services.map(asRecord).filter(Boolean) as BookingService[] : [];

  const vehicleDescription = vehicleDetails
    ? [vehicleDetails.year, vehicleDetails.make, vehicleDetails.model].filter(Boolean).join(" ")
    : String(metadata.vehicle_info || "Vehicle details not provided");
  const serviceDescription = services.length
    ? services.map((service) => {
        const quantity = Math.max(1, Number(service.quantity) || 1);
        const price = formatCurrency((Number(service.price) || 0) * quantity);
        return `${service.name || "Service"}${quantity > 1 ? ` × ${quantity}` : ""}${price ? ` — ${price}` : ""}`;
      }).join("; ")
    : String(metadata.title || "Service appointment");

  return { vehicleDescription, serviceDescription };
}

export async function sendBookingConfirmation(input: {
  appointment: AppointmentRow;
  workspaceName: string;
  workspaceTimezone: string;
  recipientEmail: string;
  actionUrl: string;
}) {
  const metadata = input.appointment.metadata ?? {};
  const appointmentDateTime = formatDateTime(input.appointment.starts_at, input.workspaceTimezone);
  const guestName = String(metadata.guest_name || "Customer");
  const { vehicleDescription, serviceDescription } = bookingSummary(metadata);
  const address = String(metadata.location_address || metadata.service_address || metadata.address || "Address provided by the shop");
  const paymentMethod = String(metadata.payment_method || "Pay at service");
  const total = formatCurrency(metadata.estimated_cost) ?? String(metadata.estimated_cost || "See appointment details");
  const confirmationCode = typeof metadata.confirmation_code === "string" && metadata.confirmation_code.trim()
    ? metadata.confirmation_code.trim()
    : input.appointment.id.slice(0, 8).toUpperCase();
  const configuredManageUrl = typeof metadata.manage_url === "string" && /^https?:\/\//i.test(metadata.manage_url) ? metadata.manage_url : null;
  const manageUrl = configuredManageUrl ?? input.actionUrl;

  const customerVariables = {
    "business.name": input.workspaceName,
    "business.timezone": input.workspaceTimezone,
    "business.email": typeof metadata.business_email === "string" ? metadata.business_email : undefined,
    "business.phone": typeof metadata.business_phone === "string" ? metadata.business_phone : undefined,
    "customer.first_name": guestName.split(/\s+/)[0],
    "customer.full_name": guestName,
    "appointment.service": serviceDescription,
    "appointment.date": appointmentDateTime.date,
    "appointment.time": appointmentDateTime.time,
    "appointment.address": address,
    "appointment.total": total,
    "appointment.confirmation_code": confirmationCode,
    "appointment.payment_method": paymentMethod,
    "appointment.manage_url": manageUrl,
    "vehicle.description": vehicleDescription,
    "email.primary_action_url": manageUrl,
  };
  const customerResult = await dispatchLifecycleEvent({
    workspaceId: input.appointment.workspace_id,
    customerId: input.appointment.customer_id,
    recipientEmail: input.recipientEmail,
    recipientRole: "customer",
    templateKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
    eventId: input.appointment.id,
    variables: customerVariables,
    metadata: { appointmentId: input.appointment.id },
  });

  try {
    const admin = createSupabaseAdminClient();
    const workspace = await admin
      .from("workspaces")
      .select("created_by")
      .eq("id", input.appointment.workspace_id)
      .single();
    const ownerId = workspace.data?.created_by;
    const owner = ownerId ? await admin.auth.admin.getUserById(ownerId) : null;
    const ownerEmail = owner?.data?.user?.email;
    if (ownerEmail && ownerEmail.toLowerCase() !== input.recipientEmail.toLowerCase()) {
      const staffUrl = new URL(`/appointments/${input.appointment.id}`, input.actionUrl).toString();
      await dispatchLifecycleEvent({
        workspaceId: input.appointment.workspace_id,
        customerId: input.appointment.customer_id,
        recipientEmail: ownerEmail,
        recipientRole: "shop_owner",
        templateKey: LIFECYCLE_EVENT_KEYS.newAppointmentBooked,
        eventId: `${input.appointment.id}:shop-owner`,
        variables: {
          ...customerVariables,
          "email.primary_action_url": staffUrl,
        },
        metadata: { appointmentId: input.appointment.id },
      });
    }
  } catch (ownerNotificationError) {
    console.error("[Lifecycle] shop-owner booking notification enqueue failed", ownerNotificationError);
  }

  return customerResult;
}
