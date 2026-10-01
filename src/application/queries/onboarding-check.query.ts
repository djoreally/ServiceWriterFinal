/**
 * Onboarding check query - determines if user needs onboarding
 */
import { apiClient } from "@/lib/api-client";

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
  return apiClient.get<OnboardingCheckResult>("/v1/platform/onboarding/status");
}
