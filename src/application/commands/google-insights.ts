import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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
  errors?: Record<string, string>;
}

export interface GoogleAnalyticsOverview {
  property_id: string;
  property_name?: string | null;
  days: number;
  totals: {
    activeUsers: number;
    sessions: number;
    newUsers: number;
    conversions: number;
  };
  rows: Array<{
    date: string;
    activeUsers: number;
    sessions: number;
    newUsers: number;
    conversions: number;
  }>;
}

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [{ data: { user } }, workspace] = await Promise.all([
    getCurrentAuthUser(),
    resolveCurrentWorkspace(),
  ]);
  if (!user) throw new Error("Not authenticated");
  if (!workspace?.workspaceId) throw new Error("No active workspace selected");
  const response = await apiClient.post<{ data: Record<string, unknown> | null }>(
    "/v1/platform/edge/google-insights",
    { body: { ...body, workspace_id: workspace.workspaceId } },
  );
  const data = response.data;
  if (data?.error) throw new Error(String(data.error));
  return data ?? {};
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

export const startGoogleInsightsOAuth = (redirectUri: string) =>
  invoke({ mode: "oauth_start", redirect_uri: redirectUri }) as unknown as Promise<{ url: string }>;
export const completeGoogleInsightsOAuth = (code: string, state: string, redirectUri: string) => invoke({ mode: "oauth_callback", code, state, redirect_uri: redirectUri });
export const fetchGoogleInsightsStatus = () => invoke({ mode: "status" }) as unknown as Promise<GoogleInsightsStatus>;
export const fetchGoogleInsightsResources = () => invoke({ mode: "resources" }) as unknown as Promise<GoogleInsightsResources>;
export const selectGoogleInsightsResources = (analyticsPropertyId: string | null, businessLocationId: string | null) => invoke({ mode: "select", analytics_property_id: analyticsPropertyId, business_location_id: businessLocationId });
export const fetchGoogleAnalyticsOverview = (days = 30) => invoke({ mode: "analytics_overview", days }) as unknown as Promise<GoogleAnalyticsOverview>;
export const disconnectGoogleInsights = () => invoke({ mode: "disconnect" });

export const fetchGbpOverview = () => invoke({ mode: "gbp_overview" }) as unknown as Promise<GoogleBusinessOverview>;
export const fetchGbpReviews = (pageToken?: string | null) =>
  invoke({ mode: "gbp_reviews", page_size: 20, page_token: pageToken ?? null }) as unknown as Promise<{
    reviews: GoogleBusinessReview[];
    averageRating: number | null;
    totalReviewCount: number;
    nextPageToken: string | null;
  }>;
export const fetchGbpPerformance = (days = 30) => invoke({ mode: "gbp_performance", days }) as unknown as Promise<GoogleBusinessPerformance>;
export const replyToGbpReview = (reviewId: string, comment: string) => invoke({ mode: "gbp_reply", review_id: reviewId, comment });
