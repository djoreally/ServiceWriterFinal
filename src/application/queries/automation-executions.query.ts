/**
 * Queries for the automation Execution Log tab.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AutomationExecutionRow {
  id: string;
  rule_id: string | null;
  rule_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  action_type: string;
  status: string;
  executed_at: string | null;
  result_jsonb: Record<string, unknown> | null;
}

/**
 * Recent automation rule executions joined with rule + customer names.
 */
export async function fetchAutomationExecutions(
  userId: string,
  limit = 50,
): Promise<AutomationExecutionRow[]> {
  const { data, error } = await supabase
    .from("retention_action_executions")
    .select("id, rule_id, customer_id, action_type, status, executed_at, result_jsonb, automation_rules(name), customers(name)")
    .eq("user_id", userId)
    .order("executed_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((row) => {
    const ruleRel = row.automation_rules as { name?: string } | null;
    const custRel = row.customers as { name?: string } | null;
    return {
      id: row.id,
      rule_id: row.rule_id,
      rule_name: ruleRel?.name ?? null,
      customer_id: row.customer_id,
      customer_name: custRel?.name ?? null,
      action_type: row.action_type,
      status: row.status,
      executed_at: row.executed_at,
      result_jsonb: row.result_jsonb as Record<string, unknown> | null,
    };
  });
}
