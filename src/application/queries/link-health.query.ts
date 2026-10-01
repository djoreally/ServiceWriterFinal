/**
 * Link Health Query — Fetches business link fields for validation
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BusinessLinkData {
  booking_slug: string | null;
  google_review_url: string | null;
  yelp_review_url: string | null;
  website_url: string | null;
}

export async function fetchBusinessLinks(): Promise<{
  data: BusinessLinkData | null;
  error: unknown;
}> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) return { data: null, error: new Error("Not authenticated") };

  return apiClient.get("/v1/platform/link-health");
}
