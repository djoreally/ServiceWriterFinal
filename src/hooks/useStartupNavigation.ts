import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { safeNextPath } from "@/lib/auth/next-path";
import { isStartupDecisionPath, resolveStartupRoute } from "@/lib/resolveStartupRoute";
import { useStartupRoutingStore } from "@/stores/startupRoutingStore";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useAppAccessGate } from "@/hooks/useAppAccessGate";

/**
 * Single source of truth for the post-login redirect decision.
 *
 * Bug history: previously this hook reset `isProfileComplete=false` on every
 * session reference change (including silent token refreshes), and any
 * profile-fetch error also collapsed to `false`. The combination randomly
 * forced already-onboarded users to /onboarding. We now:
 *   - Only reset when the user identity actually changes (login / logout /
 *     account switch) — NOT on token refreshes for the same user.
 *   - Track whether the profile lookup truly resolved; transient errors keep
 *     the prior decision instead of bouncing the user.
 */
interface UseStartupNavigationOptions {
  enabled?: boolean;
}

export function useStartupNavigation({ enabled = true }: UseStartupNavigationOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useTeamRole();
  const { decision, loading: gateLoading } = useAppAccessGate();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const { hasHydrated, intendedPath, clearIntendedPath } = useStartupRoutingStore();

  const isAuthenticated = Boolean(session);
  const requiresPlan = Boolean(
    subscription && !subscription.subscribed && subscription.status === "requires_plan",
  );
  const requiresOnboarding = decision?.reason === "onboarding_required";
  // A pending `?next=` return path (OAuth consent resume) is owned by the page
  // that received it; the shell must not redirect away from it.
  const hasPendingNext = Boolean(safeNextPath(location.search));
  const onStartupDecisionPath = isStartupDecisionPath(location.pathname) && !hasPendingNext;

  const isReady = useMemo(
    () => {
      if (!enabled) return true;
      if (!hasHydrated || authLoading) return false;
      if (!isAuthenticated) return true;
      if (!onStartupDecisionPath) return true;
      if (roleLoading) return false;
      if (role === "technician") return true;

      return !gateLoading && !subscriptionLoading && Boolean(decision) && Boolean(subscription);
    },
    [
      enabled,
      hasHydrated,
      authLoading,
      isAuthenticated,
      onStartupDecisionPath,
      roleLoading,
      role,
      gateLoading,
      subscriptionLoading,
      decision,
      subscription,
    ],
  );

  const shouldBlockRender = enabled && isAuthenticated && !isReady;

  useEffect(() => {
    if (!enabled || !isReady) return;
    if (!isAuthenticated) return;
    if (!onStartupDecisionPath) return;

    const destination = resolveStartupRoute({
      currentPath: location.pathname,
      isAuthenticated,
      requiresOnboarding,
      requiresPlan,
      persistedIntendedPath: intendedPath,
      role,
    });

    if (destination !== location.pathname) {
      navigate(destination, { replace: true });
    }

    if (destination === intendedPath && intendedPath) {
      clearIntendedPath();
    }
  }, [
    enabled,
    isReady,
    location.pathname,
    isAuthenticated,
    onStartupDecisionPath,
    requiresOnboarding,
    requiresPlan,
    intendedPath,
    role,
    clearIntendedPath,
    navigate,
  ]);

  return { isReady, shouldBlockRender };
}
