import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refund"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), amount: z.number().positive(), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal("send_invoice"), workspace_id: z.string().uuid(), payment_id: z.string().uuid() }),
  z.object({ action: z.literal("send_manual_invoice"), workspace_id: z.string().uuid(), invoice_id: z.string().uuid(), recipient_email: z.string().email().optional(), subject: z.string().max(200).optional(), message: z.string().max(10000).optional() }),
  z.object({ action: z.literal("payment_link"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), amount: z.number().positive(), customer_email: z.string().email(), customer_name: z.string().max(200).optional(), description: z.string().max(500).optional() }),
  z.object({ action: z.literal("manual_payment"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), amount: z.number().positive(), payment_method: z.string().max(40), notes: z.string().max(1000).optional(), waive_fees: z.boolean().optional(), waive_tax: z.boolean().optional(), waive_remaining: z.boolean().optional() }),
  z.object({ action: z.literal("verify_booking"), workspace_id: z.string().uuid(), session_id: z.string().min(1).max(200) }),
]);

const functions: Record<string, string> = {
  refund: "stripe-refund",
  send_invoice: "send-invoice",
  send_manual_invoice: "send-manual-invoice",
  payment_link: "create-invoice-payment-link",
  manual_payment: "record-manual-payment",
  verify_booking: "verify-booking-payment",
};

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { action, workspace_id: _workspaceId, ...payload } = body;
    const { data, error } = await supabase.functions.invoke(functions[action], { body: payload });
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
