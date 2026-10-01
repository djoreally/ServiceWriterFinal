"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import RetentionVerify from "@/legacy-pages/RetentionVerify";

export default function CrmRetentionVerifyPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm/retention/verify" element={<RequireAuth><RouteErrorBoundary section="Marketing"><RetentionVerify /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
