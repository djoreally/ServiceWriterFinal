import { supabase } from "@/integrations/supabase/client";
import { queueAppointmentStatusForSync } from "@/offline/outbox/appointments";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import type { AppointmentFormState } from "@/shared/types/forms";
import { requestAppointmentProviderSync } from "./provider-sync.command";
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
export interface SaveAppointmentOptions {
  existingAppointmentId?: string;
  isPrefillNew?: boolean;
}

export interface SaveAppointmentResult {
  appointmentId: string;
  isUpdate: boolean;
}

/**
 * Create or update an appointment from form state.
 * Handles sanitization and only writes allowed columns.
 */
export async function saveAppointment(
  formData: AppointmentFormState,
  options: SaveAppointmentOptions = {},
): Promise<SaveAppointmentResult> {
  if (!formData.scheduled_date || !formData.scheduled_time) {
    throw new Error("Please select a date and time");
  }

  const toUuidOrNull = (val: unknown): string | null => {
    if (val == null) return null;
    const s = String(val).trim();
    if (s === "" || s === "undefined" || s === "null") return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(s) ? s : null;
  };

  const resolvedTitle = formData.title?.trim() || "Appointment";

  // Server-side tax calculation — the DB owns the tax math
  let resolvedTaxAmount = formData.tax_amount != null ? Number(formData.tax_amount) : null;
  if (resolvedTaxAmount == null && formData.estimated_cost != null) {
    try {
      const { data: { user } } = await getCurrentAuthUser();
      if (user) {
        const ownerUserId = await requireWorkspaceOwnerUserId();
        const { data: taxAmount } = await supabase.rpc("calculate_appointment_tax", {
          estimated_cost: Number(formData.estimated_cost),
          owner_user_id: ownerUserId,
        });
        if (taxAmount != null && taxAmount > 0) {
          resolvedTaxAmount = Number(taxAmount);
        }
      }
    } catch {
      // Non-critical: proceed without tax if RPC fails
    }
  }

  // Resolve service-location snapshot. If not provided on create, default from the
  // linked customer's address so appointments are never stored with a blank location.
  let resolvedLocationAddress = formData.location_address?.trim() || null;
  const resolvedCity = formData.customer_city?.trim() || null;
  const resolvedState = formData.customer_state?.trim() || null;
  const resolvedPostal = formData.customer_postal_code?.trim() || null;

  const shouldUpdate =
    !!options.existingAppointmentId && !options.isPrefillNew;

  if (!resolvedLocationAddress && !shouldUpdate && formData.customer_id) {
    try {
      const { data: cust } = await supabase
        .from("customers")
        .select("address")
        .eq("id", String(formData.customer_id))
        .maybeSingle();
      if (cust?.address && cust.address.trim()) {
        resolvedLocationAddress = cust.address.trim();
      }
    } catch {
      // non-critical
    }
  }

  const dataToSave = {
    title: resolvedTitle,
    scheduled_date: formData.scheduled_date,
    scheduled_time: formData.scheduled_time,
    duration_minutes: formData.duration_minutes ?? 60,
    status: formData.status || "confirmed",
    vehicle_id: toUuidOrNull(formData.vehicle_id),
    customer_id: toUuidOrNull(formData.customer_id),
    service_catalog_id: toUuidOrNull(formData.service_catalog_id),
    guest_name: formData.guest_name?.trim() || null,
    guest_email: formData.guest_email?.trim() || null,
    guest_phone: formData.guest_phone?.trim() || null,
    description: formData.description?.trim() || null,
    notes: formData.notes?.trim() || null,
    estimated_cost:
      formData.estimated_cost != null ? Number(formData.estimated_cost) : null,
    tax_amount: resolvedTaxAmount,
    location_address: resolvedLocationAddress,
    customer_city: resolvedCity,
    customer_state: resolvedState,
    customer_postal_code: resolvedPostal,
  };



  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before saving an appointment.");
  const starts_at = `${dataToSave.scheduled_date}T${dataToSave.scheduled_time}`;
  const ends_at = new Date(new Date(starts_at).getTime() + Number(dataToSave.duration_minutes) * 60000).toISOString();
  const bridgePayload = { workspace_id, customer_id: dataToSave.customer_id, vehicle_id: dataToSave.vehicle_id, starts_at: new Date(starts_at).toISOString(), ends_at, source: "staff", notes: dataToSave.notes ?? undefined };
  if (shouldUpdate && options.existingAppointmentId) {
    await nextApi.appointments.update(options.existingAppointmentId, { ...bridgePayload, title: dataToSave.title, status: dataToSave.status, duration_minutes: dataToSave.duration_minutes, description: dataToSave.description, guest_name: dataToSave.guest_name, guest_email: dataToSave.guest_email, guest_phone: dataToSave.guest_phone, estimated_cost: dataToSave.estimated_cost, tax_amount: dataToSave.tax_amount, location_address: dataToSave.location_address, customer_city: dataToSave.customer_city, customer_state: dataToSave.customer_state, customer_postal_code: dataToSave.customer_postal_code });
    return { appointmentId: options.existingAppointmentId, isUpdate: true };
  }
  const { data: created } = await nextApi.appointments.create({ ...bridgePayload, title: dataToSave.title, duration_minutes: dataToSave.duration_minutes, status: dataToSave.status, description: dataToSave.description, guest_name: dataToSave.guest_name, guest_email: dataToSave.guest_email, guest_phone: dataToSave.guest_phone, estimated_cost: dataToSave.estimated_cost, tax_amount: dataToSave.tax_amount, location_address: dataToSave.location_address, customer_city: dataToSave.customer_city, customer_state: dataToSave.customer_state, customer_postal_code: dataToSave.customer_postal_code });
  const createdRecord = created as { id?: string };
  if (!createdRecord.id) throw new Error("Failed to create appointment");

  requestAppointmentProviderSync({
    appointmentId: createdRecord.id,
    syncMode: "appointment_created",
    guestEmail: formData.guest_email?.trim() || null,
  }).catch((syncError) => {
    console.warn("[saveAppointment] provider sync failed", syncError);
  });

  return {
    appointmentId: createdRecord.id,
    isUpdate: false,
  };
}

export interface AutoDispatchResult {
  autoDispatchEnabled: boolean;
  topRecommendationName?: string | null;
}

/**
 * Attempt to auto-dispatch an appointment using the dispatch-engine edge function.
 * Returns information so the UI can decide how to notify the user.
 */
export async function tryAutoDispatchAppointment(
  appointmentId: string,
  formData: AppointmentFormState,
): Promise<AutoDispatchResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    return { autoDispatchEnabled: false };
  }

  const { data: workspaceOwnerId, error: workspaceError } = await supabase.rpc("current_workspace_owner_user_id");
  if (workspaceError) {
    console.error("[tryAutoDispatchAppointment] workspace error", workspaceError);
    return { autoDispatchEnabled: false };
  }

  const { data: profile, error: profileError } = await supabase
    .from("business_profiles")
    .select("auto_dispatch_enabled")
    .eq("user_id", workspaceOwnerId || user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[tryAutoDispatchAppointment] profile error", profileError);
    return { autoDispatchEnabled: false };
  }

  if (!profile?.auto_dispatch_enabled) {
    return { autoDispatchEnabled: false };
  }

  const { data: appt, error: apptError } = await supabase
    .from("appointments")
    .select(
      "scheduled_date, scheduled_time, duration_minutes, service_catalog_id, customer_postal_code",
    )
    .eq("id", appointmentId)
    .single();

  if (apptError || !appt) {
    console.error("[tryAutoDispatchAppointment] appointment error", apptError);
    return { autoDispatchEnabled: true, topRecommendationName: null };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-engine",
      {
        body: {
          appointment_id: appointmentId,
          service_type: formData.title || "Appointment",
          scheduled_start: `${appt.scheduled_date}T${appt.scheduled_time}`,
          estimated_duration_minutes: appt.duration_minutes || 60,
          zip_code: appt.customer_postal_code,
          auto_assign: true,
        },
      },
    );

    if (error) {
      console.error("[tryAutoDispatchAppointment] dispatch error", error);
      return { autoDispatchEnabled: true, topRecommendationName: null };
    }

    const dispatchResult = data as { top_recommendation?: { name?: string | null } } | null;
    const topRecommendationName = dispatchResult?.top_recommendation?.name ?? null;

    return {
      autoDispatchEnabled: true,
      topRecommendationName,
    };
  } catch (err) {
    console.error("[tryAutoDispatchAppointment] unexpected error", err);
    return { autoDispatchEnabled: true, topRecommendationName: null };
  }
}

/**
 * Update appointment status (used for simple status changes that don't create service records).
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: string,
): Promise<void> {
  if (await isOfflineEligibleForCurrentUser()) {
    await queueAppointmentStatusForSync(appointmentId, newStatus);
    return;
  }

    const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before updating an appointment.");
  if (newStatus === "completed") {
    await nextApi.appointments.complete(appointmentId, workspace_id);
  } else if (newStatus === "cancelled") {
    await nextApi.appointments.cancel(workspace_id, appointmentId);
  } else {
    await nextApi.appointments.update(appointmentId, { workspace_id, status: newStatus });
  }

  // Reservations are released on cancellation only. Completion records oil
  // usage for reporting and must not mutate inventory.
  if (newStatus === "cancelled") {
    try {
      const { releaseAppointmentReservations } = await import("./booking-inventory.command");
      await releaseAppointmentReservations(appointmentId);
    } catch (inventoryError) {
      console.warn("[updateAppointmentStatus] inventory release failed", inventoryError);
    }
  }
}

/**
 * Reschedule an appointment to a new date/time. Time must be `HH:MM`; the
 * helper appends seconds. Kept separate from `updateAppointmentStatus` so the
 * UI never has to open the appointments table directly.
 */
export async function updateAppointmentSchedule(
  appointmentId: string,
  scheduledDate: string,
  scheduledTimeHHMM: string,
): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before rescheduling an appointment.");
  await nextApi.appointments.update(appointmentId, { workspace_id, scheduled_date: scheduledDate, scheduled_time: `${scheduledTimeHHMM}:00` });
}
