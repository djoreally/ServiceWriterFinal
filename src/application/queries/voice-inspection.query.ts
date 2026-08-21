/**
 * Voice Inspection Query — Read operations for inspection media.
 */
import { supabase } from "@/integrations/supabase/client";

export async function getInspectionMediaSignedUrl(path: string): Promise<any> {
  return supabase.storage.from("inspection-media").createSignedUrl(path, 60 * 60 * 24 * 365);
}
