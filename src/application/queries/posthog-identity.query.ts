import { apiClient } from "@/lib/api-client";

export interface PostHogOrganizationProfile {
  business_name: string | null;
  created_at: string | null;
  onboarding_completed: boolean | null;
  marketplace_opt_in: boolean | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  sms_transactional_enabled: boolean | null;
  sms_marketing_enabled: boolean | null;
  marketing_email_enabled: boolean | null;
}

export async function fetchPostHogOrganizationProfile(
  organizationId: string,
): Promise<PostHogOrganizationProfile | null> {
  const data = await apiClient.get<PostHogOrganizationProfile | null>(
    "/v1/platform/posthog-organization",
    { query: { organization_id: organizationId } },
  );
  return data ?? null;
}
