/** Follow-Up Automation Query — canonical workspace reads. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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

export async function fetchFollowUpAutomationData(): Promise<FollowUpAutomationData> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const { data } = await apiClient.get<{ data: FollowUpAutomationData }>("/v1/crm/follow-up", {
    query: { workspace_id: context.workspaceId },
  });
  return data;
}
