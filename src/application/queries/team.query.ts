/**
 * Team Query
 * Canonical workspace-backed business context for the current user.
 */

import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface TeamData {
  id: string;
  name: string | null;
  booking_slug: string | null;
  owner_id: string;
}

export async function fetchTeamData(): Promise<{ team: TeamData; role: string } | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }, { data: membership, error: membershipError }] = await Promise.all([
    productionSupabase
      .from("workspaces")
      .select("id, name, created_by")
      .eq("id", context.workspaceId)
      .maybeSingle(),
    productionSupabase
      .from("workspace_settings")
      .select("booking_slug")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
    productionSupabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (membershipError) throw membershipError;
  if (!workspace) return null;

  return {
    team: {
      id: workspace.id,
      name: workspace.name,
      booking_slug: settings?.booking_slug ?? null,
      owner_id: workspace.created_by,
    },
    role: membership?.role ?? "viewer",
  };
}
