/**
 * Tech Dispatch Commands — canonical technician dispatch operations.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router; the client attaches
 * auth automatically. `nextApi.dispatchEvents` stays as the grandfathered
 * typed wrapper. Exported signatures are unchanged. The server resolves the
 * workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface TechStatusUpdate {
  technician_id: string;
  new_status: "available" | "en_route" | "on_job" | "on_break" | "unavailable" | "offline";
  appointment_id?: string;
  location?: { lat: number; lng: number };
}

export interface DispatchNotification {
  type: "job_assigned" | "job_updated" | "job_cancelled" | "route_optimized" | "urgent_message";
  technician_id: string;
  appointment_id?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

function requireWorkspaceId() {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before updating technician state.");
  return workspaceId;
}

export async function updateTechnicianStatus(update: TechStatusUpdate) {
  requireWorkspaceId();
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  if (update.technician_id !== user.id) throw new Error("You can only update your own technician status.");
  return apiClient.post("/v1/dispatch/technician-status", {
    technician_id: update.technician_id,
    new_status: update.new_status,
    appointment_id: update.appointment_id ?? null,
    location: update.location ?? null,
  });
}

export async function sendDispatchNotification(notification: DispatchNotification) {
  if (!notification.appointment_id) throw new Error("A dispatch notification must reference an appointment.");
  const workspaceId = requireWorkspaceId();
  return nextApi.dispatchEvents.create({
    workspace_id: workspaceId,
    appointment_id: notification.appointment_id,
    technician_id: notification.technician_id,
    event_type: "note",
    notes: notification.message || notification.type,
    new_status: notification.type,
    location: null,
  });
}

export async function syncTechnicianDailyLoad(technician_id: string, date: string) {
  requireWorkspaceId();
  const response = await apiClient.get<{ data: unknown[] }>("/v1/dispatch/technician-daily-load", {
    query: { technician_id, date },
  });
  return { data: response.data ?? [], error: null };
}

export async function updateTechnicianLocation(technician_id: string, location: { lat: number; lng: number }) {
  requireWorkspaceId();
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  if (technician_id !== user.id) throw new Error("You can only update your own location.");
  return apiClient.post("/v1/dispatch/technician-location", {
    latitude: location.lat,
    longitude: location.lng,
  });
}

async function clock(action: "clock_in" | "clock_out" | "start_break" | "end_break", location?: { lat: number; lng: number }) {
  requireWorkspaceId();
  return apiClient.post("/v1/dispatch/clock", {
    action,
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
  });
}

export async function clockInTechnician(location?: { lat: number; lng: number }) {
  return clock("clock_in", location);
}

export async function clockOutTechnician(location?: { lat: number; lng: number }) {
  return clock("clock_out", location);
}

export async function startBreak() {
  return clock("start_break");
}

export async function endBreak() {
  return clock("end_break");
}

async function appointmentTransition(
  appointmentId: string,
  status: "acknowledged" | "en_route" | "arrived",
  location?: { lat: number; lng: number },
) {
  const workspaceId = requireWorkspaceId();
  await apiClient.post(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/technician-status`,
    { selected_workspace_id: workspaceId, status, location: location ?? null },
  );
  return workspaceId;
}

async function currentTechnicianId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function recordDispatchEvent(input: {
  workspaceId: string;
  appointmentId: string;
  technicianId: string | null;
  eventType: string;
  newStatus: string;
  notes: string;
  location?: { lat: number; lng: number };
}) {
  try {
    await nextApi.dispatchEvents.create({
      workspace_id: input.workspaceId,
      appointment_id: input.appointmentId,
      technician_id: input.technicianId,
      event_type: input.eventType,
      new_status: input.newStatus,
      notes: input.notes,
      ...(input.location ? { location: input.location } : {}),
    });
  } catch (error) {
    console.warn("[tech-dispatch] dispatch event recording failed", error);
  }
}

export async function acceptJobAssignment(appointment_id: string) {
  const workspaceId = await appointmentTransition(appointment_id, "acknowledged");
  await recordDispatchEvent({ workspaceId, appointmentId: appointment_id, technicianId: await currentTechnicianId(), eventType: "status_changed", newStatus: "acknowledged", notes: "Technician acknowledged job assignment" });
  return { success: true };
}

export async function markEnRoute(appointment_id: string, location?: { lat: number; lng: number }) {
  const workspaceId = await appointmentTransition(appointment_id, "en_route", location);
  await recordDispatchEvent({ workspaceId, appointmentId: appointment_id, technicianId: await currentTechnicianId(), eventType: "en_route", newStatus: "en_route", notes: "Technician is en route", location });
  return { success: true };
}

export async function markArrived(appointment_id: string, location?: { lat: number; lng: number }) {
  const workspaceId = await appointmentTransition(appointment_id, "arrived", location);
  await recordDispatchEvent({ workspaceId, appointmentId: appointment_id, technicianId: await currentTechnicianId(), eventType: "arrived", newStatus: "arrived", notes: "Technician arrived at job site", location });
  return { success: true };
}

export async function startJob(appointment_id: string) {
  const workspaceId = requireWorkspaceId();
  await apiClient.post(
    `/v1/appointments/${encodeURIComponent(appointment_id)}/start`,
    { selected_workspace_id: workspaceId },
  );
  await recordDispatchEvent({ workspaceId, appointmentId: appointment_id, technicianId: await currentTechnicianId(), eventType: "started", newStatus: "in_progress", notes: "Technician started work" });
  return { success: true };
}
