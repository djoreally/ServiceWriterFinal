/** Mobile Dispatch Commands — canonical write operations for field technician job management. */
import { supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

async function authenticatedPost(path: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message || "Unable to update dispatch status.");
  return payload;
}

export async function updateDispatchStatusRpc(appointmentId: string, status: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: null, error: new Error("Select a workspace before updating dispatch status.") };
  try {
    if (status === "acknowledged" || status === "en_route" || status === "arrived") {
      const payload = await authenticatedPost(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/technician-status`, {
        workspace_id: workspaceId,
        status,
      });
      return { data: (payload as { data?: unknown }).data ?? null, error: null };
    }
    if (status === "in_progress") {
      const payload = await authenticatedPost(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/start`, {
        workspace_id: workspaceId,
      });
      return { data: (payload as { data?: unknown }).data ?? null, error: null };
    }
    if (status === "completed") {
      const payload = await authenticatedPost(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/complete`, {
        workspace_id: workspaceId,
      });
      return { data: (payload as { data?: unknown }).data ?? null, error: null };
    }
    return { data: null, error: new Error(`Unsupported dispatch status: ${status}`) };
  } catch (error) {
    return { data: null, error };
  }
}

export async function updateTechnicianLocationRpc(
  lat: number,
  lng: number,
  speed: number | null,
  heading: number | null,
): Promise<{ data: unknown | null; error: unknown | null }> {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: null, error: new Error("Select a workspace before updating location.") };
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: presence, error: presenceReadError } = await supabase
      .from("technician_presence")
      .select("status,current_appointment_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (presenceReadError) throw presenceReadError;
    const { data, error } = await supabase.rpc("set_technician_presence_v1", {
      p_workspace_id: workspaceId,
      p_status: presence?.status ?? "available",
      p_appointment_id: presence?.current_appointment_id ?? null,
      p_location: {
        lat,
        lng,
        speed_mps: speed,
        heading_degrees: heading,
        captured_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error: unknown) {
    return { data: null, error };
  }
}

export async function sendSmsByFunction(
  _to: string,
  _text: string,
  _appointmentId: string,
): Promise<{ data: { skipped: true; reason: "decommissioned" } }> {
  console.log("Skipping SMS send — Telephony has been decommissioned.");
  return { data: { skipped: true, reason: "decommissioned" } };
}
