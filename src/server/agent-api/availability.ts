/**
 * Rules-honoring availability for agent callers.
 *
 * This module exposes, as a read, exactly the checks the canonical booking
 * core (`bookAppointmentCore`) enforces at write time — business hours,
 * minimum lead time, blackout dates, buffer-expanded schedule conflicts —
 * plus the workspace's service-radius fence when the workspace has one
 * configured. All rule values come from the workspace's OWN
 * `workspace_settings` row and its own appointments: nothing is hardcoded
 * per shop, and nothing here re-implements a divergent rule set. If the
 * core's checks change, this read must change with them.
 */
import { configuredHours, localParts } from "@/server/appointments/book-appointment";
import {
  conflictWindow,
  validateLocalAvailability,
  type AvailabilityViolation,
} from "@/server/scheduling/appointment-availability";

export interface WorkspaceScheduling {
  timezone: string;
  settings: Record<string, any>;
}

export async function loadWorkspaceScheduling(db: any, workspaceId: string): Promise<WorkspaceScheduling> {
  const [{ data: workspace, error: we }, { data: settings, error: se }] = await Promise.all([
    db.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle(),
    db
      .from("workspace_settings")
      .select(
        "day_hours,opening_time,closing_time,working_days,buffer_time_before,buffer_time_after,min_lead_time_hours,max_advance_days,slot_duration_minutes,allow_multi_day_bookings,require_approval,tax_rate,service_radius_miles,operational_settings",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (we) throw we;
  if (se) throw se;
  return {
    timezone: (workspace as { timezone?: string } | null)?.timezone || "UTC",
    settings: (settings ?? {}) as Record<string, any>,
  };
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * The workspace's fence center, read from its own settings
 * (operational_settings.service_center {lat,lng}); null when the
 * workspace has not configured one.
 */
function fenceCenter(settings: Record<string, any>): { lat: number; lng: number } | null {
  const ops = settings.operational_settings;
  const center = ops && typeof ops === "object" ? (ops as Record<string, any>).service_center : null;
  const lat = Number(center?.lat ?? center?.latitude);
  const lng = Number(center?.lng ?? center?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export interface SlotCheckInput {
  startsAt: string;
  endsAt: string;
  serviceLat?: number | null;
  serviceLng?: number | null;
}

export interface SlotCheckResult {
  available: boolean;
  violations: string[];
  checks: {
    business_hours: boolean;
    lead_time: boolean;
    blackout_date: boolean;
    schedule_conflict: boolean;
    service_radius: boolean | "not_configured" | "not_applicable";
  };
  timezone: string;
}

/** Run every booking rule against one proposed slot. Mirrors the core. */
export async function checkSlotAvailability(
  db: any,
  workspaceId: string,
  input: SlotCheckInput,
  preloaded?: WorkspaceScheduling,
): Promise<SlotCheckResult> {
  const { timezone, settings } = preloaded ?? (await loadWorkspaceScheduling(db, workspaceId));
  const startsAtMs = Date.parse(input.startsAt);
  const start = localParts(input.startsAt, timezone);
  const end = localParts(input.endsAt, timezone);

  const { data: blackoutRows, error: be } = await db
    .from("workspace_blackout_dates")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("blocked_date", start.date)
    .limit(1);
  if (be) throw be;
  const blackout = Array.isArray(blackoutRows) && blackoutRows.length > 0;

  const violation: AvailabilityViolation | null = validateLocalAvailability({
    start,
    end,
    settings,
    startsAtMs,
    blackout,
  });

  // Conflict check with the same buffer expansion the booking core uses.
  const { queryStart, queryEnd } = conflictWindow({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    bufferTimeBefore: settings.buffer_time_before,
    bufferTimeAfter: settings.buffer_time_after,
  });
  const { data: conflicts, error: ce } = await db
    .from("appointments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .not("status", "in", '("cancelled","no_show")')
    .lt("starts_at", queryEnd)
    .gt("ends_at", queryStart)
    .limit(1);
  if (ce) throw ce;
  const hasConflict = Array.isArray(conflicts) && conflicts.length > 0;

  // Service-radius fence: only when the workspace configured a radius and
  // a center, and the caller supplied a service location.
  let radiusCheck: SlotCheckResult["checks"]["service_radius"] = "not_applicable";
  let radiusViolation = false;
  const radiusMiles = Number(settings.service_radius_miles);
  if (Number.isFinite(radiusMiles) && radiusMiles > 0) {
    const center = fenceCenter(settings);
    if (!center) {
      radiusCheck = "not_configured";
    } else if (typeof input.serviceLat === "number" && typeof input.serviceLng === "number") {
      const miles = haversineMiles(center.lat, center.lng, input.serviceLat, input.serviceLng);
      radiusViolation = miles > radiusMiles;
      radiusCheck = !radiusViolation;
    }
  }

  const violations: string[] = [];
  if (violation) violations.push(violation);
  if (hasConflict && violation !== "schedule_conflict") violations.push("schedule_conflict");
  if (radiusViolation) violations.push("outside_service_radius");

  return {
    available: violations.length === 0,
    violations,
    checks: {
      business_hours: violation !== "outside_business_hours",
      lead_time: violation !== "lead_time",
      blackout_date: !blackout,
      schedule_conflict: !hasConflict,
      service_radius: radiusCheck,
    },
    timezone,
  };
}

/**
 * Open start times for one local date: candidate starts stepped by the
 * workspace's slot duration across its configured open hours, each run
 * through the full rule check (lead time, blackout, conflicts, fence).
 */
export async function listOpenSlots(
  db: any,
  workspaceId: string,
  input: { date: string; durationMinutes: number; serviceLat?: number | null; serviceLng?: number | null },
): Promise<{ date: string; timezone: string; slots: Array<{ starts_at: string; ends_at: string }> }> {
  const scheduling = await loadWorkspaceScheduling(db, workspaceId);
  const { timezone, settings } = scheduling;

  // Anchor at midday UTC then read the local parts to get the weekday for
  // the requested local date without timezone drift.
  const anchor = new Date(`${input.date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
    .format(anchor)
    .toLowerCase();
  const hours = configuredHours(settings, weekday);
  if (!hours.isOpen) return { date: input.date, timezone, slots: [] };

  const step = Math.max(5, Number(settings.slot_duration_minutes) || 15);
  const slots: Array<{ starts_at: string; ends_at: string }> = [];

  // Convert local wall-clock minutes on `date` in `timezone` to a UTC ISO
  // instant using the offset the zone has on that date.
  const localToIso = (minutesOfDay: number): string => {
    const guess = new Date(`${input.date}T00:00:00Z`).getTime() + minutesOfDay * 60_000;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const offset = asUtc - guess;
    return new Date(guess - offset).toISOString();
  };

  for (let m = hours.open; m + input.durationMinutes <= hours.close; m += step) {
    const startsAt = localToIso(m);
    const endsAt = new Date(Date.parse(startsAt) + input.durationMinutes * 60_000).toISOString();
    const result = await checkSlotAvailability(
      db,
      workspaceId,
      { startsAt, endsAt, serviceLat: input.serviceLat, serviceLng: input.serviceLng },
      scheduling,
    );
    if (result.available) slots.push({ starts_at: startsAt, ends_at: endsAt });
  }
  return { date: input.date, timezone, slots };
}
