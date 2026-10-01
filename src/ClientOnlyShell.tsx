"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  getTenantSlugFromHostname,
  isMigratedPath,
} from "@/lib/migratedRoutes";

const BrowserApplication = dynamic(() => import("./NextClientShell"), {
  ssr: false,
  loading: () => <div aria-label="Loading Service Writer" className="min-h-screen bg-background" />,
});

const NATIVE_PUBLIC_ROUTES = new Set(["/tire", "/detailers"]);

export default function ClientOnlyShell() {
  const pathname = usePathname();
  if (NATIVE_PUBLIC_ROUTES.has(pathname)) return null;
  // Migrated sections are served by App Router pages under `app/(app)/` —
  // the legacy SPA shell must not mount there (it would double-mount the
  // whole provider stack and fight the App Router page for the URL).
  if (isMigratedPath(pathname)) return null;
  if (typeof window !== "undefined") {
    const tenantSlug = getTenantSlugFromHostname(window.location.hostname);
    // Tenant hosts are fully served by App Router: every tenant-branch route
    // (including the tenant catch-all → TenantBooking in
    // `app/[[...path]]/page.tsx`) is migrated, so the legacy SPA shell must
    // never mount on a tenant host — it would double-mount and fight the
    // App Router pages for the URL.
    if (tenantSlug) return null;
  }
  return <BrowserApplication />;
}
