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

export async function fetchAdminMessagingHealth(): Promise<MessagingHealthStats> {
  const [outbound, failed, replies, optOuts] = await Promise.all([
    supabase
      .from("sms_logs")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .in("status", ["sent", "delivered"]),
    supabase
      .from("sms_logs")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .in("status", ["failed", "undelivered"]),
    supabase
      .from("sms_logs")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("message_type", "reply"),
    supabase
      .from("sms_opt_outs")
      .select("id", { count: "exact", head: true }),
  ]);

  const [smsTenants, marketingTenants, exhaustedBundles, a2pBlocked] = await Promise.all([
    (supabase.from("business_profiles") as any)
      .select("user_id", { count: "exact", head: true })
      .eq("sms_enabled", true),
    (supabase.from("business_profiles") as any)
      .select("user_id", { count: "exact", head: true })
      .eq("marketing_email_enabled", true),
    (supabase.from("business_profiles") as any)
      .select("user_id", { count: "exact", head: true })
      .eq("sms_overage_enabled", false)
      .lt("sms_segments_remaining", 10),
    (supabase.from("business_profiles") as any)
      .select("user_id", { count: "exact", head: true })
      .not("sms_a2p_status", "in", '("approved","verified","active")'),
  ]);

  const firstError = [smsTenants, marketingTenants, outbound, failed, replies, optOuts, exhaustedBundles, a2pBlocked].find((result) => result.error)?.error;
  if (firstError) throw firstError;

  return {
    smsEnabledTenants: smsTenants.count ?? 0,
    marketingEmailTenants: marketingTenants.count ?? 0,
    outbound: outbound.count ?? 0,
    failed: failed.count ?? 0,
    replies: replies.count ?? 0,
    optOuts: optOuts.count ?? 0,
    exhaustedBundles: exhaustedBundles.count ?? 0,
    a2pBlocked: a2pBlocked.count ?? 0,
  };
}
