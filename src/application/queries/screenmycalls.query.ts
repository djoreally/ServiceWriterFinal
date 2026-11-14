/**
 * ScreenMyCalls connection queries.
 *
 * Reads go through the typed API client to the connection routes in
 * src/server/hono/routes/screenmycalls.ts. The routes require an
 * owner/admin workspace member and answer with their own errors; this
 * layer lets those surface to the panel.
 */
import { apiClient } from "@/lib/api-client";
import type { ScreenMyCallsStatus, TenDlcState } from "@/lib/screenMyCalls";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface ScreenMyCallsStatusResult {
  workspaceId: string;
  status: ScreenMyCallsStatus;
}

export async function fetchScreenMyCallsStatus(): Promise<ScreenMyCallsStatusResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before connecting ScreenMyCalls.");
  const response = await apiClient.get<{ data: ScreenMyCallsStatus }>(
    "/v1/integrations/screenmycalls/status",
    { query: { workspace_id: context.workspaceId } },
  );
  return { workspaceId: context.workspaceId, status: response.data };
}

export async function fetchScreenMyCalls10Dlc(): Promise<TenDlcState | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before managing 10DLC.");
  const response = await apiClient.get<{ data: TenDlcState | null }>(
    "/v1/integrations/screenmycalls/10dlc",
    { query: { workspace_id: context.workspaceId } },
  );
  return response.data;
}
