"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import PaymentSuccess from "@/legacy-pages/PaymentSuccess";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/booking-success" element={<PaymentSuccess />} />
// Public — no auth guard in the SPA.
export default function BookingSuccessPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/booking-success" element={<PaymentSuccess />} />
      </Routes>
    </NextRouterAdapter>
  );
}
