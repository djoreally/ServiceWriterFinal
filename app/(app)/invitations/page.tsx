"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import InvitationCenter from "@/legacy-pages/InvitationCenter";

export default function InvitationCenterPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/invitations" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Invitations"><InvitationCenter /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
