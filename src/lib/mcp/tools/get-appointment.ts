import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "get_appointment",
  title: "Get appointment",
  description: "Fetch one appointment by id, including its linked customer and vehicle details.",
  inputSchema: { appointment_id: z.string().uuid().describe("Appointment UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ appointment_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, title, description, status, dispatch_status, scheduled_date, scheduled_time, duration_minutes, guest_name, guest_phone, guest_email, location_address, estimated_cost, tax_amount, payment_status, notes, dispatch_notes, assigned_technician_id, assigned_van_id, customers:customer_id (id, name, email, phone), vehicles:vehicle_id (id, year, make, model, engine, vin, license_plate, mileage, tire_size)",
      )
      .eq("id", appointment_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "No appointment found with that id." }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { appointment: data },
    };
  },
});
