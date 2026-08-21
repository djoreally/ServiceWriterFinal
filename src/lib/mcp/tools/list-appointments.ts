import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { errorResult, isoDate, jsonResult, limitSchema, resolveLimit } from "../shared/schema";

export default defineTool({
  name: "list_appointments",
  title: "List appointments",
  description:
    "List the signed-in shop's appointments, newest scheduled date first. Returns the service title, status and dispatch status, scheduled date/time and duration, the customer's service city/state/postal code and address, estimated cost, payment status, booking source, assigned technician and the service zone — enough to analyse demand, booking mix and geography. Filter by `status`, a scheduled-date range (`from_date`/`to_date`, YYYY-MM-DD), `city`, `state`, `postal_code`, `service_zone_id`, `source`, or `technician_id`.",
  inputSchema: {
    status: z
      .enum(["pending", "scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"])
      .optional()
      .describe("Appointment status filter."),
    from_date: isoDate.optional().describe("Earliest scheduled date, YYYY-MM-DD."),
    to_date: isoDate.optional().describe("Latest scheduled date, YYYY-MM-DD."),
    city: z.string().min(1).max(80).optional().describe("Customer service city (case-insensitive exact match)."),
    state: z.string().min(2).max(40).optional().describe("Customer service state."),
    postal_code: z.string().min(3).max(12).optional().describe("Customer service postal code."),
    service_zone_id: z.string().uuid().optional().describe("Appointments tagged to this service zone (see list_locations)."),
    source: z.string().min(1).max(40).optional().describe("Booking source as stored on the appointment: manual, import, online_booking or public_booking."),
    technician_id: z.string().uuid().optional().describe("Only appointments assigned to this technician."),
    limit: limitSchema(25, 200),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { status, from_date, to_date, city, state, postal_code, service_zone_id, source, technician_id, limit },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const take = resolveLimit(limit, 25, 200);
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("appointments")
      .select(
        "id, title, status, dispatch_status, scheduled_date, scheduled_time, duration_minutes, estimated_duration_minutes, guest_name, guest_phone, guest_email, location_address, customer_city, customer_state, customer_postal_code, service_zone_id, source, estimated_cost, payment_status, assigned_technician_id, customer_id, vehicle_id, service_catalog_id, created_at, notes",
      )
      .is("deleted_at", null)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: true })
      .limit(take);

    if (status) query = query.eq("status", status);
    if (from_date) query = query.gte("scheduled_date", from_date);
    if (to_date) query = query.lte("scheduled_date", to_date);
    if (city) query = query.ilike("customer_city", city.trim());
    if (state) query = query.ilike("customer_state", state.trim());
    if (postal_code) query = query.eq("customer_postal_code", postal_code.trim());
    if (service_zone_id) query = query.eq("service_zone_id", service_zone_id);
    if (source) query = query.eq("source", source.trim());
    if (technician_id) query = query.eq("assigned_technician_id", technician_id);

    const { data, error } = await query;
    if (error) return errorResult(error.message);

    return jsonResult({ appointments: data ?? [], returned: data?.length ?? 0, limit: take });
  },
});
