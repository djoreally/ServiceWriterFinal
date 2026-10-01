"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Invoices from "@/legacy-pages/Invoices";

export default function InvoicesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/invoices" element={<RequireAuth><RouteErrorBoundary section="Financials"><Invoices /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
