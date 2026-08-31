import { supabase } from "@/integrations/supabase/client";
import { queueAppointmentStatusForSync } from "@/offline/outbox/appointments";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import type { AppointmentFormState } from "@/shared/types/forms";
import { requestAppointmentProviderSync } from "./provider-sync.command";
import { nextApi } from "@/lib/nextApiClient";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { syncAppointmentPrimaryService } from "@/lib/appointmentItemsApi";

export interface SaveAppointmentOptions {
  existingAppointmentId?: string;
  isPrefillNew?: boolean;
}

export interface SaveAppointmentResult {
  appointmentId: string;
  isUpdate: boolean;
}

function uuidOrNull(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function localAppointmentIso(date: string, time: string): string {
  const value = new Date(`${date}T${time}`);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid appointment date/time");
  return value.toISOString();
}

/** Create or update an appointment through Final's Next.js API. */
export async function saveAppointment(
  formData: AppointmentFormState,
  options: SaveAppointmentOptions = {},
): Promise<SaveAppointmentResult> {
  if (!formData.scheduled_date || !formData.scheduled_time) {
    throw new Error("Please select a date and time");
  }

  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving an appointment.");

  const customerId = uuidOrNull(formData.customer_id);
  if (!customerId) throw new Error("Select or create a customer before saving this appointment.");

  const vehicleId = uuidOrNull(formData.vehicle_id);
  const serviceCatalogId = uuidOrNull(formData.service_catalog_id);
  const durationMinutes = Math.max(5, Number(formData.duration_minutes ?? 60));
  const startsAt = localAppointmentIso(formData.scheduled_date, formData.scheduled_time);
  const endsAt = new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();
  const resolvedTitle = formData.title?.trim() || "Appointment";

  let resolvedTaxAmount = formData.tax_amount != null ? Number(formData.tax_amount) : null;
  if (resolvedTaxAmount == null && formData.estimated_cost != null) {
    const settings = await fetchBusinessSettings();
    if (settings) {
      const { data } = await (supabase as any)
        .from("workspace_settings")
        .select("tax_rate")
        .eq("workspace_id", context.workspaceId)
        .maybeSingle();
      const rate = Number(data?.tax_rate ?? 0);
      resolvedTaxAmount = Number((Number(formData.estimated_cost) * rate / 100).toFixed(2));
    }
  }

  let resolvedLocationAddress = formData.location_address?.trim() || null;
  if (!resolvedLocationAddress) {
    const { data: customer } = await (supabase as any)
      .from("customers")
      .select("address_line1,address_line2,city,region,postal_code")
      .eq("workspace_id", context.workspaceId)
      .eq("id", customerId)
      .maybeSingle();
    if (customer) {
      resolvedLocationAddress = [customer.address_line1, customer.address_line2, customer.city, customer.region, customer.postal_code]
        .filter(Boolean)
        .join(", ") || null;
    }
  }

  const payload = {
    workspace_id: context.workspaceId,
    customer_id: customerId,
    vehicle_id: vehicleId,
    starts_at: startsAt,
    ends_at: endsAt,
    source: "staff",
    status: formData.status || "confirmed",
    notes: formData.notes?.trim() || null,
    title: resolvedTitle,
    description: formData.description?.trim() || null,
    guest_name: formData.guest_name?.trim() || null,
    guest_email: formData.guest_email?.trim() || null,
    guest_phone: formData.guest_phone?.trim() || null,
    service_catalog_id: serviceCatalogId,
    estimated_cost: formData.estimated_cost != null ? Number(formData.estimated_cost) : null,
    tax_amount: resolvedTaxAmount,
    location_address: resolvedLocationAddress,
    customer_city: formData.customer_city?.trim() || null,
    customer_state: formData.customer_state?.trim() || null,
    customer_postal_code: formData.customer_postal_code?.trim() || null,
  };

  const shouldUpdate = Boolean(options.existingAppointmentId && !options.isPrefillNew);
  if (shouldUpdate && options.existingAppointmentId) {
    await nextApi.appointments.update(options.existingAppointmentId, payload);
    await syncAppointmentPrimaryService({
      workspaceId: context.workspaceId,
      appointmentId: options.existingAppointmentId,
      serviceCatalogId,
    });
    return { appointmentId: options.existingAppointmentId, isUpdate: true };
  }

  const { data: created } = await nextApi.appointments.create(payload);
  const createdRecord = created as { id?: string };
  if (!createdRecord.id) throw new Error("Failed to create appointment");

  await syncAppointmentPrimaryService({
    workspaceId: context.workspaceId,
    appointmentId: createdRecord.id,
    serviceCatalogId,
  });

  requestAppointmentProviderSync({
    appointmentId: createdRecord.id,
    syncMode: "appointment_created",
    guestEmail: formData.guest_email?.trim() || null,
  }).catch((syncError) => {
    console.warn("[saveAppointment] provider sync failed", syncError);
  });

  const recipientEmail = formData.guest_email?.trim();
  if (recipientEmail) {
    try {
      const { notifyBookingConfirmation } = await import("@/application/notifications");
      await notifyBookingConfirmation({
        recipients: {
          customerEmail: recipientEmail,
          customerName: formData.guest_name?.trim() || "Valued Customer",
          providerEmail: null,
          providerName: "Service Writer",
        },
        serviceName: resolvedTitle,
        scheduledDate: formData.scheduled_date,
        scheduledTime: formData.scheduled_time,
        estimatedDuration: durationMinutes,
        totalAmount: formData.estimated_cost != null ? `$${formData.estimated_cost}` : undefined,
      });
    } catch (notifErr) {
      console.warn("[saveAppointment] failed to send booking notification", notifErr);
    }
  }

  return { appointmentId: createdRecord.id, isUpdate: false };
}

export interface AutoDispatchResult {
  autoDispatchEnabled: boolean;
  topRecommendationName?: string | null;
}

export async function tryAutoDispatchAppointment(
  _appointmentId: string,
  _formData: AppointmentFormState,
): Promise<AutoDispatchResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { autoDispatchEnabled: false };

  const { data, error } = await (supabase as any)
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error || !data) return { autoDispatchEnabled: false };

  const operational = data.operational_settings && typeof data.operational_settings === "object"
    ? data.operational_settings as Record<string, unknown>
    : {};
  const enabled = operational.auto_dispatch_enabled === true;
  return { autoDispatchEnabled: enabled, topRecommendationName: null };
}

/** Reschedule an appointment while preserving its existing duration. */
export async function updateAppointmentSchedule(
  appointmentId: string,
  scheduledDate: string,
  scheduledTime: string,
): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before rescheduling an appointment.");

  const { data: existing, error } = await (supabase as any)
    .from("appointments")
    .select("starts_at,ends_at")
    .eq("workspace_id", context.workspaceId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error("Appointment not found");

  const startsAt = localAppointmentIso(scheduledDate, scheduledTime);
  const previousStart = Date.parse(existing.starts_at);
  const previousEnd = Date.parse(existing.ends_at);
  const durationMs = Number.isFinite(previousStart) && Number.isFinite(previousEnd) && previousEnd > previousStart
    ? previousEnd - previousStart
    : 60 * 60_000;
  const endsAt = new Date(Date.parse(startsAt) + durationMs).toISOString();

  await nextApi.appointments.update(appointmentId, {
    workspace_id: context.workspaceId,
    starts_at: startsAt,
    ends_at: endsAt,
  });
}

export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: string,
): Promise<void> {
  if (await isOfflineEligibleForCurrentUser()) {
    await queueAppointmentStatusForSync(appointmentId, newStatus);
    return;
  }

  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before updating an appointment.");

  if (newStatus === "completed") {
    await nextApi.appointments.complete(appointmentId, context.workspaceId);
  } else if (newStatus === "cancelled") {
    await nextApi.appointments.cancel(context.workspaceId, appointmentId);
  } else {
    await nextApi.appointments.update(appointmentId, {
      workspace_id: context.workspaceId,
      status: newStatus,
    });
  }

  if (newStatus === "cancelled") {
    try {
      const { releaseAppointmentReservations } = await import("./booking-inventory.command");
      await releaseAppointmentReservations(appointmentId);
    } catch (inventoryError) {
      console.warn("[updateAppointmentStatus] inventory release failed", inventoryError);
    }
  }
}
