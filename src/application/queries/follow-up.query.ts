/** Follow-Up Automation Query — canonical workspace reads. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface FollowUpRule {
  id: string; name: string; description: string | null; trigger_type: string; trigger_days: number;
  segment_filter: string[] | null; service_type_filter: string[] | null; churn_risk_filter: string[] | null;
  action_type: string; email_subject: string | null; email_content: string | null; sms_content: string | null;
  task_title: string | null; task_description: string | null; task_assignee_id: string | null;
  min_value_filter: number | null; max_value_filter: number | null; preset_key: string | null; is_active: boolean;
  times_triggered: number; conversions: number; last_triggered_at: string | null;
}
export interface ScheduledFollowUp {
  id: string; customer_name?: string; trigger_type: string; trigger_data?: Record<string, unknown> | null;
  scheduled_for: string; status: string; executed_at: string | null; converted: boolean; rule_name?: string;
}
export interface FollowUpAutomationData { rules: FollowUpRule[]; scheduledFollowUps: ScheduledFollowUp[]; segments: string[]; }

function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export async function fetchFollowUpAutomationData(): Promise<FollowUpAutomationData> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const [rulesRes, scheduledRes, segmentRes] = await Promise.all([
    db.from("follow_up_rules").select("*").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }),
    db.from("scheduled_follow_ups")
      .select("*,customers(first_name,last_name,company_name),follow_up_rules(name)")
      .eq("workspace_id", context.workspaceId).order("scheduled_for", { ascending: true }).limit(100),
    db.from("customer_segments").select("name").eq("workspace_id", context.workspaceId).eq("is_active", true),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (scheduledRes.error) throw scheduledRes.error;
  if (segmentRes.error) throw segmentRes.error;
  const scheduledFollowUps = (scheduledRes.data ?? []).map((row: any) => {
    const customer = one<any>(row.customers);
    const rule = one<any>(row.follow_up_rules);
    return {
      ...row,
      customer_name: customer ? ([customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || "Unknown") : "Unknown",
      rule_name: rule?.name || "Manual",
    } as ScheduledFollowUp;
  });
  return {
    rules: (rulesRes.data ?? []) as FollowUpRule[],
    scheduledFollowUps,
    segments: (segmentRes.data ?? []).flatMap((row: any) => row.name ? [String(row.name)] : []),
  };
}
