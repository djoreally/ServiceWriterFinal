/** Availability read models shared by public booking and internal scheduling. */
import { productionSupabase as supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface AvailabilitySlot {
  time: string;
  available: boolean;
}

export interface BookedSlot {
  id?: string;
  scheduled_time: string;
  duration_minutes: number;
}

/** Public-booking compatibility path keyed by the workspace owner identity. */
export async function fetchBookedSlots(tenantUserId: string, date: string): Promise<BookedSlot[]> {
  const { data, error } = await supabase.rpc("get_booked_slots", {
    business_user_id: tenantUserId,
    booking_date: date,
  });
  if (error) throw new Error("Failed to fetch booked slots");
  return (data || []).map((slot: BookedSlot) => ({
    id: slot.id,
    scheduled_time: String(slot.scheduled_time).slice(0, 5),
    duration_minutes: Number(slot.duration_minutes || 60),
  }));
}

/**
 * Internal scheduler path. It resolves the selected workspace rather than the
 * signed-in user's id, so managers/dispatchers see the same conflicts as owners.
 */
export async function fetchWorkspaceBookedSlots(date: string): Promise<BookedSlot[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before checking availability.");

  const db = supabase as any;
  const [{ data: workspace, error: workspaceError }, { data: appointments, error: appointmentsError }] = await Promise.all([
    db.from("workspaces").select("timezone").eq("id", context.workspaceId).maybeSingle(),
    db.from("appointments")
      .select("id,starts_at,ends_at,status")
      .eq("workspace_id", context.workspaceId)
      .not("status", "in", '("cancelled","no_show")')
      .order("starts_at", { ascending: true }),
  ]);
  if (workspaceError) throw workspaceError;
  if (appointmentsError) throw appointmentsError;

  const timezone = workspace?.timezone || "UTC";
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (appointments || [])
    .filter((row: any) => dateFormatter.format(new Date(row.starts_at)) === date)
    .map((row: any) => ({
      id: row.id,
      scheduled_time: timeFormatter.format(new Date(row.starts_at)),
      duration_minutes: Math.max(1, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000)),
    }));
}

export async function fetchAvailability(
  tenantUserId: string,
  date: string,
  openingTime: string,
  closingTime: string,
  slotDuration: number,
  serviceDuration: number,
  bufferBefore: number = 0,
  bufferAfter: number = 0,
): Promise<AvailabilitySlot[]> {
  const bookedSlots = await fetchBookedSlots(tenantUserId, date);
  const slots: AvailabilitySlot[] = [];
  const [openHour, openMinute] = openingTime.split(":").map(Number);
  const [closeHour, closeMinute] = closingTime.split(":").map(Number);
  const openingMinutes = openHour * 60 + openMinute;
  const closingMinutes = closeHour * 60 + closeMinute;
  const blockedRanges = bookedSlots.map((slot) => {
    const [h, m] = slot.scheduled_time.split(":").map(Number);
    const startMinutes = h * 60 + m;
    return {
      start: startMinutes - bufferBefore,
      end: startMinutes + slot.duration_minutes + bufferAfter,
    };
  });

  for (let minutes = openingMinutes; minutes + serviceDuration <= closingMinutes; minutes += slotDuration) {
    const slotEnd = minutes + serviceDuration;
    const isBlocked = blockedRanges.some((range) => minutes < range.end && slotEnd > range.start);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push({
      time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      available: !isBlocked,
    });
  }
  return slots;
}
