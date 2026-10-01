"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import Dashboard from "@/legacy-pages/Dashboard";

export default function DashboardPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/dashboard" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Dashboard /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
