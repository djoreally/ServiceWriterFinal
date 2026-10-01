/**
 * Team Members Commands — Write operations for technician and invitation management.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { nextApi } from "@/lib/nextApiClient";
import type { Database } from "@/integrations/supabase/types";

type TechnicianInsert = Database["public"]["Tables"]["technicians"]["Insert"];
type TechnicianUpdate = Database["public"]["Tables"]["technicians"]["Update"];

export async function addTechnician(
  userId: string,
  data: Omit<TechnicianInsert, "user_id">,
) {
  try {
    const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/technicians", {
      user_id: userId,
      profile: data as Record<string, unknown>,
    });
    return { data: response.data, error: null };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "seat_limit_reached") {
      return {
        data: null,
        error: {
          code: "seat_limit_reached",
          message: "Technician seat limit reached for current plan.",
        },
      };
    }
    throw error;
  }
}

export async function createTeamInvitation(workspaceId: string, email: string, _name: string, role: string): Promise<{ data: Awaited<ReturnType<typeof nextApi.invitations.create>> | null; error: unknown }> {
  try {
    const data = await nextApi.invitations.create({
      workspace_id: workspaceId,
      invited_email: email,
      invited_role: role as "owner" | "admin" | "manager" | "service_advisor" | "technician" | "dispatcher" | "receptionist" | "fleet_manager" | "viewer" | "customer",
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function cancelTeamInvitation(invitationId: string): Promise<{ data: Awaited<ReturnType<typeof nextApi.invitations.revoke>> | null; error: unknown }> {
  try {
    const data = await nextApi.invitations.revoke(invitationId);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function updateTechnician(techId: string, data: TechnicianUpdate) {
  const response = await apiClient.patch<{ data: unknown[] }>(`/v1/tech-os/technicians/${techId}`, data);
  return { data: response.data, error: null };
}

export async function uploadTeamDocument(filePath: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("path", filePath);
  const response = await apiClient.post<{ data: { path: string } }>("/v1/team/documents/upload", form);
  return { data: response.data, error: null };
}

export async function deleteTechnician(techId: string) {
  const response = await apiClient.delete<{ data: { ok: boolean } }>(`/v1/tech-os/technicians/${techId}`);
  return { data: response.data, error: null };
}
