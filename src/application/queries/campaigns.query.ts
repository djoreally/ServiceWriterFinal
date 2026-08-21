/**
 * Campaign Queries — Read operations for email marketing campaigns.
 */
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatus } from "@/lib/enums";
import type { Database } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

type CampaignTableRow = Database["public"]["Tables"]["email_marketing_campaigns"]["Row"];

export interface CampaignRow extends Omit<CampaignTableRow, "status" | "recipient_count" | "open_count" | "click_count"> {
  status: CampaignStatus;
  recipient_count: number;
  open_count: number;
  click_count: number;
  delivered_count: number;
  failed_count: number;
  reply_count: number;
  opt_out_count: number;
  conversion_count: number;
  last_engagement_at: string | null;
}

export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("email_marketing_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const rollup = row as CampaignTableRow & {
      delivered_count?: number | null;
      failed_count?: number | null;
      reply_count?: number | null;
      opt_out_count?: number | null;
      conversion_count?: number | null;
      last_engagement_at?: string | null;
    };
    return {
      ...row,
      status: row.status as CampaignStatus,
      recipient_count: row.recipient_count ?? 0,
      open_count: row.open_count ?? 0,
      click_count: row.click_count ?? 0,
      delivered_count: rollup.delivered_count ?? 0,
      failed_count: rollup.failed_count ?? 0,
      reply_count: rollup.reply_count ?? 0,
      opt_out_count: rollup.opt_out_count ?? 0,
      conversion_count: rollup.conversion_count ?? 0,
      last_engagement_at: rollup.last_engagement_at ?? null,
    };
  });
}

export async function fetchCampaignCustomerCount(): Promise<number> {
  const user = await requireUser();
  const { count } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("email", "is", null);
  return count ?? 0;
}
