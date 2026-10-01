/**
 * Onboarding Wizard Query — Read-only data access for onboarding.
 * All write operations have been moved to onboarding-wizard.command.ts.
 */
import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get the current user ID and email. */
export async function getOnboardingUser(): Promise<{ id: string; email: string } | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  return { id: user.id, email: user.email || "" };
}

/** Load existing business profile for onboarding. */
export interface OnboardingProfileRow {
  business_name: string | null;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  service_address: string | null;
  service_radius_miles: number | null;
  timezone: string | null;
  service_coordinates: unknown;
  day_hours: unknown;
  website_url?: string | null;
  onboarding_step: number | null;
}

export async function loadOnboardingProfile(userId: string) {
  return apiClient.get<OnboardingProfileRow | null>("/v1/platform/onboarding/profile");
}
