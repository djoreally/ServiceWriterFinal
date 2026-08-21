import { supabase } from "@/integrations/supabase/client";

export const GOOGLE_INSIGHTS_REDIRECT_PATH = "/google-calendar/callback";

export interface GoogleInsightsStatus {
  connected: boolean;
  analytics_property_id?: string | null;
  analytics_property_name?: string | null;
  business_location_id?: string | null;
  business_location_name?: string | null;
  last_synced_at?: string | null;
  last_sync_error?: string | null;
}

export interface GoogleInsightsResources {
  analytics: Array<{ id: string; name: string; account: string }>;
  businessAccounts: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string; accountId: string }>;
  /** Per-source Google failures (API not enabled, missing grant, quota) — surfaced, never swallowed. */
  errors?: Record<string, string>;
}

async function invoke(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke("google-insights", { headers: { Authorization: `Bearer ${session.access_token}` }, body });
  if (error) {
    // invoke reports every non-2xx as a generic message — read the real error body.
    const context = (error as { context?: { text?: () => Promise<string> } }).context;
    if (context?.text) {
      const raw = await context.text().catch(() => "");
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) throw new Error(parsed.error);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message && !(parseError instanceof SyntaxError)) throw parseError;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export interface GoogleBusinessReview {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export interface GoogleBusinessOverview {
  location?: Record<string, unknown>;
  location_name?: string | null;
  averageRating: number | null;
  totalReviewCount: number;
}

export interface GoogleBusinessPerformance {
  days: number;
  totals: Record<string, number>;
  impressions: number;
  callClicks: number;
  websiteClicks: number;
  directionRequests: number;
}

export const startGoogleInsightsOAuth = (redirectUri: string) => invoke({ mode: "oauth_start", redirect_uri: redirectUri });
export const completeGoogleInsightsOAuth = (code: string, state: string, redirectUri: string) => invoke({ mode: "oauth_callback", code, state, redirect_uri: redirectUri });
export const fetchGoogleInsightsStatus = () => invoke({ mode: "status" }) as Promise<GoogleInsightsStatus>;
export const fetchGoogleInsightsResources = () => invoke({ mode: "resources" }) as Promise<GoogleInsightsResources>;
export const selectGoogleInsightsResources = (analyticsPropertyId: string | null, businessLocationId: string | null) => invoke({ mode: "select", analytics_property_id: analyticsPropertyId, business_location_id: businessLocationId });
export const disconnectGoogleInsights = () => invoke({ mode: "disconnect" });

/** Google Business Profile monitoring */
export const fetchGbpOverview = () => invoke({ mode: "gbp_overview" }) as Promise<GoogleBusinessOverview>;
export const fetchGbpReviews = (pageToken?: string | null) =>
  invoke({ mode: "gbp_reviews", page_size: 20, page_token: pageToken ?? null }) as Promise<{
    reviews: GoogleBusinessReview[];
    averageRating: number | null;
    totalReviewCount: number;
    nextPageToken: string | null;
  }>;
export const fetchGbpPerformance = (days = 30) => invoke({ mode: "gbp_performance", days }) as Promise<GoogleBusinessPerformance>;
export const replyToGbpReview = (reviewId: string, comment: string) => invoke({ mode: "gbp_reply", review_id: reviewId, comment });

