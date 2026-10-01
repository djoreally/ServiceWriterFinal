"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth, LoadingScreen } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
import { useTenant } from "@/contexts/TenantContext";
// direct imports of the legacy page components (no lazyRetry — App Router code-splits per route)
import Services from "@/legacy-pages/Services";
import PublicServices from "@/legacy-pages/PublicServices";

/**
 * Dual behavior, mirroring src/App.tsx exactly:
 * - While tenant resolution is in flight → LoadingScreen (the SPA blocked on
 *   tenantLoading before choosing a route set).
 * - Tenant-subdomain host (slug resolved) → public <PublicServices tenantSlug />
 *   with NO auth guard and NO error boundary, verbatim from the SPA tenant branch.
 * - Normal host → <RequireAuth><RouteErrorBoundary section="Services"><Services /></RouteErrorBoundary></RequireAuth>.
 * TenantProvider is mounted once in the (app) layout above this page.
 */
function ServicesBranch() {
  const { loading, slug: tenantSlug } = useTenant();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (tenantSlug) {
    return (
      <Routes>
        <Route path="/services" element={<PublicServices tenantSlug={tenantSlug} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/services" element={<RequireAuth><RouteErrorBoundary section="Services"><Services /></RouteErrorBoundary></RequireAuth>} />
    </Routes>
  );
}

export default function ServicesPage() {
  return (
    <NextRouterAdapter>
      <ServicesBranch />
    </NextRouterAdapter>
  );
}
