"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import VanDetail from "@/legacy-pages/VanDetail";

export default function VanDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/fleet/:id" element={<RequireAuth><RouteErrorBoundary section="Fleet"><VanDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
