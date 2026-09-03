import { supabase } from "@/integrations/supabase/client";
import { queueAppointmentStatusForSync } from "@/offline/outbox/appointments";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import type { AppointmentFormState } from "@/shared/types/forms";
import { requestAppointmentProviderSync } from "./provider-sync.command";
import { nextApi } from "@/lib/nextApiClient";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { syncAppointmentPrimaryService } from "@/lib/appointmentItemsApi";

export interface SaveAppointmentOptions { existingAppointmentId?: string; isPrefillNew?: boolean; }
export interface SaveAppointmentResult { appointmentId: string; isUpdate: boolean; }

function uuidOrNull(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function zonedParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Convert a workspace-local wall-clock date/time to a UTC ISO timestamp. */
function workspaceLocalToIso(date: string, time: string, timezone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Invalid appointment date/time");
  const target = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: Number(timeMatch[3] || 0),
  };
  let candidate = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(candidate, timezone);
    const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
    const delta = targetAsUtc - renderedAsUtc;
    candidate += delta;
    if (delta === 0) break;
  }
  const verification = zonedParts(candidate, timezone);
  if (verification.year !== target.year || verification.month !== target.month || verification.day !== target.day || verification.hour !== target.hour || verification.minute !== target.minute) {
    throw new Error("That local time is not valid in the workspace timezone. Choose another time.");
  }
  return new Date(candidate).toISOString();
}

async function workspaceTimezone(workspaceId: string): Promise<string> {
  const { data, error } = await (supabase as any).from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return data?.timezone || "UTC";
}

async function sendStaffAppointmentConfirmation(appointmentId: string, workspaceId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required to send confirmation email.");
  const response = await fetch(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/confirmation`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Confirmation email could not be queued.");
}

export async function saveAppointment(formData: AppointmentFormState, options: SaveAppointmentOptions = {}): Promise<SaveAppointmentResult> {
  if (!formData.scheduled_date || !formData.scheduled_time) throw new Error("Please select a date and time");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving an appointment.");
  const customerId = uuidOrNull(formData.customer_id);
  if (!customerId) throw new Error("Select or create a customer before saving this appointment.");
  const vehicleId = uuidOrNull(formData.vehicle_id);
  if (!vehicleId) throw new Error("Select or create a vehicle before saving this appointment.");
  const serviceCatalogId = uuidOrNull(formData.service_catalog_id);
  if (!serviceCatalogId) throw new Error("Select a service before saving this appointment.");

  const durationMinutes = Math.max(5, Number(formData.duration_minutes ?? 60));
  const timezone = await workspaceTimezone(context.workspaceId);
  const startsAt = workspaceLocalToIso(formData.scheduled_date, formData.scheduled_time, timezone);
  const endsAt = new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();

  let resolvedTaxAmount = formData.tax_amount != null ? Number(formData.tax_amount) : null;
  if (resolvedTaxAmount == null && formData.estimated_cost != null) {
    const settings = await fetchBusinessSettings();
    if (settings) {
      const { data } = await (supabase as any).from("workspace_settings").select("tax_rate").eq("workspace_id", context.workspaceId).maybeSingle();
      resolvedTaxAmount = Number((Number(formData.estimated_cost) * Number(data?.tax_rate ?? 0) / 100).toFixed(2));
    }
  }

  let resolvedLocationAddress = formData.location_address?.trim() || null;
  if (!resolvedLocationAddress) {
    const { data: customer } = await (supabase as any).from("customers").select("address_line1,address_line2,city,region,postal_code").eq("workspace_id", context.workspaceId).eq("id", customerId).maybeSingle();
    if (customer) resolvedLocationAddress = [customer.address_line1, customer.address_line2, customer.city, customer.region, customer.postal_code].filter(Boolean).join(", ") || null;
  }

  const payload = {
    workspace_id: context.workspaceId, customer_id: customerId, vehicle_id: vehicleId,
    starts_at: startsAt, ends_at: endsAt, source: "staff", status: formData.status || "confirmed",
    notes: formData.notes?.trim() || null, title: formData.title?.trim() || "Appointment",
    description: formData.description?.trim() || null, guest_name: formData.guest_name?.trim() || null,
    guest_email: formData.guest_email?.trim() || null, guest_phone: formData.guest_phone?.trim() || null,
    service_catalog_id: serviceCatalogId, estimated_cost: formData.estimated_cost != null ? Number(formData.estimated_cost) : null,
    tax_amount: resolvedTaxAmount, location_address: resolvedLocationAddress,
    customer_city: formData.customer_city?.trim() || null, customer_state: formData.customer_state?.trim() || null,
    customer_postal_code: formData.customer_postal_code?.trim() || null,
  };

  const shouldUpdate = Boolean(options.existingAppointmentId && !options.isPrefillNew);
  if (shouldUpdate && options.existingAppointmentId) {
    await nextApi.appointments.update(options.existingAppointmentId, payload);
    await syncAppointmentPrimaryService({ workspaceId: context.workspaceId, appointmentId: options.existingAppointmentId, serviceCatalogId });
    if (formData.sendEmailNotification) await sendStaffAppointmentConfirmation(options.existingAppointmentId, context.workspaceId);
    return { appointmentId: options.existingAppointmentId, isUpdate: true };
  }

  const { data: created } = await nextApi.appointments.create(payload);
  const createdRecord = created as { id?: string };
  if (!createdRecord.id) throw new Error("Failed to create appointment");
  await syncAppointmentPrimaryService({ workspaceId: context.workspaceId, appointmentId: createdRecord.id, serviceCatalogId });
  if (formData.sendEmailNotification) await sendStaffAppointmentConfirmation(createdRecord.id, context.workspaceId);
  requestAppointmentProviderSync({ appointmentId: createdRecord.id, syncMode: "appointment_created", guestEmail: formData.guest_email?.trim() || null })
    .catch((syncError) => console.warn("[saveAppointment] provider sync failed", syncError));
  return { appointmentId: createdRecord.id, isUpdate: false };
}

export interface AutoDispatchResult { autoDispatchEnabled: boolean; topRecommendationName?: string | null; }
export async function tryAutoDispatchAppointment(_appointmentId: string, _formData: AppointmentFormState): Promise<AutoDispatchResult> {
  const context = await resolveCurrentWorkspace(); if (!context) return { autoDispatchEnabled: false };
  const { data, error } = await (supabase as any).from("workspace_settings").select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle();
  if (error || !data) return { autoDispatchEnabled: false };
  const operational = data.operational_settings && typeof data.operational_settings === "object" ? data.operational_settings as Record<string, unknown> : {};
  return { autoDispatchEnabled: operational.auto_dispatch_enabled === true, topRecommendationName: null };
}

export async function updateAppointmentSchedule(appointmentId: string, scheduledDate: string, scheduledTime: string): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before rescheduling an appointment.");
  const { data: existing, error } = await (supabase as any).from("appointments").select("starts_at,ends_at").eq("workspace_id", context.workspaceId).eq("id", appointmentId).maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error("Appointment not found");
  const timezone = await workspaceTimezone(context.workspaceId);
  const startsAt = workspaceLocalToIso(scheduledDate, scheduledTime, timezone);
  const previousStart = Date.parse(existing.starts_at); const previousEnd = Date.parse(existing.ends_at);
  const durationMs = Number.isFinite(previousStart) && Number.isFinite(previousEnd) && previousEnd > previousStart ? previousEnd - previousStart : 60 * 60_000;
  await nextApi.appointments.update(appointmentId, { workspace_id: context.workspaceId, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + durationMs).toISOString() });
}

export async function updateAppointmentStatus(appointmentId: string, newStatus: string): Promise<void> {
  if (await isOfflineEligibleForCurrentUser()) { await queueAppointmentStatusForSync(appointmentId, newStatus); return; }
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before updating an appointment.");
  if (newStatus === "completed") await nextApi.appointments.complete(appointmentId, context.workspaceId);
  else if (newStatus === "cancelled") await nextApi.appointments.cancel(context.workspaceId, appointmentId);
  else await nextApi.appointments.update(appointmentId, { workspace_id: context.workspaceId, status: newStatus });
  if (newStatus === "cancelled") {
    try { const { releaseAppointmentReservations } = await import("./booking-inventory.command"); await releaseAppointmentReservations(appointmentId); }
    catch (inventoryError) { console.warn("[updateAppointmentStatus] inventory release failed", inventoryError); }
  }
}
