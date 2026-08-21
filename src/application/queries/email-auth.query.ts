/**
 * Email Auth Query - Get current user for email settings authentication checks.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get the current authenticated user ID. Returns null if not authenticated. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}
