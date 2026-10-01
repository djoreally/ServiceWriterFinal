"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import Settings from "@/legacy-pages/Settings";

export default function SettingsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/settings" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Settings /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
