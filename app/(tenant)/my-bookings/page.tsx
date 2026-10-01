"use client";

import { Routes, Route, Navigate } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/my-bookings" element={<Navigate to="/customer/dashboard" replace />} />
// Kept as <Navigate> inside the adapter (per contract §4): the adapter turns
// it into nextRouter.replace("/customer/dashboard").
export default function MyBookingsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/my-bookings" element={<Navigate to="/customer/dashboard" replace />} />
      </Routes>
    </NextRouterAdapter>
  );
}
