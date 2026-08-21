/**
 * Follow-Up Automation Query — Read operations for follow-up rules and scheduled follow-ups.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FollowUpRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_days: number;
  segment_filter: string[] | null;
  service_type_filter: string[] | null;
  churn_risk_filter: string[] | null;
  action_type: string;
  email_subject: string | null;
  email_content: string | null;
  sms_content: string | null;
  task_title: string | null;
  task_description: string | null;
  task_assignee_id: string | null;
  min_value_filter: number | null;
  max_value_filter: number | null;
  preset_key: string | null;
  is_active: boolean;
  times_triggered: number;
  conversions: number;
  last_triggered_at: string | null;
}

export interface ScheduledFollowUp {
  id: string;
  customer_name?: string;
  trigger_type: string;
  trigger_data?: Record<string, unknown> | null;
  scheduled_for: string;
  status: string;
  executed_at: string | null;
  converted: boolean;
  rule_name?: string;
}

export interface FollowUpAutomationData {
  rules: FollowUpRule[];
  scheduledFollowUps: ScheduledFollowUp[];
  segments: string[];
}

type ScheduledFollowUpRow = ScheduledFollowUp & {
  customers?: { name: string | null } | null;
  follow_up_rules?: { name: string | null } | null;
};

type CustomerSegmentNameRow = { name: string | null };

/**
 * Fetch all follow-up automation data for the current user.
 */
export async function fetchFollowUpAutomationData(): Promise<FollowUpAutomationData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const [rulesRes, scheduledRes, segmentRes] = await Promise.all([
    supabase
      .from("follow_up_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("scheduled_follow_ups")
      .select(`*, customers(name), follow_up_rules(name)`)
      .eq("user_id", user.id)
      .order("scheduled_for", { ascending: true })
      .limit(100),
    supabase
      .from("customer_segments")
      .select("name")
      .eq("user_id", user.id),
  ]);

  if (rulesRes.error) throw rulesRes.error;
  if (scheduledRes.error) throw scheduledRes.error;

  const scheduledRows = (scheduledRes.data || []) as ScheduledFollowUpRow[];
  const segmentRows = (segmentRes.data || []) as CustomerSegmentNameRow[];

  const scheduledFollowUps = scheduledRows.map((scheduled) => ({
    ...scheduled,
    customer_name: scheduled.customers?.name || "Unknown",
    rule_name: scheduled.follow_up_rules?.name || "Manual",
  }));

  return {
    rules: rulesRes.data as FollowUpRule[],
    scheduledFollowUps,
    segments: segmentRows.flatMap((segment) => (segment.name ? [segment.name] : [])),
  };
}
