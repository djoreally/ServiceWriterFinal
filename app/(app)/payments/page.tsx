"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Payments from "@/legacy-pages/Payments";

export default function PaymentsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/payments" element={<RequireAuth><RouteErrorBoundary section="Financials"><Payments /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
