/**
 * Mobile Dispatch Commands — canonical write operations for field technician job management.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router; the client attaches
 * auth automatically. Exported signatures are unchanged. The server resolves
 * the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export async function updateDispatchStatusRpc(appointmentId: string, status: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: null, error: new Error("Select a workspace before updating dispatch status.") };
  try {
    if (status === "acknowledged" || status === "en_route" || status === "arrived") {
      const payload = await apiClient.post<{ data?: unknown }>(
        `/v1/appointments/${encodeURIComponent(appointmentId)}/technician-status`,
        { selected_workspace_id: workspaceId, status },
      );
      return { data: payload.data ?? null, error: null };
    }
    if (status === "in_progress") {
      const payload = await apiClient.post<{ data?: unknown }>(
        `/v1/appointments/${encodeURIComponent(appointmentId)}/start`,
        { selected_workspace_id: workspaceId },
      );
      return { data: payload.data ?? null, error: null };
    }
    if (status === "completed") {
      const payload = await apiClient.post<{ data?: unknown }>(
        `/v1/appointments/${encodeURIComponent(appointmentId)}/complete`,
        { selected_workspace_id: workspaceId },
      );
      return { data: payload.data ?? null, error: null };
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
    const payload = await apiClient.post<{ data?: unknown }>("/v1/dispatch/technician-location", {
      latitude: lat,
      longitude: lng,
      location: {
        speed_mps: speed,
        heading_degrees: heading,
        captured_at: new Date().toISOString(),
      },
    });
    return { data: payload.data ?? null, error: null };
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
