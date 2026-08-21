/**
 * Automation Rules Commands - CRUD for retention automation rules.
 */

import { supabase } from "@/integrations/supabase/client";
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
  const { error } = await supabase.from("automation_rules").insert(payload);
  if (error) throw new Error(error.message);
}

export async function updateAutomationRule(
  id: string,
  payload: AutomationRulePayload,
): Promise<void> {
  if (!payload.user_id) throw new Error("Not signed in — please refresh and try again.");
  const { error } = await supabase.from("automation_rules").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Re-runs the server-side default seeders for the current user. Idempotent —
 * skips rules/segments already present by name. Used by the "Restore Defaults" button.
 */
export async function seedAllRetentionDefaults(
  userId: string,
): Promise<{ rules: number; segments: number }> {
  if (!userId) throw new Error("Not signed in");
  const [rulesRes, segsRes] = await Promise.all([
    supabase.rpc("seed_default_automation_rules", { p_user_id: userId }),
    supabase.rpc("seed_default_customer_segments", { p_user_id: userId }),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (segsRes.error) throw new Error(segsRes.error.message);
  return { rules: (rulesRes.data as number) ?? 0, segments: (segsRes.data as number) ?? 0 };
}
