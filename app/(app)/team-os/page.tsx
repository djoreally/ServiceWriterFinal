"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import TechnicianOS from "@/legacy-pages/TechnicianOS";

export default function TeamOsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/team-os" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Team OS"><TechnicianOS /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
