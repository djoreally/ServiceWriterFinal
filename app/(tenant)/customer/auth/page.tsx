"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import CustomerAuth from "@/legacy-pages/CustomerAuth";

// Tenant branch: <Route path="/customer/auth" element={<CustomerAuth />} />
// (also exists with identical composition in the non-tenant branch).
// Public — no auth guard in the SPA.
export default function CustomerAuthPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/customer/auth" element={<CustomerAuth />} />
      </Routes>
    </NextRouterAdapter>
  );
}
