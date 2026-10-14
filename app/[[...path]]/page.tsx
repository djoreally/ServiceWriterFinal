import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getTenantSlugFromHostname } from "@/lib/migratedRoutes";
import CatchAllLoader from "./CatchAllLoader";
import ServerHomepage from "@/components/marketing/ServerHomepage";
import { HOMEPAGE_DESCRIPTION, HOMEPAGE_TITLE } from "@/legacy-pages/homepageContent";

/**
 * Optional catch-all route. Non-root paths keep the previous behavior
 * (legacy SPA fallback / tenant shell). Root "/" gets three render paths:
 *
 * 1. Tenant host (`{slug}.servicewriter.xyz`): the tenant booking shell,
 *    exactly as before.
 * 2. Apex host with a Supabase session cookie: render nothing here. The
 *    legacy SPA shell (ClientOnlyShell) mounts and its startup routing
 *    bounces the signed-in user to their workspace, as it does today.
 *    The SPA path keeps full role/subscription startup logic instead of
 *    duplicating it server-side.
 * 3. Apex host, anonymous: the server-rendered homepage. First paint does
 *    not wait for the SPA bundle, auth, or tenant resolution, and the
 *    title is in the HTML — one stable title, no client-side title churn.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  if (path && path.length > 0) return {};
  const headerStore = await headers();
  const host = (headerStore.get("host") ?? "").toLowerCase().trim();
  if (getTenantSlugFromHostname(host)) return {};
  return {
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
    openGraph: {
      title: "Service Writer | Running your shop shouldn't be the premium feature.",
      description: HOMEPAGE_DESCRIPTION,
    },
  };
}

/**
 * Supabase browser sessions persist in cookies named
 * `sb-<project-ref>-auth-token` (possibly chunked as `.0`, `.1`, ...).
 * Presence is only a routing signal — never treated as proof of a valid
 * session. A stale cookie falls through to the SPA path, which re-checks
 * the session properly.
 */
function hasSupabaseSessionCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => name.startsWith("sb-") && name.includes("-auth-token"));
}

export default async function ServiceWriterRoute({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;

  // Every non-root path keeps the previous fallback behavior.
  if (path && path.length > 0) {
    return <CatchAllLoader />;
  }

  const headerStore = await headers();
  const host = (headerStore.get("host") ?? "").toLowerCase().trim();

  // Tenant hosts keep the tenant booking shell.
  if (getTenantSlugFromHostname(host)) {
    return <CatchAllLoader />;
  }

  // Signed-in visitors keep the SPA startup flow (role-aware bounce).
  const cookieStore = await cookies();
  if (hasSupabaseSessionCookie(cookieStore.getAll().map((c) => c.name))) {
    return null;
  }

  // Anonymous visitors get the server-rendered homepage.
  return <ServerHomepage />;
}
