"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import PublicSubscriptions from "@/legacy-pages/PublicSubscriptions";

// Non-tenant branch: <Route path="/subscribe/:slug" element={<PublicSubscriptions />} />
// The slug comes from react-router `useParams()` inside the component (the
// adapter's <Route path> is authoritative; the Next `[slug]` segment mirrors it).
// Public — no auth guard in the SPA.
export default function PublicSubscribePage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/subscribe/:slug" element={<PublicSubscriptions />} />
      </Routes>
    </NextRouterAdapter>
  );
}
