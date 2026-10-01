/** Loyalty Program Commands - canonical workspace-scoped CRM loyalty writes. */
import { apiClient } from "@/lib/api-client";
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
  await apiClient.post("/v1/crm/loyalty/programs", {
    workspace_id: workspace.workspaceId,
    name: payload.name,
    scope: payload.scope,
    status: payload.status,
    points_per_dollar: payload.pointsPerDollar,
    points_per_visit: payload.pointsPerVisit,
    program_id: existingId ?? null,
  });
}
