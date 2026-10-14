"use client";

import dynamic from "next/dynamic";

const CatchAllClient = dynamic(() => import("./CatchAllClient"), {
  ssr: false,
  loading: () => null,
});

/**
 * Client-only loader for the legacy SPA fallback tree.
 *
 * Split out of `page.tsx` (a server component) because `ssr: false` is not
 * allowed in server components, and the fallback tree must never be
 * evaluated in the server runtime: several preserved SPA modules are
 * browser-only and can access document at module scope.
 */
export default function CatchAllLoader() {
  return <CatchAllClient />;
}
