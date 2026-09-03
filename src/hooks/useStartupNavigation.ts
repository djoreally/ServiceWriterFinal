import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { safeNextPath } from "@/lib/auth/next-path";
import { isStartupDecisionPath, resolveStartupRoute } from "@/lib/resolveStartupRoute";
import { useStartupRoutingStore } from "@/stores/startupRoutingStore";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useAppAccessGate } from "@/hooks/useAppAccessGate";

/** Single source of truth for post-login startup routing. */
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
  const customerPortalMarker = session?.user?.user_metadata?.servicewriter_portal === "customer";
  // A real workforce role always wins if the same email also has customer history.
  const isCustomerPortalUser = !roleLoading && !role && customerPortalMarker;
  const requiresPlan = Boolean(
    subscription && !subscription.subscribed && subscription.status === "requires_plan",
  );
  const requiresOnboarding = decision?.reason === "onboarding_required";
  const hasPendingNext = Boolean(safeNextPath(location.search));
  const onStartupDecisionPath = isStartupDecisionPath(location.pathname) && !hasPendingNext;

  const isReady = useMemo(
    () => {
      if (!enabled) return true;
      if (!hasHydrated || authLoading) return false;
      if (!isAuthenticated) return true;
      if (!onStartupDecisionPath) return true;
      if (roleLoading) return false;
      if (role === "technician" || isCustomerPortalUser) return true;

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
      isCustomerPortalUser,
      gateLoading,
      subscriptionLoading,
      decision,
      subscription,
    ],
  );

  const shouldBlockRender = enabled && isAuthenticated && !isReady;

  useEffect(() => {
    if (!enabled || !isReady || !isAuthenticated || !onStartupDecisionPath) return;

    const destination = isCustomerPortalUser
      ? "/customer/dashboard"
      : resolveStartupRoute({
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
    isCustomerPortalUser,
    requiresOnboarding,
    requiresPlan,
    intendedPath,
    role,
    clearIntendedPath,
    navigate,
  ]);

  return { isReady, shouldBlockRender };
}
