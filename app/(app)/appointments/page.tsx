"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import Appointments from "@/legacy-pages/Appointments";

export default function AppointmentsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/appointments" element={<RequireAuth><RouteErrorBoundary section="Services"><Appointments /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
