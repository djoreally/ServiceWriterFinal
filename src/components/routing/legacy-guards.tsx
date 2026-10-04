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

const IdentityUnavailable = ({ retry, signOut }: { retry: () => void; signOut: () => Promise<void> }) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">We could not verify your workspace access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your session is still signed in, but the workforce identity service did not respond correctly. Protected workspace data remains locked until identity can be verified.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
);

/**
 * RequireAuth — auth/session render gate plus the single role-authorization
 * choke point for every workforce-protected route.
 *
 * External fleet contacts are authenticated customer identities, not workforce
 * members. Their `/fleet-manager` surface performs its own account-scoped API
 * authorization and therefore needs session auth without a workforce role.
 */
export const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  const { session, loading, signOut } = useAuth();
  const { role, loading: roleLoading, error: roleError, retry } = useTeamRole();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roleLoading) return <LoadingScreen />;

  // Fleet-manager contacts authenticate as customer/fleet identities rather
  // than workspace_members. Authorization remains enforced by the fleet portal
  // API against the signed-in account, so workforce RBAC does not apply here.
  if (location.pathname === "/fleet-manager" || location.pathname.startsWith("/fleet-manager/")) {
    return children;
  }

  if (!role) {
    if (roleError) return <IdentityUnavailable retry={retry} signOut={signOut} />;
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
