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

export async function updateTechnicianStatus(update: TechStatusUpdate) {
  return supabase.functions.invoke("tech-dispatch-sync", { body: { action: "update_tech_status", data: update } });
}

export async function sendDispatchNotification(notification: DispatchNotification) {
  return supabase.functions.invoke("tech-dispatch-sync", { body: { action: "dispatch_notification", data: notification } });
}

export async function syncTechnicianDailyLoad(technician_id: string, date: string) {
  return supabase.functions.invoke("tech-dispatch-sync", { body: { action: "sync_daily_load", data: { technician_id, date } } });
}

export async function updateTechnicianLocation(technician_id: string, location: { lat: number; lng: number }) {
  return supabase.functions.invoke("tech-dispatch-sync", { body: { action: "update_location", data: { technician_id, location } } });
}

export async function clockInTechnician(location?: { lat: number; lng: number }) {
  return supabase.rpc("clock_in", { p_location: location ? JSON.stringify(location) : null });
}

export async function clockOutTechnician(location?: { lat: number; lng: number }) {
  return supabase.rpc("clock_out", { p_location: location ? JSON.stringify(location) : null });
}

export async function startBreak() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const { data: shift } = await supabase.from("time_clock_entries").select("id").eq("user_id", user.id).eq("status", "active").order("clock_in", { ascending: false }).limit(1).maybeSingle();
  if (!shift) throw new Error("No active shift found");
  const { error: shiftError } = await supabase.from("time_clock_entries").update({ status: "on_break", break_start: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", shift.id);
  if (shiftError) throw shiftError;
  const { error: techError } = await supabase.from("technicians").update({ status: "on_break", updated_at: new Date().toISOString() }).eq("auth_user_id", user.id);
  if (techError) throw techError;
  return { success: true };
}

export async function endBreak() {
  return supabase.rpc("end_break");
}

async function appointmentTransition(
  appointmentId: string,
  status: "acknowledged" | "en_route" | "arrived",
  location?: { lat: number; lng: number },
) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before updating this job.");
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
  const { data } = await supabase.from("technicians").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id ?? null;
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
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before starting a job.");
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
