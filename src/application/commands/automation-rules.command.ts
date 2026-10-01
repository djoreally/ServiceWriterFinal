/**
 * Automation Rules Commands - CRUD for retention automation rules.
 */

import { apiClient } from "@/lib/api-client";
import type { Json } from "@/integrations/supabase/types";

export interface AutomationRulePayload {
  user_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  trigger_jsonb: Json;
  actions_jsonb: Json;
  conditions_jsonb: Json | null;
  audience_jsonb: Json | null;
  frequency_guard_jsonb: Json | null;
}

export async function createAutomationRule(payload: AutomationRulePayload): Promise<void> {
  if (!payload.user_id) throw new Error("Not signed in — please refresh and try again.");
  const { user_id: _userId, ...body } = payload;
  await apiClient.post("/v1/crm/retention/automation-rules", body);
}

export async function updateAutomationRule(
  id: string,
  payload: AutomationRulePayload,
): Promise<void> {
  if (!payload.user_id) throw new Error("Not signed in — please refresh and try again.");
  const { user_id: _userId, ...body } = payload;
  await apiClient.patch(`/v1/crm/retention/automation-rules/${id}`, body);
}

/**
 * Re-runs the server-side default seeders for the current user. Idempotent —
 * skips rules/segments already present by name. Used by the "Restore Defaults" button.
 */
export async function seedAllRetentionDefaults(
  userId: string,
): Promise<{ rules: number; segments: number }> {
  if (!userId) throw new Error("Not signed in");
  const { data } = await apiClient.post<{ data: { rules: number; segments: number } }>(
    "/v1/crm/retention/seed-defaults",
    {},
  );
  return data;
}
