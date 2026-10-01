"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import Fleet from "@/legacy-pages/Fleet";

export default function FleetPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/fleet" element={<RequireAuth><RouteErrorBoundary section="Fleet"><Fleet /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
