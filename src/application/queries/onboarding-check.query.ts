/** Onboarding check — canonical workspace membership/settings contract. */
import { productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface OnboardingCheckResult {
  authenticated: boolean;
  onboardingCompleted: boolean;
}

export async function checkOnboardingStatus(): Promise<OnboardingCheckResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { authenticated: false, onboardingCompleted: false };

  const context = await resolveCurrentWorkspace();
  if (!context) return { authenticated: true, onboardingCompleted: false };

  const [{ data: membership, error: membershipError }, { data: settings, error: settingsError }] = await Promise.all([
    productionSupabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    productionSupabase
      .from("workspace_settings")
      .select("operational_settings")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
  ]);
  if (membershipError) throw membershipError;
  if (settingsError) throw settingsError;

  if (membership && membership.role !== "owner") {
    return { authenticated: true, onboardingCompleted: true };
  }

  const operational = settings?.operational_settings;
  const completed = Boolean(
    operational && typeof operational === "object" && !Array.isArray(operational)
      && (operational as Record<string, unknown>).onboarding_completed === true,
  );
  return { authenticated: true, onboardingCompleted: completed };
}
