"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { useTenant } from "@/contexts/TenantContext";
import PublicSubscriptions from "@/legacy-pages/PublicSubscriptions";
import NotFound from "@/legacy-pages/NotFound";

// Tenant branch: <Route path="/subscribe" element={<PublicSubscriptions tenantSlug={tenantSlug} />} />
// The SPA passed the hostname-resolved slug as a prop (not via URL params),
// so this wrapper reads it from the tenant context and forwards it — same
// composition as the SPA. On non-tenant hosts the SPA had no bare `/subscribe`
// route (it rendered NotFound), so we render NotFound there too.
function TenantSubscribe() {
  const { slug } = useTenant();
  if (!slug) return <NotFound />;
  return <PublicSubscriptions tenantSlug={slug} />;
}

export default function SubscribePage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/subscribe" element={<TenantSubscribe />} />
      </Routes>
    </NextRouterAdapter>
  );
}
