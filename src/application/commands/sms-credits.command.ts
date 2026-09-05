/** SMS credit/settings commands. Workspace preferences live in operational_settings. */
import { supabase, productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { Json } from "@/integrations/supabase/types.production";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function patchSmsSettings(patch: Record<string, unknown>): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Not signed in");
  const { data, error: readError } = await productionSupabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) throw readError;
  const operational = { ...object(data?.operational_settings), ...patch };
  const { error } = await productionSupabase
    .from("workspace_settings")
    .update({ operational_settings: operational as Json })
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;
}

export async function startSmsCreditCheckout(bundleKey: string): Promise<{ url?: string }> {
  const { data, error } = await supabase.functions.invoke("create-messaging-addon-checkout", { body: { bundleKey } });
  if (error) throw error;
  return (data ?? {}) as { url?: string };
}

export async function updateSmsLowBalanceThreshold(threshold: number): Promise<void> {
  await patchSmsSettings({ sms_low_balance_threshold: Math.max(0, Math.round(threshold)) });
}

export async function updateSmsChannelToggles(patch: { transactional?: boolean; marketing?: boolean }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (typeof patch.transactional === "boolean") update.sms_transactional_enabled = patch.transactional;
  if (typeof patch.marketing === "boolean") update.sms_marketing_enabled = patch.marketing;
  if (Object.keys(update).length > 0) await patchSmsSettings(update);
}

export interface SendSmsResponse { sent: boolean; reason?: string; segments?: number; available?: number; details?: string }
export async function sendTestSms(to: string, message: string): Promise<SendSmsResponse> {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: { to, message, messageClass: "transactional", messageType: "test" },
  });
  if (error) throw error;
  return (data ?? { sent: false }) as SendSmsResponse;
}
