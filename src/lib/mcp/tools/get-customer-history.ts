import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "get_customer_history",
  title: "Get customer history",
  description: "Fetch one customer with their vehicles and most recent service records.",
  inputSchema: { customer_id: z.string().uuid().describe("Customer UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ customer_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const supabase = supabaseForUser(ctx);

    const [customerRes, vehiclesRes, servicesRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, email, phone, address, postal_code, total_services, lifetime_value, last_service_date, notes")
        .eq("id", customer_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("vehicles")
        .select("id, year, make, model, engine, vin, license_plate, mileage, oil_type, oil_capacity, tire_size")
        .eq("customer_id", customer_id)
        .is("deleted_at", null),
      supabase
        .from("services")
        .select("id, service_number, service_type, status, service_date, total_cost, paid_amount, payment_status, technician, notes")
        .eq("customer_id", customer_id)
        .is("deleted_at", null)
        .order("service_date", { ascending: false })
        .limit(20),
    ]);

    const failure = customerRes.error ?? vehiclesRes.error ?? servicesRes.error;
    if (failure) return { content: [{ type: "text", text: failure.message }], isError: true };
    if (!customerRes.data) return { content: [{ type: "text", text: "No customer found with that id." }], isError: true };

    const payload = {
      customer: customerRes.data,
      vehicles: vehiclesRes.data ?? [],
      services: servicesRes.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
