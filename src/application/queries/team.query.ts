/**
 * Team Query
 * Fetches team/business context for the current user.
 */

import { apiClient } from "@/lib/api-client";

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

  return apiClient.get<{ team: TeamData; role: string } | null>("/v1/platform/team/data");
}
