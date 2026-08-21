/**
 * Billing Settings Query — messaging usage counters shown on the
 * BillingSettings card.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface MessagingStats {
  outbound: number;
  failed: number;
  replies: number;
  optOuts: number;
}

export async function fetchMessagingStats(): Promise<MessagingStats> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { outbound: 0, failed: 0, replies: 0, optOuts: 0 };
  const [outbound, failed, replies, optOuts] = await Promise.all([
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "outbound").in("status", ["sent", "delivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "outbound").in("status", ["failed", "undelivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "inbound").eq("message_type", "reply"),
    supabase.from("sms_opt_outs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  return {
    outbound: outbound.count ?? 0,
    failed: failed.count ?? 0,
    replies: replies.count ?? 0,
    optOuts: optOuts.count ?? 0,
  };
}
