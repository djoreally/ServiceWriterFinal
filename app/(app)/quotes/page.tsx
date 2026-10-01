"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Quotes from "@/legacy-pages/Quotes";

export default function QuotesPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/quotes" element={<RequireAuth><RouteErrorBoundary section="Services"><Quotes /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
