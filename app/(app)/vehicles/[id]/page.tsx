"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import VehicleDetail from "@/legacy-pages/VehicleDetail";

export default function VehicleDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/vehicles/:id" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><VehicleDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
