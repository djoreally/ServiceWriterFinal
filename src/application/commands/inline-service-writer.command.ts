/** Inline Service Writer Commands — canonical workspace-scoped writes for the Command Center. */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { requestAppointmentProviderSync } from "./provider-sync.command";

type CompatResult<T> = { data: T | null; error: Error | null };

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Request failed");
}

function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || "Customer", last_name: parts.join(" ") };
}

function zonedParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

function workspaceLocalToIso(date: string, time: string, timezone: string): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dm || !tm) throw new Error("Invalid appointment date/time");
  const target = { year: +dm[1], month: +dm[2], day: +dm[3], hour: +tm[1], minute: +tm[2], second: +(tm[3] || 0) };
  let candidate = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  for (let i = 0; i < 3; i++) {
    const actual = zonedParts(candidate, timezone);
    const delta = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second)
      - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += delta;
    if (delta === 0) break;
  }
  return new Date(candidate).toISOString();
}

async function currentWorkspace() {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before using the Service Writer.");
  return context;
}

/** Create a canonical customer record. userId is retained for caller compatibility only. */
export async function createInlineCustomer(_userId: string, data: { name: string; email: string | null; phone: string | null }): Promise<CompatResult<{ id: string }>> {
  try {
    const context = await currentWorkspace();
    const response = await nextApi.customers.create({
      workspace_id: context.workspaceId,
      ...splitName(data.name),
      email: data.email || undefined,
      phone: data.phone || undefined,
    });
    const row = response.data as { id?: string };
    if (!row?.id) throw new Error("Customer creation did not return an id.");
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Create a canonical appointment from the inline writer. */
export async function createInlineAppointment(data: {
  user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  customer_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  location_address: string | null;
  estimated_cost: number;
  job_priority: string;
  notes: string | null;
  status: string;
  source: string;
  service_catalog_id: string | null;
}): Promise<CompatResult<{ id: string }>> {
  try {
    const context = await currentWorkspace();
    if (!data.customer_id) throw new Error("Select or create a customer before creating the job.");

    const { data: workspace, error: workspaceError } = await (supabase as any)
      .from("workspaces")
      .select("timezone")
      .eq("id", context.workspaceId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;

    const startsAt = workspaceLocalToIso(data.scheduled_date, data.scheduled_time, workspace?.timezone || "UTC");
    const endsAt = new Date(Date.parse(startsAt) + Math.max(5, Number(data.duration_minutes || 60)) * 60_000).toISOString();

    const response = await nextApi.appointments.create({
      workspace_id: context.workspaceId,
      customer_id: data.customer_id,
      starts_at: startsAt,
      ends_at: endsAt,
      source: data.source || "command_center",
      status: data.status === "scheduled" ? "confirmed" : data.status,
      notes: data.notes,
      title: data.title,
      guest_name: data.guest_name,
      guest_email: data.guest_email,
      guest_phone: data.guest_phone,
      location_address: data.location_address,
      estimated_cost: Number(data.estimated_cost || 0),
      service_catalog_id: data.service_catalog_id,
      override_availability: false,
    });

    const row = response.data as { id?: string };
    if (!row?.id) throw new Error("Appointment creation did not return an id.");

    requestAppointmentProviderSync({
      appointmentId: row.id,
      syncMode: "appointment_created",
      guestEmail: data.guest_email,
    }).catch((error) => console.warn("[createInlineAppointment] provider sync failed", error));

    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Batch insert canonical appointment line items. */
export async function insertAppointmentServiceItems(
  items: Array<{
    appointment_id: string;
    service_catalog_id: string;
    name: string;
    price: number;
    quantity: number;
  }>,
): Promise<CompatResult<unknown[]>> {
  try {
    if (!items.length) return { data: [], error: null };
    const context = await currentWorkspace();
    const appointmentId = items[0].appointment_id;
    if (items.some((item) => item.appointment_id !== appointmentId)) throw new Error("Line items must belong to one appointment.");

    const { data: appointment, error: appointmentError } = await (supabase as any)
      .from("appointments")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("id", appointmentId)
      .maybeSingle();
    if (appointmentError) throw appointmentError;
    if (!appointment) throw new Error("Appointment was not found in the active workspace.");

    const rows = items.map((item, index) => ({
      workspace_id: context.workspaceId,
      appointment_id: item.appointment_id,
      service_catalog_id: item.service_catalog_id,
      item_type: "service",
      description: item.name,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit_price: Number(item.price || 0),
      sort_order: index,
      metadata: { source: "inline_service_writer" },
    }));

    const { data, error } = await (supabase as any)
      .from("appointment_items")
      .insert(rows)
      .select();
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
