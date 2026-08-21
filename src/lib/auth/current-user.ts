/**
 * Cached current-user resolver.
 *
 * WHY THIS EXISTS
 * ---------------
 * `supabase.auth.getUser()` is a NETWORK call to the auth service (`GET /auth/v1/user`).
 * The app used to call it in ~50 query/command modules, so a single page load fired
 * dozens of auth round trips. Under that load the auth service queues and starts
 * returning `504 upstream request timeout`, which surfaced as "cannot login with
 * those credentials" and 15+ second screen loads.
 *
 * This module resolves the identity ONCE from the locally stored session
 * (`getSession()` — no network unless the token needs refreshing), caches it, and
 * invalidates the cache on `onAuthStateChange`.
 *
 * WHEN NOT TO USE THIS
 * --------------------
 * Anything that must be re-validated server-side — sign-in/sign-up flows,
 * role/permission gates, admin surfaces — should keep calling
 * `supabase.auth.getUser()` directly.
 */

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Result = { data: { user: User | null }; error: null };

let cachedUser: User | null = null;
let resolved = false;
let inFlight: Promise<Result> | null = null;
let listenerBound = false;

function bindListener() {
  if (listenerBound) return;
  listenerBound = true;
  if (typeof supabase.auth?.onAuthStateChange !== "function") return;
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedUser = session?.user ?? null;
    resolved = true;
    inFlight = null;
  });
}

/**
 * Prefer `getSession()` (local read). Fall back to `getUser()` when the client
 * does not expose sessions (test doubles, older shims).
 */
async function resolveUser(): Promise<User | null> {
  if (typeof supabase.auth?.getSession === "function") {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user ?? null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Drop-in replacement for `supabase.auth.getUser()` for ordinary data access.
 * Returns the same `{ data: { user }, error }` shape.
 */
export async function getCurrentAuthUser(): Promise<Result> {
  bindListener();

  if (resolved) {
    return { data: { user: cachedUser }, error: null };
  }

  if (!inFlight) {
    inFlight = resolveUser()
      .then((user) => {
        cachedUser = user;
        resolved = true;
        return { data: { user: cachedUser }, error: null } as Result;
      })
      .catch(() => {
        // Never cache a failure — let the next caller retry.
        inFlight = null;
        return { data: { user: null }, error: null } as Result;
      });
  }

  return inFlight;
}

/** Convenience: the current user id, or null. */
export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  return user?.id ?? null;
}

/** Convenience: the current user id, throwing when unauthenticated. */
export async function requireCurrentUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) throw new Error("Not authenticated");
  return id;
}

/** Test/utility hook: drop the cache so the next read re-resolves. */
export function resetCurrentAuthUserCache() {
  cachedUser = null;
  resolved = false;
  inFlight = null;
}
