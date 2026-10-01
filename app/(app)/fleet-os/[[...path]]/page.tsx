"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
// FleetSchedulingPage owns its own nested <Routes> (~26 relative sub-routes),
// so the catch-all segment hands the full /fleet-os/* path to react-router.
import FleetSchedulingPage from "@/legacy-pages/fleet-os/FleetSchedulingPage";

export default function FleetOsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/fleet-os/*" element={<RequireAuth><RouteErrorBoundary section="Fleet"><FleetSchedulingPage /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
