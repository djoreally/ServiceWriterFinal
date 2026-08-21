/**
 * Google Calendar Query — Read operations for Google Calendar sync.
 */
import { supabase } from "@/integrations/supabase/client";

/** Get Google Calendar connection status */
export async function getGoogleCalendarStatus(): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "status" },
  });
}
