"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import CommandCenter from "@/legacy-pages/CommandCenter";

export default function CommandCenterPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/command-center" element={<RequireAuth><RouteErrorBoundary section="Services"><CommandCenter /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
