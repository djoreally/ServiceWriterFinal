import { supabase } from "@/integrations/supabase/client";
import type { ReportsRange } from "@/application/queries/reports-canonical.query";

export interface BookingFunnelData {
  sessions: number;
  recovered: number;
  abandoned: number;
  stages: Array<{ step: number; label: string; sessions: number }>;
  trackingState: "active" | "no_activity";
}

const STEP_LABELS = ["Booking opened", "Service selected", "Vehicle details", "Date and time", "Contact and payment"];

export async function fetchBookingFunnel(range: ReportsRange): Promise<BookingFunnelData> {
  const { data, error } = await supabase
    .from("abandoned_bookings")
    .select("id, session_id, last_step, recovered, status, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());
  if (error) throw error;

  // One active/recovered row represents one persisted booking session. The tracker
  // upserts progress, so counting rows does not multiply a session at every step.
  const sessions = data ?? [];
  const stages = STEP_LABELS.map((label, index) => ({
    step: index + 1,
    label,
    sessions: sessions.filter((row) => Number(row.last_step || 0) >= index + 1).length,
  }));
  return {
    sessions: sessions.length,
    recovered: sessions.filter((row) => row.recovered || row.status === "recovered").length,
    abandoned: sessions.filter((row) => !row.recovered && ["emailed", "expired", "failed"].includes(row.status || "")).length,
    stages,
    trackingState: sessions.length ? "active" : "no_activity",
  };
}
