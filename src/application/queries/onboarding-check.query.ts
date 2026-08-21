/**
 * Onboarding check query - determines if user needs onboarding
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface OnboardingCheckResult {
  authenticated: boolean;
  onboardingCompleted: boolean;
}

export async function checkOnboardingStatus(): Promise<OnboardingCheckResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { authenticated: false, onboardingCompleted: false };

  // Team members (manager/dispatcher/technician) belong to someone else's tenant.
  // They never go through onboarding — that's the owner's responsibility.
  const { data: link } = await supabase
    .from("team_user_links")
    .select("id")
    .eq("member_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (link) {
    return { authenticated: true, onboardingCompleted: true };
  }

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    authenticated: true,
    onboardingCompleted: !!profile?.onboarding_completed,
  };
}
