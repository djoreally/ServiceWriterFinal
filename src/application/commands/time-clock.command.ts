/**
 * Time Clock Commands — Write operations for clock in/out and breaks.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the work-orders Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";

export async function clockIn(location: unknown): Promise<string> {
  const response = await apiClient.post<{ data: string | null }>("/v1/time-clock/clock-in", {
    location: location ?? null,
  });
  return response.data as string;
}

export async function clockOut(location: unknown): Promise<void> {
  await apiClient.post("/v1/time-clock/clock-out", { location: location ?? null });
}

export async function startBreak(): Promise<void> {
  await apiClient.post("/v1/time-clock/break/start");
}

export async function endBreak(): Promise<void> {
  await apiClient.post("/v1/time-clock/break/end");
}
