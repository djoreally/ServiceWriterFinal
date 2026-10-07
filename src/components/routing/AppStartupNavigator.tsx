"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@packages/auth";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useTenant } from "@/contexts/TenantContext";
import { safeNextPath } from "@/lib/auth/next-path";
import { isStartupDecisionPath, resolveStartupRoute } from "@/lib/resolveStartupRoute";
import { useStartupRoutingStore } from "@/stores/startupRoutingStore";
import { LoadingScreen } from "./legacy-guards";

/**
 * App Router equivalent of the `useStartupNavigation` hook mounted in the
 * SPA shell (`src/App.tsx` → `AppRoutes`).
 *
 * Same single source of truth for post-login startup routing, with
 * next/navigation (`usePathname`, `useSearchParams`, `router.replace`)
 * instead of react-router hooks. Enabled only on non-tenant hosts, exactly
 * like the SPA (`useStartupNavigation({ enabled: !isTenant })`).
 *
 * Business onboarding is retired. Startup routing now waits only for auth,
 * role, and subscription state and can never route back into onboarding.
 */
export function AppStartupNavigator({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const nextRouter = useRouter();
  const { slug: tenantSlug } = useTenant();
  const enabled = !tenantSlug;

  const { session, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useTeamRole();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const { hasHydrated, intendedPath, clearIntendedPath } = useStartupRoutingStore();

  const isAuthenticated = Boolean(session);
  const customerPortalMarker = session?.user?.user_metadata?.servicewriter_portal === "customer";
  // A real workforce role always wins if the same email also has customer history.
  const isCustomerPortalUser = !roleLoading && !role && customerPortalMarker;
  const requiresPlan = Boolean(
    subscription && !subscription.subscribed && subscription.status === "requires_plan",
  );
  const searchString = searchParams.toString();
  const hasPendingNext = Boolean(safeNextPath(searchString ? `?${searchString}` : ""));
  const onStartupDecisionPath = isStartupDecisionPath(pathname) && !hasPendingNext;

  const isReady = useMemo(
    () => {
      if (!enabled) return true;
      if (!hasHydrated || authLoading) return false;
      if (!isAuthenticated) return true;
      if (!onStartupDecisionPath) return true;
      if (roleLoading) return false;
      if (role === "technician" || isCustomerPortalUser) return true;

      return !subscriptionLoading && Boolean(subscription);
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
      subscriptionLoading,
      subscription,
    ],
  );

  const shouldBlockRender = enabled && isAuthenticated && !isReady;

  useEffect(() => {
    if (!enabled || !isReady || !isAuthenticated || !onStartupDecisionPath) return;

    const destination = isCustomerPortalUser
      ? "/customer/dashboard"
      : resolveStartupRoute({
          currentPath: pathname,
          isAuthenticated,
          requiresPlan,
          persistedIntendedPath: intendedPath,
          role,
        });

    if (destination !== pathname) {
      nextRouter.replace(destination);
    }

    if (destination === intendedPath && intendedPath) {
      clearIntendedPath();
    }
  }, [
    enabled,
    isReady,
    pathname,
    isAuthenticated,
    onStartupDecisionPath,
    isCustomerPortalUser,
    requiresPlan,
    intendedPath,
    role,
    clearIntendedPath,
    nextRouter,
  ]);

  if (shouldBlockRender) {
    return <LoadingScreen message="Opening your workspace..." />;
  }

  return <>{children}</>;
}
