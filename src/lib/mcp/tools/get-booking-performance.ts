import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { checkRange, daysBetween, errorResult, isoDate, jsonResult, round2 } from "../shared/schema";

type Window = { from_date: string; to_date: string };

interface WindowStats {
  window: Window;
  days: number;
  total_appointments: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  booked_value: number;
  average_booked_value: number | null;
  bookings_per_operating_day: number;
  breakdown: Array<{ key: string; appointments: number; booked_value: number }>;
}

export default defineTool({
  name: "get_booking_performance",
  title: "Get booking performance comparison",
  description:
    "Compare booking volume between a current window and a comparison window using live appointment data, so demand changes can be measured instead of guessed. For each window returns appointment counts, counts by status and by booking source, total and average booked value (estimated_cost), bookings per day, and a breakdown grouped by `city`, `postal_code`, `service`, `day`, `week` or `status`. If `compare_from_date`/`compare_to_date` are omitted, the immediately preceding window of equal length is used. Optional `city`, `postal_code`, `service_zone_id` and `status` filters apply identically to both windows. Returns raw counts and deltas only — no interpretation of whether demand is 'normal'.",
  inputSchema: {
    from_date: isoDate.describe("Start of the current window (YYYY-MM-DD)."),
    to_date: isoDate.describe("End of the current window, inclusive (YYYY-MM-DD). Max 180 days."),
    compare_from_date: isoDate.optional().describe("Start of the comparison window. Defaults to the equal-length window immediately before from_date."),
    compare_to_date: isoDate.optional().describe("End of the comparison window, inclusive."),
    group_by: z
      .enum(["city", "postal_code", "service", "day", "week", "status", "none"])
      .optional()
      .describe("Breakdown dimension within each window (default `city`)."),
    city: z.string().min(1).max(80).optional().describe("Restrict to this customer city."),
    postal_code: z.string().min(3).max(12).optional().describe("Restrict to this customer postal code."),
    service_zone_id: z.string().uuid().optional().describe("Restrict to appointments tagged to this service zone."),
    status: z
      .enum(["pending", "scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show", "any"])
      .optional()
      .describe("Appointment status filter (default `any`; cancellations are reported separately in by_status)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { from_date, to_date, compare_from_date, compare_to_date, group_by, city, postal_code, service_zone_id, status },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const range = checkRange(from_date, to_date, 180);
    if (!range.ok) return errorResult(range.message!);

    const span = daysBetween(from_date, to_date);
    const current: Window = { from_date, to_date };
    let comparison: Window;
    if (compare_from_date && compare_to_date) {
      const cmp = checkRange(compare_from_date, compare_to_date, 180);
      if (!cmp.ok) return errorResult(cmp.message!);
      comparison = { from_date: compare_from_date, to_date: compare_to_date };
    } else if (compare_from_date || compare_to_date) {
      return errorResult("Provide both `compare_from_date` and `compare_to_date`, or neither.");
    } else {
      const end = new Date(Date.parse(`${from_date}T00:00:00Z`) - 86_400_000);
      const start = new Date(end.getTime() - (span - 1) * 86_400_000);
      comparison = { from_date: start.toISOString().slice(0, 10), to_date: end.toISOString().slice(0, 10) };
    }

    const supabase = supabaseForUser(ctx);
    const dimension = group_by ?? "city";

    async function loadWindow(win: Window): Promise<WindowStats | { error: string }> {
      let query = supabase
        .from("appointments")
        .select(
          "id, title, status, source, scheduled_date, scheduled_time, estimated_cost, customer_city, customer_state, customer_postal_code, service_zone_id",
        )
        .is("deleted_at", null)
        .gte("scheduled_date", win.from_date)
        .lte("scheduled_date", win.to_date)
        .limit(5000);
      if (city) query = query.ilike("customer_city", city.trim());
      if (postal_code) query = query.eq("customer_postal_code", postal_code);
      if (service_zone_id) query = query.eq("service_zone_id", service_zone_id);
      if (status && status !== "any") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return { error: error.message };

      const rows = (data ?? []) as Array<Record<string, any>>;
      const byStatus: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      const buckets = new Map<string, { key: string; appointments: number; booked_value: number }>();
      let value = 0;

      for (const row of rows) {
        const st = String(row.status ?? "unknown");
        byStatus[st] = (byStatus[st] ?? 0) + 1;
        const src = String(row.source ?? "unknown");
        bySource[src] = (bySource[src] ?? 0) + 1;
        const cost = Number(row.estimated_cost ?? 0) || 0;
        value += cost;

        if (dimension !== "none") {
          const date = String(row.scheduled_date ?? "");
          const key =
            dimension === "city"
              ? String(row.customer_city ?? "unknown")
              : dimension === "postal_code"
                ? String(row.customer_postal_code ?? "unknown")
                : dimension === "service"
                  ? String(row.title ?? "unknown")
                  : dimension === "day"
                    ? date || "unknown"
                    : dimension === "week"
                      ? date
                        ? new Date(
                            Date.parse(`${date}T00:00:00Z`) -
                              new Date(`${date}T00:00:00Z`).getUTCDay() * 86_400_000,
                          )
                            .toISOString()
                            .slice(0, 10)
                        : "unknown"
                      : st;
          const bucket = buckets.get(key) ?? { key, appointments: 0, booked_value: 0 };
          bucket.appointments += 1;
          bucket.booked_value = round2(bucket.booked_value + cost);
          buckets.set(key, bucket);
        }
      }

      const days = daysBetween(win.from_date, win.to_date);
      return {
        window: win,
        days,
        total_appointments: rows.length,
        by_status: byStatus,
        by_source: bySource,
        booked_value: round2(value),
        average_booked_value: rows.length ? round2(value / rows.length) : null,
        bookings_per_operating_day: round2(rows.length / days),
        breakdown: [...buckets.values()].sort((a, b) => b.appointments - a.appointments),
      };
    }

    const [currentStats, comparisonStats] = await Promise.all([loadWindow(current), loadWindow(comparison)]);
    if ("error" in currentStats) return errorResult(currentStats.error);
    if ("error" in comparisonStats) return errorResult(comparisonStats.error);

    const delta = {
      appointments: currentStats.total_appointments - comparisonStats.total_appointments,
      appointments_percent:
        comparisonStats.total_appointments > 0
          ? round2(
              ((currentStats.total_appointments - comparisonStats.total_appointments) /
                comparisonStats.total_appointments) *
                100,
            )
          : null,
      booked_value: round2(currentStats.booked_value - comparisonStats.booked_value),
    };

    return jsonResult({
      filters: {
        city: city ?? null,
        postal_code: postal_code ?? null,
        service_zone_id: service_zone_id ?? null,
        status: status ?? "any",
      },
      group_by: dimension,
      current: currentStats,
      comparison: comparisonStats,
      delta,
      limitations: [
        "Counts are appointments by scheduled_date; `booked_value` is appointments.estimated_cost, not settled revenue (use get_revenue_summary for that).",
        "Location filters use the customer city/postal code recorded on the appointment; appointments missing that data are grouped under `unknown`.",
        "No baseline or seasonality model exists in ServiceWriter; comparisons are raw window-over-window counts only.",
      ],
    });
  },
});
