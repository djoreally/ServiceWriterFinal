import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { limitSchema, resolveLimit } from "../shared/schema";

export default defineTool({
  name: "list_services",
  title: "List services",
  description:
    "List the services the signed-in shop offers, with name, price, estimated duration and active flag.",
  inputSchema: {
    active_only: z.boolean().optional().describe("Only return active catalog entries (default true)."),
    limit: limitSchema(50, 200),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const take = resolveLimit(limit, 50, 200);
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("service_catalog")
      .select("id, name, description, category, default_price, labor_rate, estimated_duration, is_active, is_upsell, skill_level")
      .order("sort_order", { ascending: true })
      .limit(take);

    if (active_only !== false) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { services: data ?? [] },
    };
  },
});
