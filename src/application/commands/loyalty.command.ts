/** Loyalty Program Commands - canonical workspace-scoped CRM loyalty writes. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface LoyaltyProgramPayload {
  name: string;
  scope: string;
  status: string;
  pointsPerDollar: number;
  pointsPerVisit: number;
}

export async function saveLoyaltyProgram(
  _userId: string,
  payload: LoyaltyProgramPayload,
  existingId?: string,
): Promise<void> {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  const { error } = await (supabase as any).rpc("save_loyalty_program_v1", {
    p_workspace_id: workspace.workspaceId,
    p_name: payload.name,
    p_scope: payload.scope,
    p_status: payload.status === "paused" ? "inactive" : payload.status,
    p_points_per_dollar: Math.max(0, payload.pointsPerDollar),
    p_points_per_visit: Math.max(0, payload.pointsPerVisit),
    p_program_id: existingId ?? null,
  });
  if (error) throw error;
}
