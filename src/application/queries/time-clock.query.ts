/**
 * Time clock queries — Read operations for time clock data.
 */
import { apiClient } from "@/lib/api-client";

export interface TimeClockEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_duration_minutes: number;
  status: "active" | "on_break" | "completed" | "edited";
  total_hours: number | null;
  regular_hours: number | null;
  overtime_hours: number | null;
  clock_in_location: { lat: number; lng: number; address?: string } | null;
  clock_out_location: { lat: number; lng: number; address?: string } | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

interface TimeClockResponse {
  entries: TimeClockEntry[];
  current: TimeClockEntry | null;
}

function toPublicEntry(entry: TimeClockEntry): TimeClockEntry {
  return entry as unknown as TimeClockEntry;
}

export async function fetchTimeClockData() {
  const response = await apiClient.get<{ data: TimeClockResponse }>("/v1/time-clock");
  const payload = response.data;
  return {
    activeEntry: payload.current ? toPublicEntry(payload.current) : null,
    entries: payload.entries.map(toPublicEntry),
  };
}
