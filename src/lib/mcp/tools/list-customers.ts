import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { limitSchema, resolveLimit } from "../shared/schema";

export default defineTool({
  name: "list_customers",
  title: "List customers",
  description: "List or search the signed-in shop's customers by name, email, or phone.",
  inputSchema: {
    search: z.string().optional().describe("Text matched against name, email, and phone."),
    limit: limitSchema(25, 100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const take = resolveLimit(limit, 25, 100);
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("customers")
      .select(
        "id, name, first_name, last_name, email, phone, address, postal_code, total_services, lifetime_value, last_service_date, customer_segment",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(take);

    if (search?.trim()) {
      const term = search.trim().replace(/[%,]/g, " ");
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { customers: data ?? [] },
    };
  },
});
