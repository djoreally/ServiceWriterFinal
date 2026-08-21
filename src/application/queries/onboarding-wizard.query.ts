/**
 * Onboarding Wizard Query — Read-only data access for onboarding.
 * All write operations have been moved to onboarding-wizard.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get the current user ID and email. */
export async function getOnboardingUser(): Promise<{ id: string; email: string } | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  return { id: user.id, email: user.email || "" };
}

/** Load existing business profile for onboarding. */
export async function loadOnboardingProfile(userId: string) {
  const { data } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}
