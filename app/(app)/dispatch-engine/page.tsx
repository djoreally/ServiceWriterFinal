"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import DispatchEngine from "@/legacy-pages/DispatchEngine";

export default function DispatchEnginePage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/dispatch-engine" element={<RequireAuth><RouteErrorBoundary section="Fleet"><DispatchEngine /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
