"use client";

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useFeatureGate, type PlanFeatures } from "@/contexts/SubscriptionContext";
import { canAccessRoute } from "@/domain/auth/access-policy";
import { AccessDenied } from "../security/AccessDenied";

/**
 * Legacy route guards, extracted verbatim from `src/App.tsx`.
 *
 * These keep working inside `NextRouterAdapter` (which provides the
 * react-router context) on migrated App Router pages, and continue to power
 * the legacy SPA shell. Behavior is identical in both hosts — do not fork it.
 */

export const LoadingScreen = ({ message = "Loading..." }: { message?: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  </div>
);

/**
 * RequireAuth — auth/session render gate plus the single role-authorization
 * choke point for every protected route.
 *
 * Startup destination decisions live in the startup navigator (the
 * `useStartupNavigation` hook in the SPA shell, `AppStartupNavigator` under
 * App Router), which is mounted once at the app shell. This component never
 * redirects on role: an unauthorized deep link renders `AccessDenied` so there
 * is no bounce/flash.
 */
export const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  const { session, loading } = useAuth();
  const { role, loading: roleLoading } = useTeamRole();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roleLoading) return <LoadingScreen />;

  if (!role) {
    return <AccessDenied />;
  }

  if (!canAccessRoute(role, location.pathname)) {
    return <AccessDenied />;
  }

  return children;
};

/**
 * RequirePlanFeature — gates premium features. Renders a soft skeleton while
 * the subscription resolves so the route subtree does NOT remount when the
 * answer arrives (preventing the layout-flash that used to bounce users).
 */
export const RequirePlanFeature = ({
  feature,
  children,
}: {
  feature: keyof PlanFeatures;
  children: React.ReactElement;
}) => {
  const { hasAccess, loading } = useFeatureGate(feature);

  if (loading) {
    return (
      <div className="min-h-screen bg-background animate-pulse" aria-busy="true" />
    );
  }

  if (!hasAccess) {
    return <Navigate to="/plans" replace />;
  }

  return children;
};
