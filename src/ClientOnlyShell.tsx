"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  getTenantSlugFromHostname,
  isMigratedPath,
} from "@/lib/migratedRoutes";
import ShellSkeleton from "./components/routing/ShellSkeleton";

const BrowserApplication = dynamic(() => import("./NextClientShell"), {
  ssr: false,
  // First paint must never be blank (§3.2.1 R2): the fallback ships in the
  // initial HTML and paints before the client bundle boots.
  loading: () => <ShellSkeleton />,
});

const NATIVE_PUBLIC_ROUTES = new Set(["/tire", "/detailers"]);

/**
 * Same routing signal as `app/page.tsx`: Supabase browser sessions persist
 * in cookies named `sb-<project-ref>-auth-token` (possibly chunked).
 * Presence is only a routing signal, never proof of a valid session.
 */
function hasSupabaseSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => {
    const name = part.split("=")[0]?.trim() ?? "";
    return name.startsWith("sb-") && name.includes("-auth-token");
  });
}

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
    // Anonymous "/" is served by the server-rendered `app/page.tsx` — the
    // SPA shell must not mount there too (it would paint a second homepage
    // under the server one). Signed-in visitors keep the SPA startup flow:
    // the shell mounts, and startup routing bounces them to their workspace.
    if (pathname === "/" && !hasSupabaseSessionCookie()) return null;
  }
  return <BrowserApplication />;
}
