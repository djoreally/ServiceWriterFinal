"use client";

import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { usePathname } from "next/navigation";
import { TenantPublicShell } from "@/components/routing/TenantPublicShell";
import { getTenantSlugFromHostname, isMigratedPath } from "@/lib/migratedRoutes";
import TenantBooking from "@/legacy-pages/TenantBooking";
import NotFound from "@/legacy-pages/NotFound";

/**
 * Tenant catch-all + SPA fallback.
 *
 * - Tenant host (`{slug}.servicewriter.xyz` resolves): every tenant-branch
 *   route is migrated, so any unmatched path renders the tenant booking flow —
 *   exactly the SPA tenant branch's `<Route path="*" element={<TenantBooking />} />`.
 *   `TenantBooking` itself renders `NotFound` for unknown/invalid tenants and a
 *   retry UI on network failure, mirroring the SPA.
 * - Non-tenant host, path matched a migrated prefix but no concrete App Router
 *   page exists (e.g. bare `/book` or `/public-services` — the SPA rendered
 *   `NotFound` for these): render `NotFound` for SPA parity instead of a blank
 *   page. This only happens for param prefixes whose bare path has no page;
 *   every migrated concrete route has its own page file (contract §5 rule 1).
 * - Non-tenant host, unmigrated path: return null so `ClientOnlyShell` keeps
 *   serving the legacy SPA shell.
 *
 * Host detection runs post-mount (hydration-safe); SSR/first paint renders
 * null, matching the previous behavior of this file.
 */
export default function ServiceWriterRoute() {
  const pathname = usePathname();
  const [hostKind, setHostKind] = useState<"tenant" | "app" | null>(null);

  // Post-mount host detection (hydration-safe): same deferred-setState idiom as
  // src/hooks/useIsClient — the initial null render matches the server output.
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
