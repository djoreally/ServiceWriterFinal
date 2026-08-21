/**
 * Fleet Client Detail Commands — Write operations for fleet clients.
 */
import { supabase } from "@/integrations/supabase/client";

/** Update a fleet client. */
export async function updateFleetClient(id: string, data: Record<string, unknown>) {
  return supabase.from("fleet_clients").update(data as never).eq("id", id).select("*").single();
}
