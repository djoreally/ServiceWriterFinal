/**
 * Email Settings Query — Read operations for email configuration.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function fetchEmailSettings() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data: workspaceOwnerId, error: ownerError } = await supabase.rpc("current_workspace_owner_user_id");
  if (ownerError) throw ownerError;
  const { data, error } = await (supabase as any)
    .from("email_settings")
    .select("*")
    .eq("user_id", workspaceOwnerId || user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
