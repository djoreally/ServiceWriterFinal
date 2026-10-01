"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { useTenant } from "@/contexts/TenantContext";
import PublicSubscriptions from "@/legacy-pages/PublicSubscriptions";
import NotFound from "@/legacy-pages/NotFound";

// Tenant branch:
// <Route path="/embed/subscribe" element={<PublicSubscriptions tenantSlug={tenantSlug} embedded />} />
// The `embedded` prop is the actual embed behavior (the "public-content-only
// CSP" comment in App.tsx was never implemented — no CSP/frame-ancestors
// headers exist anywhere in the codebase); it also activates via ?embed=true.
// On non-tenant hosts the SPA had no /embed/* routes (NotFound), preserved here.
function EmbedSubscribe() {
  const { slug } = useTenant();
  if (!slug) return <NotFound />;
  return <PublicSubscriptions tenantSlug={slug} embedded />;
}

export default function EmbedSubscribePage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/embed/subscribe" element={<EmbedSubscribe />} />
      </Routes>
    </NextRouterAdapter>
  );
}
