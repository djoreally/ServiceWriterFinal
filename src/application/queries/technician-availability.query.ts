/**
 * Technician Availability Queries & Commands
 * Abstracts technician_availability table CRUD.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";

export interface AvailabilityRow {
  id?: string;
  weekday: string;
  is_available: boolean;
  start_time: string;
  end_time: string;
}

interface TechnicianAvailabilityRecord extends AvailabilityRow {
  technician_id: string;
  user_id: string;
}

export async function fetchTechnicianAvailability(technicianId: string): Promise<AvailabilityRow[]> {
  const response = await apiClient.get<{ data: TechnicianAvailabilityRecord[] | null }>(
    "/v1/appointments/technician-availability",
    { query: { technician_id: technicianId } },
  );

  const data = response.data ?? [];
  if (!data.length) return [];
  return (data as unknown as TechnicianAvailabilityRecord[]).map((r) => ({
    id: r.id,
    weekday: r.weekday,
    is_available: r.is_available ?? false,
    start_time: r.start_time?.slice(0, 5) ?? "08:00",
    end_time: r.end_time?.slice(0, 5) ?? "17:00",
  }));
}

export async function saveTechnicianAvailability(
  technicianId: string,
  userId: string,
  rows: Array<{
    weekday: string;
    is_available: boolean;
    start_time: string;
    end_time: string;
    existingId?: string;
  }>
): Promise<void> {
  const response = await apiClient.post<{ data: { rows: Array<{ id: string }> } | null }>(
    "/v1/appointments/technician-availability",
    {
      technician_id: technicianId,
      user_id: userId,
      rows: rows.map((row) => ({
        weekday: row.weekday,
        is_available: row.is_available,
        start_time: `${row.start_time}:00`,
        end_time: `${row.end_time}:00`,
        existingId: row.existingId ?? null,
      })),
    },
  );
  const saved = response.data?.rows ?? [];
  rows.forEach((row, index) => {
    if (!row.existingId && saved[index]?.id) row.existingId = saved[index].id;
  });
}
