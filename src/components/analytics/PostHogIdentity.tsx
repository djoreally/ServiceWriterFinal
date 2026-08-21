import { useEffect } from "react";
import { usePostHog } from "@posthog/react";
import { useAuth } from "@packages/auth";
import { fetchPostHogOrganizationProfile } from "@/application/queries/posthog-identity.query";
import { useTeamRole } from "@/hooks/useTeamRole";

const INTERNAL_EMAILS = new Set(
  (import.meta.env.VITE_POSTHOG_INTERNAL_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

const TEST_EMAIL_PATTERN = /(\+test@|@example\.com$|@test\.com$)/i;

function isInternalOrTestUser(email?: string | null) {
  if (!email) return false;
  const normalized = email.toLowerCase();
  return INTERNAL_EMAILS.has(normalized) || TEST_EMAIL_PATTERN.test(normalized);
}

export function PostHogIdentity(): null {
  const posthog = usePostHog();
  const { session, user, loading: authLoading } = useAuth();
  const { role, ownerUserId, loading: roleLoading } = useTeamRole();

  useEffect(() => {
    if (!posthog || authLoading || roleLoading) return;

    if (!session?.user || !user) {
      posthog.reset?.();
      return;
    }

    if (isInternalOrTestUser(user.email)) {
      posthog.opt_out_capturing?.();
      return;
    }

    posthog.opt_in_capturing?.();

    const organizationId = ownerUserId ?? user.id;
    let cancelled = false;

    posthog.identify(user.id, {
      role: role ?? "unknown",
      account_created_at: user.created_at,
      onboarding_status: user.user_metadata?.onboarding_status ?? "unknown",
    });

    async function bindOrganization() {
      const profile = await fetchPostHogOrganizationProfile(organizationId).catch((): null => null);

      if (cancelled) return;

      posthog.group("organization", organizationId, {
        organization_name: profile?.business_name ?? null,
        subscription_plan: null,
        subscription_status: null,
        trial_started_at: null,
        trial_expires_at: null,
        team_size: null,
        location_count: null,
        customer_count: null,
        appointment_count: null,
        monthly_job_volume: null,
        marketplace_enabled: Boolean(profile?.marketplace_opt_in),
        stripe_connected: Boolean(profile?.stripe_onboarding_complete || profile?.stripe_charges_enabled),
        terminal_enabled: false,
        sms_enabled: Boolean(profile?.sms_transactional_enabled || profile?.sms_marketing_enabled),
        newsletter_enabled: Boolean(profile?.marketing_email_enabled),
        onboarding_completed: Boolean(profile?.onboarding_completed),
        first_value_at: null,
        created_at: profile?.created_at ?? null,
      });
    }

    void bindOrganization();

    return () => {
      cancelled = true;
    };
  }, [authLoading, ownerUserId, posthog, role, roleLoading, session?.user, user]);

  return null;
}
