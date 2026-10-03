import { errorResponse, json, paginationSchema } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const paymentStatusSchema = z.enum(["pending", "succeeded", "failed", "refunded", "partially_refunded"]);
const providerSchema = z.enum(["stripe", "square", "quickbooks", "google_calendar", "resend", "sms", "carfax", "mapbox", "ai", "other"]);
const paymentSchema = z.object({
  workspace_id: z.string().uuid(), invoice_id: z.string().uuid(), customer_id: z.string().uuid().nullable().optional(), provider: providerSchema.nullable().optional(), provider_payment_id: z.string().trim().max(200).nullable().optional(), status: paymentStatusSchema.default("pending"), amount: z.number().finite().positive(), currency_code: z.string().trim().length(3).toUpperCase().default("USD"), paid_at: z.string().datetime().nullable().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
});

type ApiPayment = Record<string, unknown> & { id: string; invoiceId: string; provider: string; method: string; status: string; amountCents: number; refundedCents: number; currencyCode: string; providerPaymentIntentId?: string | null; succeededAt?: string | null; createdAt?: string; updatedAt?: string };

function legacyPayment(row: ApiPayment) {
  return {
    ...row,
    workspace_id: row.workspaceId,
    invoice_id: row.invoiceId,
    provider_payment_id: row.providerPaymentIntentId ?? null,
    amount: row.amountCents / 100,
    refunded_amount: row.refundedCents / 100,
    currency_code: row.currencyCode,
    paid_at: row.succeededAt ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const invoiceId = url.searchParams.get("invoice_id"); if (invoiceId) params.set("invoiceId", invoiceId);
    const status = url.searchParams.get("status"); if (status) params.set("status", status);
    const method = url.searchParams.get("method"); if (method) params.set("method", method);
    const rows = await serviceWriterApi<ApiPayment[]>(request, `/api/v1/workspaces/${workspaceId}/payments?${params}`);
    return json({ data: rows.map(legacyPayment), pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    if (["refunded", "partially_refunded"].includes(body.status)) return json({ error: { code: "refund_endpoint_required", message: "Refund state must be created through the canonical refund workflow." } }, { status: 409 });
    if (["square","quickbooks","google_calendar","resend","sms","carfax","mapbox","ai","other"].includes(body.provider ?? "")) return json({ error: { code: "unsupported_payment_provider", message: "Stage 22 cutover supports the canonical Stripe and manual payment providers only." } }, { status: 409 });
    const amountCents = Math.round(body.amount * 100);
    const key = ensureIdempotencyKey(request);
    if (body.provider === "stripe") {
      if (body.status !== "pending") return json({ error: { code: "stripe_status_provider_owned", message: "Stripe success/failure state must come from verified Stripe reconciliation, not a frontend write." } }, { status: 409 });
      const result = await serviceWriterApi<{ payment: ApiPayment; clientSecret?: string | null }>(request, `/api/v1/workspaces/${body.workspace_id}/payments/stripe-intent`, {
        method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ invoiceId: body.invoice_id, amountCents, method: "card_online", metadata: Object.fromEntries(Object.entries(body.metadata ?? {}).map(([k,v]) => [k, String(v)])) }),
      });
      return json({ data: legacyPayment(result.payment), client_secret: result.clientSecret ?? null }, { status: 201 });
    }
    if (body.status !== "succeeded") return json({ error: { code: "manual_payment_must_settle", message: "Manual/cash payments are recorded only when money is actually received." } }, { status: 409 });
    const payment = await serviceWriterApi<ApiPayment>(request, `/api/v1/workspaces/${body.workspace_id}/payments`, {
      method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ invoiceId: body.invoice_id, amountCents, method: "manual", receiptReference: body.provider_payment_id ?? null, note: null, metadata: body.metadata ?? {} }),
    });
    return json({ data: legacyPayment(payment) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
