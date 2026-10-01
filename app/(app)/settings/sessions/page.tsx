"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import SessionManagement from "@/legacy-pages/SessionManagement";

export default function SessionManagementPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/settings/sessions" element={<RequireAuth><SessionManagement /></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
