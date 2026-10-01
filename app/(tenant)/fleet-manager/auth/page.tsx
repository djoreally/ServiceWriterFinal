"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import CustomerAuth from "@/legacy-pages/CustomerAuth";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/fleet-manager/auth" element={<CustomerAuth returnPath="/fleet-manager" />} />
// Public — no auth guard in the SPA.
export default function FleetManagerAuthPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/fleet-manager/auth" element={<CustomerAuth returnPath="/fleet-manager" />} />
      </Routes>
    </NextRouterAdapter>
  );
}
