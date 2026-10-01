"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import ServiceDetail from "@/legacy-pages/ServiceDetail";

export default function ServiceDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/services/:id" element={<RequireAuth><RouteErrorBoundary section="Services"><ServiceDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
