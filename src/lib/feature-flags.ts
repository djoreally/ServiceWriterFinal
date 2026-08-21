/**
 * Feature flags for gating incomplete / non-functional features.
 *
 * SHOW_INCOMPLETE_FEATURES defaults to false. In production builds
 * these features are completely removed from navigation and routing —
 * no disabled states, no toasts, just gone.
 *
 * To enable during development set VITE_SHOW_INCOMPLETE_FEATURES=true
 * in your .env.local file.
 */
import { getRuntimeEnvString } from "@/lib/runtime-env";

export const SHOW_INCOMPLETE_FEATURES =
  getRuntimeEnvString("VITE_SHOW_INCOMPLETE_FEATURES") === "true";
