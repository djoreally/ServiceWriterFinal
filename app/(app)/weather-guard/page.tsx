"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import (no lazyRetry — App Router code-splits per route)
import WeatherGuard from "@/legacy-pages/WeatherGuard";

export default function WeatherGuardPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/weather-guard" element={<RequireAuth><RouteErrorBoundary section="Fleet"><WeatherGuard /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
