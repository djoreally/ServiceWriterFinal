"use client";

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/my-bookings" element={<Navigate to="/customer/dashboard" replace />} />
// Kept as <Navigate> inside the adapter (per contract §4): the adapter turns
// it into nextRouter.replace("/customer/dashboard").
// The query string rides along: email CTAs link here with
// ?appointment=<id>, and that context must survive the hop to the dashboard.
function MyBookingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/customer/dashboard${location.search}`} replace />;
}

export default function MyBookingsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/my-bookings" element={<MyBookingsRedirect />} />
      </Routes>
    </NextRouterAdapter>
  );
}
