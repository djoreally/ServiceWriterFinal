"use client";

import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { usePathname } from "next/navigation";
import { TenantPublicShell } from "@/components/routing/TenantPublicShell";
import { getTenantSlugFromHostname, isMigratedPath } from "@/lib/migratedRoutes";
import TenantBooking from "@/legacy-pages/TenantBooking";
import NotFound from "@/legacy-pages/NotFound";

/**
 * Browser-only tenant catch-all + SPA fallback.
 *
 * This module is intentionally loaded with ssr:false from page.tsx.
 * Legacy SPA dependencies include browser-only code that may touch document
 * during module evaluation. Keeping the complete fallback tree behind a
 * client-only dynamic boundary prevents those modules from executing in the
 * Next.js server runtime while preserving the existing routing behavior.
 */
export default function CatchAllClient() {
  const pathname = usePathname();
  const [hostKind, setHostKind] = useState<"tenant" | "app" | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setHostKind(getTenantSlugFromHostname(window.location.hostname) ? "tenant" : "app");
    });
  }, []);

  if (hostKind === null) return null;

  if (hostKind === "tenant") {
    return (
      <TenantPublicShell>
        <Routes>
          <Route path="*" element={<TenantBooking />} />
        </Routes>
      </TenantPublicShell>
    );
  }

  if (isMigratedPath(pathname ?? "/")) {
    return (
      <TenantPublicShell>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TenantPublicShell>
    );
  }

  return null;
}
