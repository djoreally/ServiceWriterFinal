import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { errorResult, isoDate, jsonResult, checkRange } from "../shared/schema";

/**
 * ServiceWriter is a mobile-service product: there are no fixed branch locations.
 * "Location" is expressed three ways, all of which this tool returns:
 *  - configured service zones (`service_zones`: named areas with zip lists / radius)
 *  - the shop's marketplace service-area ZIPs (`business_profiles`)
 *  - the actual customer cities/ZIPs observed on appointments (demand geography)
 */
export default defineTool({
  name: "list_locations",
  title: "List service locations and areas",
  description:
    "List the shop's service geography and the identifiers needed to filter other tools by location. Returns (1) configured service zones with id, name, zip codes, centre point and radius, (2) the shop's marketplace service-area ZIP list and base city/state/postal code, and (3) observed demand geography: distinct customer cities/ZIPs on appointments in the given date range with appointment counts. Use the returned city / postal_code / service_zone_id values as filters for list_appointments, get_capacity, get_revenue_summary and get_booking_performance. ServiceWriter is mobile-service software, so there are no fixed branch locations.",
  inputSchema: {
    from_date: isoDate.optional().describe("Start of the window used to compute observed demand geography (YYYY-MM-DD). Defaults to 90 days before to_date."),
    to_date: isoDate.optional().describe("End of that window (YYYY-MM-DD). Defaults to today."),
    include_observed_geography: z
      .boolean()
      .optional()
      .describe("Include distinct customer cities/ZIPs seen on appointments (default true)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, include_observed_geography }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const supabase = supabaseForUser(ctx);

    const to = to_date ?? new Date().toISOString().slice(0, 10);
    const from =
      from_date ?? new Date(Date.parse(`${to}T00:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10);
    const range = checkRange(from, to, 730);
    if (!range.ok) return errorResult(range.message!);

    const wantObserved = include_observed_geography !== false;

    const [zonesRes, profileRes, apptRes] = await Promise.all([
      supabase
        .from("service_zones")
        .select("id, name, zone_type, zip_codes, center_lat, center_lng, radius_miles, priority, is_active")
        .order("priority", { ascending: true }),
      supabase
        .from("business_profiles")
        .select("business_name, city, state, postal_code, timezone, marketplace_service_area_zips")
        .maybeSingle(),
      wantObserved
        ? supabase
            .from("appointments")
            .select("customer_city, customer_state, customer_postal_code, service_zone_id, status")
            .is("deleted_at", null)
            .gte("scheduled_date", from)
            .lte("scheduled_date", to)
            .limit(5000)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    const failure = zonesRes.error ?? profileRes.error ?? apptRes.error;
    if (failure) return errorResult(failure.message);

    type Observed = {
      city: string | null;
      state: string | null;
      postal_code: string | null;
      appointments: number;
      cancelled: number;
    };
    const observedMap = new Map<string, Observed>();
    let withoutGeography = 0;
    for (const row of (apptRes.data ?? []) as Array<Record<string, unknown>>) {
      const city = (row.customer_city as string | null) ?? null;
      const state = (row.customer_state as string | null) ?? null;
      const postal = (row.customer_postal_code as string | null) ?? null;
      if (!city && !postal) {
        withoutGeography += 1;
        continue;
      }
      const key = `${(city ?? "").toLowerCase()}|${(state ?? "").toLowerCase()}|${postal ?? ""}`;
      const entry =
        observedMap.get(key) ?? { city, state, postal_code: postal, appointments: 0, cancelled: 0 };
      entry.appointments += 1;
      if (row.status === "cancelled") entry.cancelled += 1;
      observedMap.set(key, entry);
    }

    const observed = [...observedMap.values()].sort((a, b) => b.appointments - a.appointments);
    const scanned = apptRes.data?.length ?? 0;

    return jsonResult({
      service_zones: zonesRes.data ?? [],
      shop_base: profileRes.data ?? null,
      observed_geography: wantObserved
        ? {
            from_date: from,
            to_date: to,
            appointments_scanned: scanned,
            appointments_without_geography: withoutGeography,
            areas: observed,
          }
        : null,
      notes: [
        "ServiceWriter has no fixed branch locations; appointments carry the customer's service address city/state/postal code.",
        "`observed_geography` counts appointments by scheduled_date in the window, including cancellations (reported separately).",
        withoutGeography > 0
          ? `${withoutGeography} of ${scanned} appointments in this window have no city/postal code stored (typically manually created appointments, where only location_address may be present). City/ZIP filters on other tools cannot see those appointments.`
          : null,
        scanned >= 5000
          ? "Observed geography was computed from the first 5000 appointments in the window and may be incomplete; narrow the date range."
          : null,
      ].filter(Boolean),
    });
  },
});
