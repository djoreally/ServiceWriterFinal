/**
 * Technician Tracking Query — canonical appointment schema.
 *
 * Reads go through the typed API client to the work-orders Hono router.
 * The Lovable `location_history` table is retired in Final, so its read
 * returns whatever the server has (empty when the table is gone).
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function fetchTrackingTechnicians() {
  try {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return { data: [], error: null };
    const response = await apiClient.get<{ data: unknown[] }>("/v1/technicians", {
      query: { user_id: user.id },
    });
    return { data: response.data ?? [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technicians") };
  }
}

export async function fetchActiveDispatchJobs() {
  try {
    const response = await apiClient.get<{ data: unknown[] }>("/v1/tech-os/tracking-dispatch-jobs");
    return { data: response.data ?? [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load dispatch jobs") };
  }
}

export async function fetchTechLocationHistory(technicianId: string) {
  try {
    const response = await apiClient.get<{ data: unknown[] }>("/v1/tech-os/location-history", {
      query: { technician_id: technicianId },
    });
    return { data: response.data ?? [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load location history") };
  }
}

const SUBSCRIBE_POLL_MS = 20000;

/** Fingerprint the tracking reads; used to detect changes between polls. */
async function trackingFingerprint(): Promise<string | null> {
  try {
    const [techs, jobs] = await Promise.all([
      fetchTrackingTechnicians().catch(() => ({ data: [] as unknown[] })),
      fetchActiveDispatchJobs().catch(() => ({ data: [] as unknown[] })),
    ]);
    const stamp = (rows: unknown[]) => rows.map((row) => {
      const r = meta(row);
      return `${String(r.id ?? "")}:${String(r.updated_at ?? r.recorded_at ?? "")}`;
    }).sort().join("|");
    return `${stamp((techs.data ?? []) as unknown[])}#${stamp((jobs.data ?? []) as unknown[])}`;
  } catch {
    return null;
  }
}

/**
 * Subscribe to technician/location changes.
 *
 * There is no realtime primitive on the sanctioned API client, so this polls
 * the tracking reads and invokes the matching callback when the underlying
 * data changes. Only `unsubscribe` is used by callers; the exported
 * parameter list is unchanged.
 */
export function subscribeToTrackingChanges(onTechChange: () => void, onLocationChange: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let last: string | null | undefined;
  let lastLocationPart: string | null | undefined;

  const check = async () => {
    if (stopped) return;
    const fingerprint = await trackingFingerprint();
    if (fingerprint == null) return;
    const [techPart, jobPart] = fingerprint.split("#");
    if (last === undefined) {
      last = fingerprint;
      lastLocationPart = jobPart ?? null;
      return;
    }
    if (techPart !== last.split("#")[0]) onTechChange();
    if ((jobPart ?? null) !== lastLocationPart) onLocationChange();
    last = fingerprint;
    lastLocationPart = jobPart ?? null;
  };

  void check();
  timer = setInterval(() => { void check(); }, SUBSCRIBE_POLL_MS);

  return {
    channel: null,
    unsubscribe: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
