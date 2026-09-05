/**
 * Link Health Query — canonical workspace link fields for validation.
 */

import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await productionSupabase
    .from("workspace_settings")
    .select("booking_slug, google_review_url, yelp_review_url, website_url")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();

  return { data: data as BusinessLinkData | null, error };
}
