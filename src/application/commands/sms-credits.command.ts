/**
 * SMS Credits Commands — checkout for prepaid credit packs, low-balance
 * threshold, and test sends through the single `send-sms` outbound door.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function startSmsCreditCheckout(bundleKey: string): Promise<{ url?: string }> {
  const { data, error } = await supabase.functions.invoke("create-messaging-addon-checkout", {
    body: { bundleKey },
  });
  if (error) throw error;
  return (data ?? {}) as { url?: string };
}

export async function updateSmsLowBalanceThreshold(threshold: number): Promise<void> {
  const { data: userData } = await getCurrentAuthUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase
    .from("business_profiles")
    .update({ sms_low_balance_threshold: Math.max(0, Math.round(threshold)) })
    .eq("user_id", uid);
  if (error) throw error;
}

/**
 * Turn texting on or off for the workspace. These flags are what the backend
 * `consume_sms_credits_v1` gate checks — a disabled channel refuses with
 * `channel_disabled` before any credits are reserved.
 */
export async function updateSmsChannelToggles(patch: {
  transactional?: boolean;
  marketing?: boolean;
}): Promise<void> {
  const { data: userData } = await getCurrentAuthUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not signed in");
  const update: { sms_transactional_enabled?: boolean; sms_marketing_enabled?: boolean } = {};
  if (typeof patch.transactional === "boolean") update.sms_transactional_enabled = patch.transactional;
  if (typeof patch.marketing === "boolean") update.sms_marketing_enabled = patch.marketing;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("business_profiles").update(update).eq("user_id", uid);
  if (error) throw error;
}



export interface SendSmsResponse {
  sent: boolean;
  reason?: string;
  segments?: number;
  available?: number;
  details?: string;
}

export async function sendTestSms(to: string, message: string): Promise<SendSmsResponse> {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: { to, message, messageClass: "transactional", messageType: "test" },
  });
  if (error) throw error;
  return (data ?? { sent: false }) as SendSmsResponse;
}
