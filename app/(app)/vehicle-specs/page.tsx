"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import VehicleSpecs from "@/legacy-pages/VehicleSpecs";

// SPA parity: <RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketing"><VehicleSpecs /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>
export default function VehicleSpecsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/vehicle-specs" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketing"><VehicleSpecs /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
