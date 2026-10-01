"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Vehicles from "@/legacy-pages/Vehicles";

export default function VehiclesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/vehicles" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Vehicles /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
