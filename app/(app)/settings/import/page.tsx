"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
import AccountImport from "@/legacy-pages/AccountImport";

// Migrated alongside /settings: the bare "/settings" entry in
// MIGRATED_ROUTE_PREFIXES is segment-aware and would otherwise swallow
// /settings/import with no App Router page to render it.
export default function AccountImportPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/settings/import" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Data Import"><AccountImport /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
