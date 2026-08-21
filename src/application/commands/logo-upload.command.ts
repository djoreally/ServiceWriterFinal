/**
 * Logo Upload Command
 * Handles uploading business logos to storage.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function uploadBusinessLogo(file: File): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const fileExt = file.name.split(".").pop();
  const filePath = `${user.id}/logo.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(filePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("logos").getPublicUrl(filePath);
  return urlData.publicUrl;
}
