import { supabase } from "@/integrations/supabase/client";

export interface MessagingHealthStats {
  smsEnabledTenants: number;
  marketingEmailTenants: number;
  outbound: number;
  failed: number;
  replies: number;
  optOuts: number;
  exhaustedBundles: number;
  a2pBlocked: number;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function fetchAdminMessagingHealth(): Promise<MessagingHealthStats> {
  const [outbound, failed, replies, optOuts, settingsResult] = await Promise.all([
    supabase.from("sms_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").in("status", ["sent", "delivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true }).eq("direction", "outbound").in("status", ["failed", "undelivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true }).eq("direction", "inbound").eq("message_type", "reply"),
    supabase.from("sms_opt_outs").select("id", { count: "exact", head: true }),
    supabase.from("workspace_settings").select("workspace_id, operational_settings"),
  ]);

  const firstError = [outbound, failed, replies, optOuts, settingsResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;

  let smsEnabledTenants = 0;
  let marketingEmailTenants = 0;
  let exhaustedBundles = 0;
  let a2pBlocked = 0;

  for (const row of settingsResult.data ?? []) {
    const settings = asObject(row.operational_settings);
    if (settings.sms_transactional_enabled === true || settings.sms_enabled === true) smsEnabledTenants += 1;
    if (settings.marketing_email_enabled === true) marketingEmailTenants += 1;

    const remaining = typeof settings.sms_segments_remaining === "number" ? settings.sms_segments_remaining : null;
    const overageEnabled = settings.sms_overage_enabled !== false;
    if (!overageEnabled && remaining !== null && remaining < 10) exhaustedBundles += 1;

    const a2pStatus = typeof settings.sms_a2p_status === "string" ? settings.sms_a2p_status.toLowerCase() : null;
    if (a2pStatus && !["approved", "verified", "active"].includes(a2pStatus)) a2pBlocked += 1;
  }

  return {
    smsEnabledTenants,
    marketingEmailTenants,
    outbound: outbound.count ?? 0,
    failed: failed.count ?? 0,
    replies: replies.count ?? 0,
    optOuts: optOuts.count ?? 0,
    exhaustedBundles,
    a2pBlocked,
  };
}
