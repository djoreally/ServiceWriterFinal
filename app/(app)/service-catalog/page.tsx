"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import ServiceCatalog from "@/legacy-pages/ServiceCatalog";

export default function ServiceCatalogPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/service-catalog" element={<RequireAuth><RouteErrorBoundary section="Services"><ServiceCatalog /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
