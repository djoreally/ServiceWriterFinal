import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "create_customer",
  title: "Create customer",
  description: "Create a new customer record in the signed-in shop's workspace.",
  inputSchema: {
    name: z.string().describe("Full customer name."),
    email: z.string().optional().describe("Email address."),
    phone: z.string().optional().describe("Phone number."),
    address: z.string().optional().describe("Service address."),
    postal_code: z.string().optional().describe("Postal / ZIP code."),
    notes: z.string().optional().describe("Free-form notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },

  handler: async ({ name, email, phone, address, postal_code, notes }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const trimmed = name.trim();
    if (!trimmed) return { content: [{ type: "text", text: "Customer name is required." }], isError: true };

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        user_id: ctx.getUserId(),
        name: trimmed,
        email: email?.trim() ? email.trim().toLowerCase() : null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        postal_code: postal_code?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select("id, name, email, phone, address, postal_code")
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { customer: data },
    };
  },
});
