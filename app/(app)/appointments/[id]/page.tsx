"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import AppointmentDetail from "@/legacy-pages/AppointmentDetail";

export default function AppointmentDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/appointments/:id" element={<RequireAuth><RouteErrorBoundary section="Services"><AppointmentDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
