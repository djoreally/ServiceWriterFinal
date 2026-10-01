"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Customers from "@/legacy-pages/Customers";

export default function CustomersPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/customers" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Customers /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
