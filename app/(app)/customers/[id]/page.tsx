"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import CustomerDetail from "@/legacy-pages/CustomerDetail";

export default function CustomerDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/customers/:id" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><CustomerDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
