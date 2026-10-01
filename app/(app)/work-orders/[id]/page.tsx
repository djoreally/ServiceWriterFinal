"use client";
import { Routes, Route, Navigate } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";

// SPA redirect route copied verbatim: /work-orders/:id → /appointments (auth-gated, no state).
// <Navigate> inside the adapter becomes nextRouter.replace — do NOT rewrite with next/navigation redirect().
export default function WorkOrderRedirectPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/work-orders/:id" element={<RequireAuth><Navigate to="/appointments" replace /></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
