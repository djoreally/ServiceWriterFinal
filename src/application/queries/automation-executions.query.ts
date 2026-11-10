/**
 * Queries for the automation Execution Log tab.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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
  _userId: string,
  limit = 50,
): Promise<AutomationExecutionRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const { data } = await apiClient.get<{ data: AutomationExecutionRow[] }>(
    "/v1/crm/retention/automation-executions",
    { query: { workspace_id: context.workspaceId, limit } },
  );
  return data ?? [];
}
