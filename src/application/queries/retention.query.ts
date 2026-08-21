/**
 * Retention engine queries — Read operations for signals, vehicle profiles, loyalty, automation.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchRetentionSignals(userId: string) {
  const { data, error } = await supabase
    .from("retention_signals")
    .select("*")
    .eq("user_id", userId)
    .order("detected_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function fetchRetentionVehicleProfiles(userId: string) {
  const { data, error } = await supabase
    .from("retention_vehicle_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("days_overdue", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function fetchLoyaltyPrograms(userId: string) {
  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchLoyaltyRewards(userId: string) {
  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("*")
    .eq("user_id", userId)
    .order("points_required", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchLoyaltyAccountStats(userId: string) {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("status, points_balance")
    .eq("user_id", userId);
  if (error) throw error;
  const active = data?.filter((a) => a.status === "active").length || 0;
  const totalPoints = data?.reduce((sum, a) => sum + ((a.points_balance as number) || 0), 0) || 0;
  return { active, total: data?.length || 0, totalPoints };
}

export async function fetchAutomationRules(userId: string) {
  const { data, error } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchJobQueueStats(userId: string) {
  const { data, error } = await supabase
    .from("job_queue")
    .select("status")
    .eq("user_id", userId)
    .limit(500);
  if (error) throw error;
  return data;
}

export interface JobQueueHealth {
  idle: boolean;
  running: number;
  pending: number;
  failed: number;
  lastJobAt: string | null;
}

/**
 * Live status of the retention worker queue. Polled every ~10s by the page header.
 */
export async function fetchJobQueueHealth(userId: string): Promise<JobQueueHealth> {
  const { data, error } = await supabase
    .from("job_queue")
    .select("status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
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

  return {
    idle: running === 0 && pending === 0,
    running,
    pending,
    failed,
    lastJobAt,
  };
}
