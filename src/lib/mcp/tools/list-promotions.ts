import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { errorResult, jsonResult, limitSchema, resolveLimit } from "../shared/schema";

export default defineTool({
  name: "list_promotions",
  title: "List promotions and campaigns",
  description:
    "List the promotional truth that already exists in ServiceWriter: coupon codes (code, description, discount type/value, minimum order, usage count vs max uses, validity window, active flag) and email marketing campaigns (name, subject, status, schedule and send/engagement counters where recorded). Use `active_only` to limit to currently valid coupons. This tool reports existing ServiceWriter promotions only — it does not create campaigns and is not a campaign system of record for any external marketing tool.",
  inputSchema: {
    active_only: z.boolean().optional().describe("Only coupons flagged active and inside their validity window (default true)."),
    include_campaigns: z.boolean().optional().describe("Include email marketing campaigns (default true)."),
    limit: limitSchema(50, 200),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, include_campaigns, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const take = resolveLimit(limit, 50, 200);
    const supabase = supabaseForUser(ctx);
    const activeOnly = active_only !== false;
    const wantCampaigns = include_campaigns !== false;
    const nowIso = new Date().toISOString();

    let coupons = supabase
      .from("coupon_codes")
      .select(
        "id, code, description, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until, is_active, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(take);
    if (activeOnly) {
      coupons = coupons.eq("is_active", true).or(`valid_until.is.null,valid_until.gte.${nowIso}`);
    }

    const [couponRes, campaignRes] = await Promise.all([
      coupons,
      wantCampaigns
        ? supabase
            .from("email_marketing_campaigns")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(take)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    if (couponRes.error) return errorResult(couponRes.error.message);

    // Return only business-relevant campaign fields; never echo raw HTML bodies or recipient lists.
    const campaigns = ((campaignRes.data ?? []) as Array<Record<string, any>>).map((row) => ({
      id: row.id,
      name: row.name ?? row.campaign_name ?? null,
      subject: row.subject ?? row.subject_line ?? null,
      status: row.status ?? null,
      scheduled_at: row.scheduled_at ?? row.scheduled_for ?? null,
      sent_at: row.sent_at ?? null,
      recipient_count: row.recipient_count ?? row.total_recipients ?? null,
      sent_count: row.sent_count ?? null,
      opened_count: row.opened_count ?? row.open_count ?? null,
      clicked_count: row.clicked_count ?? row.click_count ?? null,
      created_at: row.created_at ?? null,
    }));

    return jsonResult({
      coupons: couponRes.data ?? [],
      campaigns: wantCampaigns
        ? campaignRes.error
          ? { available: false, reason: campaignRes.error.message }
          : campaigns
        : null,
      limitations: [
        "ServiceWriter tracks coupon redemption as an aggregate `used_count`; per-coupon attributed revenue is not stored.",
        "Campaign engagement counters are only present where the email pipeline recorded them; nulls mean not tracked, not zero.",
      ],
    });
  },
});
