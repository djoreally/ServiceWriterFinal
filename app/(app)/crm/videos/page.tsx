"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import MarketingVideos from "@/legacy-pages/MarketingVideos";

export default function CrmVideosPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/crm/videos" element={<RequireAuth><RouteErrorBoundary section="Marketing"><MarketingVideos /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
