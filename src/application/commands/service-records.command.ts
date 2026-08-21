/**
 * Service Records Commands — Write operations for service records.
 */
import { supabase } from "@/integrations/supabase/client";

/** Delete a service record */
export async function deleteServiceRecord(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_service', {
    _service_id: id,
    _reason: reason ?? null,
  });
  if (error) throw error;
}
