/**
 * SMS suppression checks against the existing messaging_suppressions table.
 * Provider-agnostic — shared by every channel.
 */
import type { ShopAgentSupabase } from "./db";

/** Active SMS opt-out for (workspace, phone). */
export async function isSuppressed(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  phone: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("messaging_suppressions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "sms")
    .eq("phone", phone)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
