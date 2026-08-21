/**
 * Sign Out Command - Handles user sign-out.
 */
import { AUTH_SUPABASE_PROJECT_ID_RESOLVED, supabase } from "@/integrations/supabase/client";

/**
 * Sign out the current browser immediately.
 *
 * The SDK sign-out runs first so its in-memory session and storage stay in
 * sync (clearing storage behind the SDK's back left it holding a session that
 * no longer existed on disk). Storage keys are then removed as a fallback so a
 * stalled or failed SDK call can never leave a stale session able to re-enter
 * login routing.
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best-effort: the storage cleanup below is the guarantee.
  }

  if (typeof window !== "undefined") {
    const keyPrefix = `sb-${AUTH_SUPABASE_PROJECT_ID_RESOLVED}-auth-token`;
    window.localStorage.removeItem(keyPrefix);
    window.localStorage.removeItem(`${keyPrefix}-code-verifier`);
  }
}
