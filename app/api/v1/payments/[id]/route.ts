import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchPaymentLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
import { z } from "zod";

const paymentStatusSchema = z.enum(["pending", "succeeded", "failed", "refunded", "partially_refunded"]);
const providerSchema = z.enum(["stripe", "square", "quickbooks", "google_calendar", "resend", "sms", "carfax", "mapbox", "ai", "other"]);

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: providerSchema.nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: paymentStatusSchema.optional(),
  amount: z.number().nonnegative().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one payment field is required",
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase
      .from("payments")
      .select("*, invoices(id,invoice_number,total,amount_paid,status), customers(id,first_name,last_name,email)")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id, ...patch } = body;
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

    if (body.invoice_id) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id,customer_id,status")
        .eq("workspace_id", workspace_id)
        .eq("id", body.invoice_id)
        .single();
      if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
      if (invoice.status === "void") {
        return json({ error: { code: "invoice_void", message: "Payments cannot be linked to a void invoice." } }, { status: 409 });
      }
      if (body.customer_id && body.customer_id !== invoice.customer_id) {
        return json({ error: { code: "customer_mismatch", message: "Payment customer does not match the invoice customer." } }, { status: 409 });
      }
    }

    if (body.status === "succeeded" && body.paid_at === undefined) {
      patch.paid_at = new Date().toISOString();
    }

    const { data, error } = await (supabase.from("payments") as any)
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();
    if (error) throw error;

    if (data?.customer_id && ["succeeded", "failed", "refunded", "partially_refunded"].includes(data.status)) {
      const { data: customer } = await supabase
        .from("customers")
        .select("first_name,last_name,email")
        .eq("workspace_id", workspace_id)
        .eq("id", data.customer_id)
        .maybeSingle();
      if (customer?.email) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name,timezone")
          .eq("id", workspace_id)
          .single();
        const eventKey = data.status === "succeeded"
          ? LIFECYCLE_EVENT_KEYS.paymentReceipt
          : data.status === "failed"
            ? LIFECYCLE_EVENT_KEYS.paymentFailed
            : LIFECYCLE_EVENT_KEYS.refundIssued;
        void dispatchPaymentLifecycle({
          eventKey,
          eventId: `${data.id}:${data.status}:${data.paid_at || "state"}`,
          payment: {
            ...data,
            customer_email: customer.email,
            customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
          },
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL(String((data.metadata as Record<string, unknown> | null)?.payment_url || `/payments/${data.id}`), request.url).toString(),
        }).catch((dispatchError) => console.error("[Lifecycle] payment status email failed", dispatchError));
      }
    }

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager"], request);
    return json({
      error: {
        code: "ledger_record_immutable",
        message: `Payment ${id} cannot be deleted. Use the refund or status workflow so the financial audit trail is preserved.`,
      },
    }, { status: 409 });
  } catch (error) {
    return errorResponse(error);
  }
}
