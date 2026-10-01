"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import CustomerDashboard from "@/legacy-pages/CustomerDashboard";

// Tenant branch: <Route path="/customer/dashboard" element={<CustomerDashboard />} />
// (also exists with identical composition in the non-tenant branch).
// Public — no auth guard, no error boundary in the SPA.
export default function CustomerDashboardPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
      </Routes>
    </NextRouterAdapter>
  );
}
