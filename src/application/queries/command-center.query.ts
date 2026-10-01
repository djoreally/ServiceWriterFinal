/** Command Center Query — canonical Service Writer operational reads.
 *
 * Phase 2: technician reads go through the typed API client
 * (`@/lib/api-client`) to the work-orders Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { fetchOperationalJobsByDateRange } from "./operational-jobs.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

/** Fetch only the requested Service Writer operating day. */
export async function fetchTodayJobs(userId: string, dateStr: string) {
  return fetchOperationalJobsByDateRange(userId, dateStr, dateStr);
}

interface CommandCenterTechnicianRow {
  id: string;
  user_id: string | null;
  full_name: string | null;
  assigned_van_id: string | null;
}

/**
 * Active dispatch technicians are active workspace members, not rows in the
 * retired Lovable `technicians`/`vans` tables. Final does not yet persist live
 * technician GPS, so location is intentionally null until that capability is
 * rebuilt on the canonical schema.
 */
export async function fetchActiveTechnicians(_userId: string) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    const response = await apiClient.get<{
      data: { technicians: CommandCenterTechnicianRow[] };
    }>("/v1/command-center/technicians", {
      query: {
        workspace_id: context.workspaceId,
        from: startOfDay.toISOString(),
        to: endOfDay.toISOString(),
      },
    });

    return {
      data: (response.data.technicians ?? []).map((tech) => ({
        id: tech.user_id ?? tech.id,
        name: tech.full_name || "Technician",
        status: "active",
        avatar_url: null,
        current_location: null,
        assigned_van_id: tech.assigned_van_id ?? null,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technicians") };
  }
}
