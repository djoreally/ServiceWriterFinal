"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import WebsiteBookings from "@/legacy-pages/WebsiteBookings";

export default function WebsiteBookingsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/website-bookings" element={<RequireAuth><RouteErrorBoundary section="Website Bookings"><WebsiteBookings /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
