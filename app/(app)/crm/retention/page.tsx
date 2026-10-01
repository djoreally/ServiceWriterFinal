"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import RetentionEngine from "@/legacy-pages/RetentionEngine";

export default function CrmRetentionPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm/retention" element={<RequireAuth><RouteErrorBoundary section="Marketing"><RetentionEngine /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
