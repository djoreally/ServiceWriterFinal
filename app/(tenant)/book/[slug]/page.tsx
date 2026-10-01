"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import PublicBooking from "@/legacy-pages/PublicBooking";

// Non-tenant branch: <Route path="/book/:slug" element={<PublicBooking />} />
// The slug comes from react-router `useParams()` inside the component (the
// adapter's <Route path> is authoritative; the Next `[slug]` segment mirrors it).
// Public — no auth guard in the SPA.
export default function PublicBookingPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/book/:slug" element={<PublicBooking />} />
      </Routes>
    </NextRouterAdapter>
  );
}
