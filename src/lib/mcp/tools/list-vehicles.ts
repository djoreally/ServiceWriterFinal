import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { errorResult, jsonResult, limitSchema, resolveLimit, sanitizeTerm } from "../shared/schema";

export default defineTool({
  name: "list_vehicles",
  title: "List vehicles",
  description:
    "List or search the vehicles on file for the signed-in shop, newest first. Returns year/make/model/engine, VIN, plate, mileage, oil and tire specs, and the linked customer (name, city/postal code where stored on the customer record). Filter with `search` (matched against make, model, VIN, and plate), `customer_id`, `make`, or `year`. Use this to size vehicle-segment marketing (for example fleets of a given make or vehicles due for an oil service).",
  inputSchema: {
    search: z.string().min(1).max(120).optional().describe("Text matched against make, model, VIN, and license plate."),
    customer_id: z.string().uuid().optional().describe("Only vehicles belonging to this customer UUID."),
    make: z.string().min(1).max(60).optional().describe("Exact-ish make filter (case-insensitive contains)."),
    year: z.number().int().min(1900).max(2100).optional().describe("Exact model year."),
    limit: limitSchema(25, 200),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, customer_id, make, year, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const take = resolveLimit(limit, 25, 200);
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("vehicles")
      .select(
        "id, customer_id, year, make, model, engine, vin, license_plate, plate_state, color, mileage, oil_type, oil_capacity, tire_size, tire_size_front, tire_size_rear, created_at, updated_at, customers:customer_id (id, name, postal_code, customer_segment, last_service_date)",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(take);

    if (customer_id) query = query.eq("customer_id", customer_id);
    if (year !== undefined) query = query.eq("year", year);
    if (make) query = query.ilike("make", `%${make.trim()}%`);

    const term = sanitizeTerm(search);
    if (term) {
      query = query.or(`make.ilike.%${term}%,model.ilike.%${term}%,vin.ilike.%${term}%,license_plate.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) return errorResult(error.message);

    return jsonResult({ vehicles: data ?? [], returned: data?.length ?? 0, limit: take });
  },
});
