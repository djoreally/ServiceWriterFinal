"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import CRM from "@/legacy-pages/CRM";

export default function CrmPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="CRM"><CRM /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
