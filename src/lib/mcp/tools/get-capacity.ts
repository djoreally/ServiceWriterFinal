import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { checkRange, eachDate, errorResult, isoDate, jsonResult, round2 } from "../shared/schema";
import { isOperatingDay, resolveDayWindow } from "../../business-hours";

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export default defineTool({
  name: "get_capacity",
  title: "Get scheduling capacity",
  description:
    "Read the shop's real scheduling capacity per day over a date range (max 62 days), using the shop's configured business hours, slot length, buffers, blocked dates and active technician count — not an invented model. For each date returns whether the shop operates, the open/close window, total bookable minutes, booked minutes and job count from live appointments, remaining open minutes, an approximate open-slot count at the configured slot length, and utilisation percent. Optional `city` / `postal_code` filters do NOT reduce capacity (capacity is shop-wide for mobile service) but add a `booked_in_location` count so you can compare demand in an area against total available capacity.",
  inputSchema: {
    from_date: isoDate.describe("First date to report (YYYY-MM-DD)."),
    to_date: isoDate.describe("Last date to report, inclusive (YYYY-MM-DD). Max 62 days from from_date."),
    city: z.string().min(1).max(80).optional().describe("Customer city to count separately as `booked_in_location`."),
    postal_code: z.string().min(3).max(12).optional().describe("Customer postal code to count separately as `booked_in_location`."),
    technician_id: z.string().uuid().optional().describe("Restrict booked-job counting to one technician."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, city, postal_code, technician_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const range = checkRange(from_date, to_date, 62);
    if (!range.ok) return errorResult(range.message!);
    const supabase = supabaseForUser(ctx);

    const [profileRes, blockedRes, apptRes, techRes] = await Promise.all([
      supabase
        .from("business_profiles")
        .select(
          "timezone, working_days, day_hours, opening_time, closing_time, slot_duration_minutes, buffer_time_before, buffer_time_after, min_lead_time_hours, max_advance_days, booking_enabled",
        )
        .maybeSingle(),
      supabase.from("blocked_dates").select("blocked_date, reason").gte("blocked_date", from_date).lte("blocked_date", to_date),
      supabase
        .from("appointments")
        .select(
          "id, scheduled_date, scheduled_time, duration_minutes, estimated_duration_minutes, status, assigned_technician_id, customer_city, customer_postal_code",
        )
        .is("deleted_at", null)
        .gte("scheduled_date", from_date)
        .lte("scheduled_date", to_date)
        .limit(5000),
      supabase.from("technicians").select("id, name, is_active, max_jobs_per_day").eq("is_active", true),
    ]);

    const failure = profileRes.error ?? blockedRes.error ?? apptRes.error ?? techRes.error;
    if (failure) return errorResult(failure.message);
    if (!profileRes.data) {
      return errorResult(
        "No business profile is available for this account, so configured hours and slot length cannot be read. Capacity cannot be computed without it.",
      );
    }

    const profile = profileRes.data as Record<string, unknown>;
    const slotMinutes = Number(profile.slot_duration_minutes ?? 0) || 30;
    const bufferBefore = Number(profile.buffer_time_before ?? 0) || 0;
    const bufferAfter = Number(profile.buffer_time_after ?? 0) || 0;
    const technicians = (techRes.data ?? []) as Array<{ id: string; name: string | null; max_jobs_per_day: number | null }>;
    const techCount = Math.max(technicians.length, 1);

    const blocked = new Map<string, string | null>();
    for (const row of (blockedRes.data ?? []) as Array<{ blocked_date: string; reason: string | null }>) {
      blocked.set(row.blocked_date, row.reason);
    }

    const appointments = (apptRes.data ?? []) as Array<Record<string, unknown>>;
    const cityKey = city?.trim().toLowerCase();

    const days = eachDate(from_date, to_date).map((date) => {
      const dateObj = new Date(`${date}T12:00:00Z`);
      const operating = isOperatingDay(
        profile.day_hours as Record<string, unknown> | null,
        profile.working_days as string[] | null,
        dateObj,
      );
      const window = operating
        ? resolveDayWindow(
            profile.day_hours as Record<string, unknown> | null,
            dateObj,
            (profile.opening_time as string | null) ?? null,
            (profile.closing_time as string | null) ?? null,
          )
        : null;
      const isBlocked = blocked.has(date);

      const dayAppts = appointments.filter((a) => a.scheduled_date === date);
      const active = dayAppts.filter((a) => a.status !== "cancelled");
      const counted = technician_id
        ? active.filter((a) => a.assigned_technician_id === technician_id)
        : active;

      const bookedMinutes = counted.reduce((sum, a) => {
        const duration = Number(a.duration_minutes ?? a.estimated_duration_minutes ?? 0) || slotMinutes;
        return sum + duration + bufferBefore + bufferAfter;
      }, 0);

      const windowMinutes = window ? Math.max(minutesOfDay(window.close) - minutesOfDay(window.open), 0) : 0;
      const capacityMinutes = isBlocked ? 0 : windowMinutes * (technician_id ? 1 : techCount);
      const remainingMinutes = Math.max(capacityMinutes - bookedMinutes, 0);

      const bookedInLocation = (cityKey || postal_code)
        ? active.filter(
            (a) =>
              (cityKey ? String(a.customer_city ?? "").toLowerCase() === cityKey : true) &&
              (postal_code ? String(a.customer_postal_code ?? "") === postal_code : true),
          ).length
        : null;

      return {
        date,
        is_operating_day: operating && !isBlocked,
        blocked: isBlocked,
        blocked_reason: blocked.get(date) ?? null,
        open_time: window?.open ?? null,
        close_time: window?.close ?? null,
        capacity_minutes: capacityMinutes,
        booked_minutes: bookedMinutes,
        remaining_minutes: remainingMinutes,
        approx_open_slots: Math.floor(remainingMinutes / slotMinutes),
        booked_jobs: counted.length,
        cancelled_jobs: dayAppts.length - active.length,
        utilization_percent: capacityMinutes > 0 ? round2((bookedMinutes / capacityMinutes) * 100) : null,
        booked_in_location: bookedInLocation,
      };
    });

    const totals = days.reduce(
      (acc, d) => ({
        capacity_minutes: acc.capacity_minutes + d.capacity_minutes,
        booked_minutes: acc.booked_minutes + d.booked_minutes,
        remaining_minutes: acc.remaining_minutes + d.remaining_minutes,
        booked_jobs: acc.booked_jobs + d.booked_jobs,
        operating_days: acc.operating_days + (d.is_operating_day ? 1 : 0),
      }),
      { capacity_minutes: 0, booked_minutes: 0, remaining_minutes: 0, booked_jobs: 0, operating_days: 0 },
    );

    return jsonResult({
      from_date,
      to_date,
      configuration: {
        timezone: profile.timezone ?? null,
        slot_duration_minutes: slotMinutes,
        buffer_time_before: bufferBefore,
        buffer_time_after: bufferAfter,
        min_lead_time_hours: profile.min_lead_time_hours ?? null,
        max_advance_days: profile.max_advance_days ?? null,
        booking_enabled: profile.booking_enabled ?? null,
        active_technicians: technicians.length,
        capacity_basis: technician_id
          ? "single technician requested; capacity = configured daily window"
          : "configured daily window multiplied by active technician count",
      },
      days,
      totals: {
        ...totals,
        utilization_percent:
          totals.capacity_minutes > 0 ? round2((totals.booked_minutes / totals.capacity_minutes) * 100) : null,
      },
      limitations: [
        "Capacity is derived from configured business hours, slot length, buffers, blocked dates and active technician count. ServiceWriter does not store an explicit per-day capacity number.",
        "Travel time between mobile jobs is not deducted from capacity_minutes; remaining_minutes is therefore an upper bound.",
        appointments.length >= 5000
          ? "Appointment scan hit the 5000-row cap; narrow the date range for exact numbers."
          : null,
      ].filter(Boolean),
    });
  },
});
