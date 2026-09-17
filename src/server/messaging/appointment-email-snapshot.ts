import type { SupabaseClient } from "@supabase/supabase-js";

type AppointmentLike = Record<string, any>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

export type AppointmentEmailSnapshot = {
  appointment: AppointmentLike;
  customerEmail: string | null;
  customerId: string | null;
  variables: Record<string, string | null | undefined>;
  metadata: Record<string, string>;
};

export async function buildAppointmentEmailSnapshot(
  supabase: SupabaseClient,
  appointment: AppointmentLike,
  workspaceTimezone?: string,
): Promise<AppointmentEmailSnapshot> {
  const workspaceId = String(appointment.workspace_id);
  const appointmentId = String(appointment.id);
  const metadata = object(appointment.metadata);
  const customer = one<Record<string, any>>(appointment.customers);
  const primaryVehicle = one<Record<string, any>>(appointment.vehicles);

  const [
    { data: items, error: itemsError },
    { data: invoice, error: invoiceError },
  ] = await Promise.all([
    supabase.from("appointment_items")
      .select("description,quantity,unit_price,service_catalog(name)")
      .eq("workspace_id", workspaceId).eq("appointment_id", appointmentId)
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("invoices")
      .select("invoice_number,total_amount,status")
      .eq("workspace_id", workspaceId).eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (itemsError || invoiceError) throw itemsError ?? invoiceError;

  const booking = object(metadata.booking_configuration);
  const bookedVehicles = Array.isArray(booking.vehicles) ? booking.vehicles.map(object) : [];
  const vehicleLabels = bookedVehicles.map((vehicle) => {
    const year = text(vehicle.year);
    const make = text(vehicle.make);
    const model = text(vehicle.model);
    return [year, make, model].filter(Boolean).join(" ");
  }).filter(Boolean);
  if (!vehicleLabels.length && primaryVehicle) {
    const label = [primaryVehicle.year, primaryVehicle.make, primaryVehicle.model].filter(Boolean).join(" ");
    if (label) vehicleLabels.push(label);
  }

  const serviceLines = (items ?? []).map((item: any) => {
    const catalog = one<Record<string, any>>(item.service_catalog);
    const name = text(catalog?.name) ?? text(item.description) ?? "Service";
    const quantity = Number(item.quantity ?? 1);
    return `${name} × ${quantity} — ${money(Number(item.unit_price ?? 0) * quantity)}`;
  });

  const serviceAddress = text(metadata.location_address) ?? text(metadata.service_address) ?? null;
  const timezone = text(metadata.business_timezone) ?? text(metadata.timezone) ?? text(workspaceTimezone) ?? "America/New_York";
  const startsAt = text(appointment.starts_at);
  const scheduled = startsAt ? new Date(startsAt) : null;
  const appointmentDate = scheduled && !Number.isNaN(scheduled.getTime())
    ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "numeric", day: "numeric", year: "numeric" }).format(scheduled)
    : undefined;
  const appointmentTime = scheduled && !Number.isNaN(scheduled.getTime())
    ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(scheduled)
    : undefined;
  const hasLinkedCustomer = Boolean(appointment.customer_id || customer?.id);

  return {
    appointment,
    customerEmail: hasLinkedCustomer ? text(customer?.email) : text(metadata.guest_email),
    customerId: appointment.customer_id ?? customer?.id ?? null,
    variables: {
      "customer.first_name": text(customer?.first_name) ?? text(metadata.guest_name)?.split(/\s+/)[0] ?? "there",
      "customer.full_name": [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || text(metadata.guest_name) || "Customer",
      "appointment.vehicle": vehicleLabels.join(", "),
      "appointment.vehicles": vehicleLabels.join(", "),
      "appointment.service": serviceLines.map(line => line.split(" — ")[0]).join(", ") || text(metadata.service_name) || "Service",
      "appointment.services": serviceLines.join("\n"),
      "appointment.address": serviceAddress,
      "appointment.date": appointmentDate,
      "appointment.time": appointmentTime,
      "appointment.arrival_window": text(metadata.arrival_window) ?? appointmentTime,
      "appointment.manage_url": text(metadata.manage_url),
      "business.timezone": timezone,
      "appointment.total": invoice ? money(invoice.total_amount) : (metadata.estimated_cost != null ? money(metadata.estimated_cost) : undefined),
      "invoice.number": invoice?.invoice_number ?? undefined,
      "invoice.total": invoice ? money(invoice.total_amount) : undefined,
      "invoice.status": invoice?.status ?? undefined,
    },
    metadata: {
      appointmentId,
      vehicleCount: String(vehicleLabels.length),
      serviceLineCount: String(serviceLines.length),
      snapshotSource: "canonical_appointment_email_snapshot",
    },
  };
}
