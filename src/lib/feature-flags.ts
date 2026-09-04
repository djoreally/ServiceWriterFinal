/**
 * Feature flags for gating incomplete / non-functional features.
 *
 * SHOW_INCOMPLETE_FEATURES defaults to false. In production builds
 * these features are completely removed from navigation and routing.
 *
 * To enable during development set NEXT_PUBLIC_SHOW_INCOMPLETE_FEATURES=true
 * in your .env.local file.
 */
import { getRuntimeEnvString } from "@/lib/runtime-env";

export const SHOW_INCOMPLETE_FEATURES =
  getRuntimeEnvString("NEXT_PUBLIC_SHOW_INCOMPLETE_FEATURES") === "true";
