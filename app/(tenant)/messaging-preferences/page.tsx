"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import CustomerMessagingPreferences from "@/legacy-pages/CustomerMessagingPreferences";

// Tenant branch (identical composition in the non-tenant branch):
// <Route path="/messaging-preferences" element={<CustomerMessagingPreferences />} />
// Public — no auth guard in the SPA.
export default function MessagingPreferencesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/messaging-preferences" element={<CustomerMessagingPreferences />} />
      </Routes>
    </NextRouterAdapter>
  );
}
