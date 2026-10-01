"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
import FleetManagerPortal from "@/legacy-pages/FleetManagerPortal";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/fleet-manager" element={<RequireAuth><RouteErrorBoundary section="Fleet Manager"><FleetManagerPortal /></RouteErrorBoundary></RequireAuth>} />
// The only tenant route that requires auth — guard composition copied verbatim.
export default function FleetManagerPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route
          path="/fleet-manager"
          element={
            <RequireAuth>
              <RouteErrorBoundary section="Fleet Manager">
                <FleetManagerPortal />
              </RouteErrorBoundary>
            </RequireAuth>
          }
        />
      </Routes>
    </NextRouterAdapter>
  );
}
