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

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);

    if (body.action === "manual_payment") {
      if (body.waive_fees || body.waive_tax || body.waive_remaining) {
        return json({ error: { code: "adjustment_required", message: "Fee, tax, and remaining-balance waivers require the adjustment workflow and cannot be embedded in a payment receipt." } }, { status: 409 });
      }

      const { data: current, error: currentError } = await supabase
        .from("payments")
        .select("id,invoice_id,customer_id,status,metadata")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .single();
      if (currentError || !current) throw currentError ?? new Error("Payment not found");
      if (current.status === "succeeded") {
        return json({ data: { success: true, payment_id: current.id, already_recorded: true } });
      }
      if (current.status === "refunded" || current.status === "partially_refunded") {
        return json({ error: { code: "invalid_payment_state", message: "A refunded payment cannot be re-recorded as a manual payment." } }, { status: 409 });
      }

      // Legacy UI sends cents. Final's canonical ledger stores dollars.
      const amountDollars = Number((body.amount / 100).toFixed(2));
      if (amountDollars <= 0) {
        return json({ error: { code: "invalid_amount", message: "Payment amount must be greater than zero." } }, { status: 400 });
      }

      const metadata = current.metadata && typeof current.metadata === "object"
        ? current.metadata as Record<string, unknown>
        : {};
      const { data, error } = await (supabase.from("payments") as any)
        .update({
          amount: amountDollars,
          status: "succeeded",
          provider: "other",
          paid_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            payment_method: body.payment_method,
            notes: body.notes ?? null,
            recorded_manually: true,
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .select()
        .single();
      if (error) throw error;

      return json({ data: { success: true, payment_id: data.id, amount: data.amount, status: data.status } });
    }

    return json({
      error: {
        code: "provider_not_configured",
        message: `${body.action} requires an external payment/email provider that is not configured in Final yet.`,
      },
    }, { status: 501 });
  } catch (error) {
    return errorResponse(error);
  }
}
