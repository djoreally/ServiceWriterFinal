/**
 * Team Members Commands — Write operations for technician and invitation management.
 */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";

export async function addTechnician(userId: string, data: Record<string, unknown>): Promise<any> {
  const result = await supabase.from("technicians").insert([{ user_id: userId, ...data } as any]);

  if (result.error?.message === "seat_limit_reached") {
    return {
      ...result,
      error: {
        ...result.error,
        code: "seat_limit_reached",
        message: "Technician seat limit reached for current plan.",
      },
    };
  }

  return result;
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

export async function updateTechnician(techId: string, data: Record<string, unknown>) {
  return supabase.from("technicians").update(data as never).eq("id", techId);
}

export async function uploadTeamDocument(filePath: string, file: File): Promise<any> {
  return supabase.storage.from("team-documents").upload(filePath, file, { upsert: true });
}

export async function deleteTechnician(techId: string) {
  return supabase.from("technicians").delete().eq("id", techId);
}
