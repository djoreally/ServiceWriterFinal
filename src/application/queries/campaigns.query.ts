/**
 * Campaign Queries — Read operations for email marketing campaigns.
 */
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatus } from "@/lib/enums";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export interface CampaignRow {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  content: string;
  recipient_type: string;
  recipient_ids: string[] | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at?: string | null;
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

type CampaignDbRow = Omit<CampaignRow,
  "status" | "recipient_count" | "open_count" | "click_count" |
  "delivered_count" | "failed_count" | "reply_count" | "opt_out_count" |
  "conversion_count" | "last_engagement_at"
> & {
  status: string | null;
  recipient_count: number | null;
  open_count: number | null;
  click_count: number | null;
  delivered_count?: number | null;
  failed_count?: number | null;
  reply_count?: number | null;
  opt_out_count?: number | null;
  conversion_count?: number | null;
  last_engagement_at?: string | null;
};

export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const user = await requireUser();
  const result = await supabase
    .from("email_marketing_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }) as unknown as {
      data: CampaignDbRow[] | null;
      error: Error | null;
    };
  if (result.error) throw result.error;
  return (result.data ?? []).map((row): CampaignRow => ({
    ...row,
    status: row.status as CampaignStatus,
    recipient_count: row.recipient_count ?? 0,
    open_count: row.open_count ?? 0,
    click_count: row.click_count ?? 0,
    delivered_count: row.delivered_count ?? 0,
    failed_count: row.failed_count ?? 0,
    reply_count: row.reply_count ?? 0,
    opt_out_count: row.opt_out_count ?? 0,
    conversion_count: row.conversion_count ?? 0,
    last_engagement_at: row.last_engagement_at ?? null,
  }));
}

export async function fetchCampaignCustomerCount(): Promise<number> {
  const context = await resolveCurrentWorkspace();
  if (!context) return 0;
  const result = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", context.workspaceId)
    .neq("status", "archived")
    .not("email", "is", null) as unknown as { count: number | null; error: Error | null };
  if (result.error) throw result.error;
  return result.count ?? 0;
}
