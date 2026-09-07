/** Tech Dispatch Commands — canonical technician dispatch operations. */
import { supabase } from "@/integrations/supabase/client";
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
  const workspaceId = requireWorkspaceId();
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  if (update.technician_id !== user.id) throw new Error("You can only update your own technician status.");
  return supabase.rpc("set_technician_presence_v1", {
    p_workspace_id: workspaceId,
    p_status: update.new_status,
    p_appointment_id: update.appointment_id ?? null,
    p_location: update.location ?? null,
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
  const workspaceId = requireWorkspaceId();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,status,starts_at,ends_at")
    .eq("workspace_id", workspaceId)
    .eq("assigned_user_id", technician_id)
    .gte("starts_at", `${date}T00:00:00`)
    .lt("starts_at", `${date}T23:59:59.999`)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return { data: data ?? [], error: null };
}

export async function updateTechnicianLocation(technician_id: string, location: { lat: number; lng: number }) {
  const workspaceId = requireWorkspaceId();
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  if (technician_id !== user.id) throw new Error("You can only update your own location.");
  const { data: current } = await supabase
    .from("technician_presence")
    .select("status,current_appointment_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  return supabase.rpc("set_technician_presence_v1", {
    p_workspace_id: workspaceId,
    p_status: current?.status ?? "available",
    p_appointment_id: current?.current_appointment_id ?? null,
    p_location: location,
  });
}

async function clock(action: "clock_in" | "clock_out" | "start_break" | "end_break", location?: { lat: number; lng: number }) {
  const workspaceId = requireWorkspaceId();
  return supabase.rpc("clock_technician_v1", {
    p_workspace_id: workspaceId,
    p_action: action,
    p_location: location ?? null,
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const response = await fetch(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/technician-status`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspace_id: workspaceId, status, location: location ?? null }),
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Unable to update job status.");
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const response = await fetch(`/api/v1/appointments/${encodeURIComponent(appointment_id)}/start`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Unable to start job.");
  await recordDispatchEvent({ workspaceId, appointmentId: appointment_id, technicianId: await currentTechnicianId(), eventType: "started", newStatus: "in_progress", notes: "Technician started work" });
  return { success: true };
}
