import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase
    .from("business_profiles")
    .select("business_name, created_at, onboarding_completed, marketplace_opt_in, stripe_onboarding_complete, stripe_charges_enabled, sms_transactional_enabled, sms_marketing_enabled, marketing_email_enabled")
    .eq("user_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
