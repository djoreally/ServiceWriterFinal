"use client";

import { Route, Routes } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import WorkspaceAnalytics from "@/legacy-pages/WorkspaceAnalytics";

/**
 * /analytics — the workspace's built-in Analytics console.
 *
 * Owner/admin only, enforced three ways: the access policy hides the
 * nav item and RouteRoleGuard blocks the route for every other role,
 * and the telemetry read APIs + RLS reject non-owners regardless.
 * Tracked users (including viewers) see nothing here — or anywhere.
 */
export default function AnalyticsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route
          path="/analytics"
          element={
            <RequireAuth>
              <RouteRoleGuard>
                <RouteErrorBoundary section="Analytics">
                  <WorkspaceAnalytics />
                </RouteErrorBoundary>
              </RouteRoleGuard>
            </RequireAuth>
          }
        />
      </Routes>
    </NextRouterAdapter>
  );
}
