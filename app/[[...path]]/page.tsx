"use client";

import dynamic from "next/dynamic";

const CatchAllClient = dynamic(() => import("./CatchAllClient"), {
  ssr: false,
  loading: () => null,
});

/**
 * The legacy fallback must never be evaluated in the server runtime.
 * Several preserved SPA modules are browser-only and can access document at
 * module scope through their dependency graph. Load the entire fallback tree
 * client-only so public legacy routes such as / and /login remain available.
 */
export default function ServiceWriterRoute() {
  return <CatchAllClient />;
}
