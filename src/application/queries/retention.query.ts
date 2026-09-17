/**
 * Retention engine queries — Read operations for signals, vehicle profiles, loyalty, automation.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function fetchRetentionSignals(userId: string) {
  const { data, error } = await supabase.from("retention_signals").select("*").eq("user_id", userId).order("detected_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function fetchRetentionVehicleProfiles(userId: string) {
  const { data, error } = await supabase.from("retention_vehicle_profiles").select("*").eq("user_id", userId).order("days_overdue", { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

async function loyaltyWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function fetchLoyaltyPrograms(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data, error } = await (supabase as any).from("crm_loyalty_programs").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, earn_rules_jsonb: { points_per_dollar: Number(row.points_per_dollar ?? 0), points_per_visit: Number(row.points_per_visit ?? 0) } }));
}

export async function fetchLoyaltyRewards(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data, error } = await (supabase as any).from("crm_loyalty_rewards").select("*").eq("workspace_id", workspaceId).order("points_required", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, config_jsonb: row.config ?? {} }));
}

export async function fetchLoyaltyAccountStats(_userId: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { data, error } = await (supabase as any).from("crm_loyalty_accounts").select("current_points").eq("workspace_id", workspaceId);
  if (error) throw error;
  const totalPoints = (data ?? []).reduce((sum: number, row: any) => sum + Number(row.current_points ?? 0), 0);
  return { active: data?.length || 0, total: data?.length || 0, totalPoints };
}

export async function fetchAutomationRules(userId: string) {
  const { data, error } = await supabase.from("automation_rules").select("*").eq("user_id", userId).order("priority", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchJobQueueStats(userId: string) {
  const { data, error } = await supabase.from("job_queue").select("status").eq("user_id", userId).limit(500);
  if (error) throw error;
  return data;
}

export interface JobQueueHealth { idle: boolean; running: number; pending: number; failed: number; lastJobAt: string | null; }

export async function fetchJobQueueHealth(userId: string): Promise<JobQueueHealth> {
  const { data, error } = await supabase.from("job_queue").select("status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  let running = 0;
  let pending = 0;
  let failed = 0;
  let lastJobAt: string | null = null;
  for (const row of data || []) {
    const status = row.status as string;
    if (!lastJobAt && row.created_at) lastJobAt = row.created_at as string;
    if (status === "running" || status === "in_progress") running++;
    else if (status === "pending" || status === "queued") pending++;
    else if (status === "failed" || status === "dead_letter") failed++;
  }
  return { idle: running === 0 && pending === 0, running, pending, failed, lastJobAt };
}
