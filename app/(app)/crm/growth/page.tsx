"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import Marketing from "@/legacy-pages/Marketing";

export default function CrmGrowthPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm/growth" element={<RequireAuth><RouteErrorBoundary section="Marketing"><Marketing /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
