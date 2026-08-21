/**
 * Admin CARFAX Commands — Write operations for platform-level CARFAX config.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CarfaxConfig } from "@/application/queries/admin-carfax.query";

export async function saveAdminCarfaxSettings(config: CarfaxConfig): Promise<void> {
  const { error } = await supabase
    .from("platform_settings")
    .update({ value: config as unknown as Json })
    .eq("key", "carfax");

  if (error) throw error;
}
