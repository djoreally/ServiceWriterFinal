"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import TenantBooking from "@/legacy-pages/TenantBooking";

// Tenant branch: <Route path="/embed/booking" element={<TenantBooking />} />
// `TenantBooking` resolves the tenant itself via `useTenant()` (provided by
// the shared shell) and renders NotFound on non-tenant hosts — exactly the
// SPA behavior, where /embed/booking only existed in the tenant branch.
export default function EmbedBookingPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/embed/booking" element={<TenantBooking />} />
      </Routes>
    </NextRouterAdapter>
  );
}
