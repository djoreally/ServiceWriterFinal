import { useEffect, useState, useCallback } from "react";
import { fetchTeamData, type TeamData } from "@/application/queries/team.query";

interface UseTeamResult {
  teamId: string | null;
  team: TeamData | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * useTeam hook - Returns user's team context.
 *
 * Uses canonical `teams`/`team_members` tables when available, with
 * legacy single-tenant fallback in `fetchTeamData()` for older records.
 */
export function useTeam(): UseTeamResult {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchTeamData();
      if (!result) {
        setTeamId(null);
        setTeam(null);
        setRole(null);
      } else {
        setTeamId(result.team.id);
        setTeam(result.team);
        setRole(result.role);
      }
    } catch (err) {
      console.error("[useTeam] Error fetching team:", err);
      setError("Failed to fetch team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  return { teamId, team, role, loading, error, refetch: fetchTeam };
}
