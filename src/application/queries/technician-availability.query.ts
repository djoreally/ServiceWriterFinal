/**
 * Technician Availability Queries & Commands
 * Abstracts technician_availability table CRUD.
 */
import { supabase } from "@/integrations/supabase/client";

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
  const { data } = await supabase
    .from("technician_availability" as any)
    .select("*")
    .eq("technician_id", technicianId);

  if (!data) return [];
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
  for (const row of rows) {
    const payload: Omit<TechnicianAvailabilityRecord, "id"> = {
      technician_id: technicianId,
      user_id: userId,
      weekday: row.weekday,
      is_available: row.is_available,
      start_time: row.start_time + ":00",
      end_time: row.end_time + ":00",
    };
    if (row.existingId) {
      await supabase.from("technician_availability" as any).update(payload).eq("id", row.existingId);
    } else {
      const { data: ins } = await supabase.from("technician_availability" as any).insert(payload).select().single();
      if (ins) row.existingId = (ins as unknown as TechnicianAvailabilityRecord).id;
    }
  }
}
