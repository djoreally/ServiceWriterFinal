"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import PublicServices from "@/legacy-pages/PublicServices";

// Non-tenant branch: <Route path="/public-services/:slug" element={<PublicServices />} />
// The slug comes from react-router `useParams()` inside the component (the
// adapter's <Route path> is authoritative; the Next `[slug]` segment mirrors it).
// Public — no auth guard in the SPA.
export default function PublicServicesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/public-services/:slug" element={<PublicServices />} />
      </Routes>
    </NextRouterAdapter>
  );
}
