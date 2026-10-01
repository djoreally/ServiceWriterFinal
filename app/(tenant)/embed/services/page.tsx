"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { useTenant } from "@/contexts/TenantContext";
import PublicServices from "@/legacy-pages/PublicServices";
import NotFound from "@/legacy-pages/NotFound";

// Tenant branch:
// <Route path="/embed/services" element={<PublicServices tenantSlug={tenantSlug} embedded />} />
// The `embedded` prop is the actual embed behavior (the "public-content-only
// CSP" comment in App.tsx was never implemented — no CSP/frame-ancestors
// headers exist anywhere in the codebase); it also activates via ?embed=true.
// On non-tenant hosts the SPA had no /embed/* routes (NotFound), preserved here.
function EmbedServices() {
  const { slug } = useTenant();
  if (!slug) return <NotFound />;
  return <PublicServices tenantSlug={slug} embedded />;
}

export default function EmbedServicesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/embed/services" element={<EmbedServices />} />
      </Routes>
    </NextRouterAdapter>
  );
}
