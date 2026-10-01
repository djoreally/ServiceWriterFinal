"use client";
import { Routes, Route, Navigate } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";

// SPA redirect route copied verbatim: /quick-service → /appointments with
// navigation state { openNewAppointment: true }. The adapter's navigation-state
// shim preserves `state` across the replace, so Appointments.tsx reads it via
// location.state exactly as in the SPA (no RequireAuth in the SPA either).
export default function QuickServiceRedirectPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/quick-service" element={<Navigate to="/appointments" replace state={{ openNewAppointment: true }} />} />
      </Routes>
    </NextRouterAdapter>
  );
}
