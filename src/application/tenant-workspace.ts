import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function getWorkspaceOwnerUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) return null;

  const { data, error } = await supabase.rpc("current_workspace_owner_user_id");
  if (!error && data) return String(data);

  const { data: link } = await supabase
    .from("team_user_links")
    .select("owner_user_id")
    .eq("member_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return link?.owner_user_id ?? user.id;
}

export async function requireWorkspaceOwnerUserId(): Promise<string> {
  const ownerUserId = await getWorkspaceOwnerUserId();
  if (!ownerUserId) throw new Error("Not authenticated");
  return ownerUserId;
}