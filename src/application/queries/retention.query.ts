/**
 * Retention engine queries — Read operations for signals, vehicle profiles, loyalty, automation.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function fetchRetentionSignals(userId: string) {
  const { data } = await apiClient.get<{ data: any[] }>("/v1/crm/retention/signals");
  return data;
}

export async function fetchRetentionVehicleProfiles(userId: string) {
  const { data } = await apiClient.get<{ data: any[] }>("/v1/crm/retention/vehicle-profiles");
  return data;
}

async function loyaltyWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function fetchLoyaltyPrograms(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data } = await apiClient.get<{ data: any[] }>("/v1/crm/loyalty/programs", {
    query: { workspace_id: workspaceId },
  });
  return (data ?? []).map((row: any) => ({ ...row, earn_rules_jsonb: { points_per_dollar: Number(row.points_per_dollar ?? 0), points_per_visit: Number(row.points_per_visit ?? 0) } }));
}

export async function fetchLoyaltyRewards(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data } = await apiClient.get<{ data: any[] }>("/v1/crm/loyalty/rewards", {
    query: { workspace_id: workspaceId },
  });
  return (data ?? []).map((row: any) => ({ ...row, config_jsonb: row.config ?? {} }));
}

export async function fetchLoyaltyAccountStats(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data } = await apiClient.get<{ data: { active: number; total: number; totalPoints: number } }>(
    "/v1/crm/loyalty/accounts/stats",
    { query: { workspace_id: workspaceId } },
  );
  return data;
}

export async function fetchAutomationRules(userId: string) {
  const { data } = await apiClient.get<{ data: any[] }>("/v1/crm/retention/automation-rules");
  return data;
}

export async function fetchJobQueueStats(userId: string) {
  const { data } = await apiClient.get<{ data: Array<{ status: string }> }>("/v1/crm/retention/job-queue/stats");
  return data;
}

export interface JobQueueHealth { idle: boolean; running: number; pending: number; failed: number; lastJobAt: string | null; }

export async function fetchJobQueueHealth(userId: string): Promise<JobQueueHealth> {
  const { data } = await apiClient.get<{ data: JobQueueHealth }>("/v1/crm/retention/job-queue/health");
  return data;
}
