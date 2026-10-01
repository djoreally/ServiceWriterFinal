"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import Newsletter from "@/legacy-pages/Newsletter";

export default function CrmNewsletterPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm/newsletter" element={<RequireAuth><RouteErrorBoundary section="Marketing"><Newsletter /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
