/**
 * Shared types for the Hono API layer (Phase 1 migration).
 *
 * Domain routers live in `src/server/hono/routes/<domain>.ts` and export a
 * plain `new Hono()` instance whose paths are RELATIVE to the mount point
 * registered in `app.ts` (e.g. the appointments router defines `/`, `/:id`,
 * `/:id/complete` and is mounted at `/v1/appointments`).
 *
 * Auth: reuse the helpers in `middleware/auth.ts`, which wrap the canonical
 * `@/server/api` functions (`requireUser`, `requireWorkspaceMember`,
 * `requireWorkspacePaymentsAddon`). Do not reimplement auth logic here.
 *
 * Errors: throw `ApiError` (or let unexpected errors propagate) — the app-level
 * `onError` handler in `app.ts` converts everything via `errorResponse`,
 * preserving the exact `{ error: { code, message } }` JSON shape and status
 * codes of the original Next.js route handlers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  [key: string]: unknown;
}

export interface WorkspaceMembership {
  workspace_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  [key: string]: unknown;
}

export interface RequestAuthContext {
  supabase: SupabaseClient;
  user: AuthUser;
  membership?: WorkspaceMembership;
}
