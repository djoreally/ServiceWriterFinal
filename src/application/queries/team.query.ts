/**
 * Team Query
 * Fetches team/business context for the current user.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TeamData {
  id: string;
  name: string | null;
  booking_slug: string | null;
  owner_id: string;
}

export async function fetchTeamData(): Promise<{ team: TeamData; role: string } | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("team_members")
    .select("role, teams!inner(id, name, user_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.teams) {
    // Fetch booking_slug from business_profiles for the team owner
    const ownerId = membership.teams.user_id;
    const { data: bp } = await supabase
      .from("business_profiles")
      .select("booking_slug")
      .eq("user_id", ownerId)
      .single();

    return {
      team: {
        id: membership.teams.id,
        name: membership.teams.name,
        booking_slug: bp?.booking_slug ?? null,
        owner_id: ownerId,
      },
      role: membership.role,
    };
  }

  // Fallback for legacy single-tenant records that predate teams/team_members linkage.
  const team: TeamData = {
    id: user.id,
    name: null,
    booking_slug: null,
    owner_id: user.id,
  };

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name, booking_slug")
    .eq("user_id", user.id)
    .single();

  if (profile) {
    team.name = profile.business_name;
    team.booking_slug = profile.booking_slug;
  }

  return { team, role: "owner" };
}
