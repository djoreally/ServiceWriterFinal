"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import FeaturesGuide from "@/legacy-pages/FeaturesGuide";

// Public — RouteErrorBoundary section="Marketing" only, matching the SPA.
// No RequireAuth, no RouteRoleGuard.
export function FeaturesGuideClient() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/features-guide" element={<RouteErrorBoundary section="Marketing"><FeaturesGuide /></RouteErrorBoundary>} />
      </Routes>
    </NextRouterAdapter>
  );
}
