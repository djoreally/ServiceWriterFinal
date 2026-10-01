"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import FieldCompanion from "@/legacy-pages/FieldCompanion";

export default function FieldCompanionPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/field-companion" element={<RequireAuth><RouteErrorBoundary section="Field Companion"><FieldCompanion /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
