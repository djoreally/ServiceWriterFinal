"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import FeatureDetail from "@/legacy-pages/FeatureDetail";

// Public — RouteErrorBoundary section="Marketing" only, matching the SPA.
// No RequireAuth, no RouteRoleGuard. The slug comes from react-router
// useParams() inside the component (the adapter's <Route path> is
// authoritative; the Next [featureSlug] segment mirrors it).
export function FeatureDetailClient() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/features/:featureSlug" element={<RouteErrorBoundary section="Marketing"><FeatureDetail /></RouteErrorBoundary>} />
      </Routes>
    </NextRouterAdapter>
  );
}
