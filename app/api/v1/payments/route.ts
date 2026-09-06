import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { dispatchPaymentLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
import { z } from "zod";

const paymentStatusSchema = z.enum(["pending", "succeeded", "failed", "refunded", "partially_refunded"]);
const providerSchema = z.enum(["stripe", "square", "quickbooks", "google_calendar", "resend", "sms", "carfax", "mapbox", "ai", "other"]);

const paymentSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: providerSchema.nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: paymentStatusSchema.default("pending"),
  amount: z.number().finite().positive(),
  currency_code: z.string().trim().length(3).toUpperCase().default("USD"),
  paid_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("payments")
      .select("*, invoices(id,invoice_number,total,amount_paid,status), customers(id,first_name,last_name,email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);
    const metadata = body.metadata ?? {};
    const appointmentId = metadataString(metadata, "appointment_id");
    const paymentType = metadataString(metadata, "payment_type");

    // Financial writes must have traceable business provenance. This deliberately
    // rejects the retired offline-queue shape that created orphan pending rows.
    if (!body.invoice_id && !body.customer_id && !body.provider_payment_id && !appointmentId) {
      return json({
        error: {
          code: "payment_provenance_required",
          message: "Payment must reference an invoice, customer, provider payment, or appointment.",
        },
      }, { status: 422 });
    }

    if (body.invoice_id) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id,customer_id,status")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.invoice_id)
        .single();
      if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
      if (invoice.status === "void") {
        return json({ error: { code: "invoice_void", message: "Payments cannot be posted to a void invoice." } }, { status: 409 });
      }
      if (body.customer_id && body.customer_id !== invoice.customer_id) {
        return json({ error: { code: "customer_mismatch", message: "Payment customer does not match the invoice customer." } }, { status: 409 });
      }
    }

    // Appointment closeout owns the receivable. Older callers may still ask to
    // "create" the same pending payment; return the canonical existing row so
    // retries and mixed client versions remain idempotent.
    if (body.status === "pending" && appointmentId && !body.provider_payment_id) {
      let duplicateQuery = (supabase.from("payments") as any)
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("status", "pending")
        .eq("metadata->>appointment_id", appointmentId)
        .limit(1);
      if (paymentType) duplicateQuery = duplicateQuery.eq("metadata->>payment_type", paymentType);
      const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate?.id) {
        return json({ data: duplicate, reused: true });
      }
    }

    const paidAt = body.status === "succeeded" && !body.paid_at ? new Date().toISOString() : body.paid_at ?? null;
    const { data, error } = await (supabase.from("payments") as any)
      .insert({
        workspace_id: body.workspace_id,
        invoice_id: body.invoice_id ?? null,
        customer_id: body.customer_id ?? null,
        provider: body.provider ?? null,
        provider_payment_id: body.provider_payment_id ?? null,
        status: body.status,
        amount: body.amount,
        currency_code: body.currency_code,
        paid_at: paidAt,
        created_by: user.id,
        metadata,
      })
      .select()
      .single();
    if (error) throw error;

    if (data?.customer_id && (data.status === "succeeded" || data.status === "failed")) {
      const { data: customer } = await supabase
        .from("customers")
        .select("first_name,last_name,email")
        .eq("workspace_id", body.workspace_id)
        .eq("id", data.customer_id)
        .maybeSingle();
      if (customer?.email) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name,timezone")
          .eq("id", body.workspace_id)
          .single();
        const eventKey = data.status === "succeeded"
          ? LIFECYCLE_EVENT_KEYS.paymentReceipt
          : LIFECYCLE_EVENT_KEYS.paymentFailed;
        void dispatchPaymentLifecycle({
          eventKey,
          eventId: data.id,
          payment: {
            ...data,
            customer_email: customer.email,
            customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
          },
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL(String((data.metadata as Record<string, unknown> | null)?.payment_url || `/payments/${data.id}`), request.url).toString(),
        }).catch((dispatchError) => console.error("[Lifecycle] payment creation email failed", dispatchError));
      }
    }

    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
