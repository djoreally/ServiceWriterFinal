import { errorResponse, json } from "@/server/api";
import { ApiInvoice, legacyInvoice } from "@/server/cutover/invoices";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const invoiceStatusInputSchema = z.enum(["draft", "issued", "sent", "partially_paid", "partial", "paid", "void", "past_due"]);
const lineSchema = z.object({ description: z.string().trim().min(1).max(1000), quantity: z.number().positive(), unit_price: z.number().nonnegative() }).passthrough();
const patchSchema = z.object({
  workspace_id: z.string().uuid(), customer_id: z.string().uuid().optional(), vehicle_id: z.string().uuid().nullable().optional(), work_order_id: z.string().uuid().nullable().optional(), status: invoiceStatusInputSchema.optional(), due_date: z.string().date().nullable().optional(), issue_date: z.string().date().nullable().optional(), notes: z.string().max(10000).nullable().optional(), contact_name: z.string().max(200).nullable().optional(), contact_email: z.string().email().max(320).nullable().optional(), contact_phone: z.string().max(40).nullable().optional(), payment_terms: z.string().max(120).nullable().optional(), terms_text: z.string().max(10000).nullable().optional(), discount_type: z.enum(["fixed", "percentage"]).optional(), discount_amount: z.number().nonnegative().optional(), tax_enabled: z.boolean().optional(), tax_rate: z.number().min(0).max(100).optional(), waste_oil_fee_enabled: z.boolean().optional(), waste_oil_fee: z.number().nonnegative().optional(), shop_fee_enabled: z.boolean().optional(), shop_fee: z.number().nonnegative().optional(), surcharge_enabled: z.boolean().optional(), surcharge: z.number().nonnegative().optional(), subtotal: z.number().nonnegative().optional(), tax_amount: z.number().nonnegative().optional(), total: z.number().nonnegative().optional(), line_items: z.array(lineSchema).max(500).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one invoice field is required" });

function dueAt(value?: string | null) { return value === undefined ? undefined : value ? new Date(`${value}T23:59:59.999Z`).toISOString() : null; }
const FINANCIAL_FIELDS = ["customer_id","vehicle_id","work_order_id","discount_type","discount_amount","tax_enabled","tax_rate","waste_oil_fee_enabled","waste_oil_fee","shop_fee_enabled","shop_fee","surcharge_enabled","surcharge","subtotal","tax_amount","total","line_items"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const invoice = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${workspaceId}/invoices/${id}`);
    return json({ data: await legacyInvoice(request, workspaceId, invoice) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const current = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}`);
    const financialChange = FINANCIAL_FIELDS.some((field) => body[field] !== undefined);
    if (financialChange) return json({ error: { code: "invoice_financial_version_required", message: "Financial scope and line changes require a replacement invoice version from the work order." } }, { status: 409 });
    if (["paid","partially_paid","partial","past_due"].includes(body.status ?? "")) return json({ error: { code: "payment_state_is_derived", message: "Paid, partial, and past-due state is derived from the payment ledger and due date; it cannot be written to invoice status." } }, { status: 409 });

    const key = ensureIdempotencyKey(request);
    if (body.status === "void") {
      const voided = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}/void`, { method: "POST", headers: { "idempotency-key": `${key}:void` }, body: JSON.stringify({ reason: body.notes || "Voided from ServiceWriterFinal" }) });
      const detail = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${voided.id}`);
      return json({ data: await legacyInvoice(request, body.workspace_id, detail) });
    }

    if (current.status === "draft") {
      const metadata = current.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
      if (body.payment_terms !== undefined) metadata.payment_terms = body.payment_terms;
      if (body.terms_text !== undefined) metadata.terms_text = body.terms_text;
      if (body.contact_name !== undefined) metadata.contact_name = body.contact_name;
      if (body.contact_email !== undefined) metadata.contact_email = body.contact_email;
      if (body.contact_phone !== undefined) metadata.contact_phone = body.contact_phone;
      const presentation: Record<string, unknown> = { metadata };
      if (body.notes !== undefined) presentation.customerMessage = body.notes;
      if (body.due_date !== undefined) presentation.dueAt = dueAt(body.due_date);
      if (body.notes !== undefined || body.due_date !== undefined || Object.keys(metadata).length !== Object.keys(current.metadata ?? {}).length) {
        await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}`, { method: "PATCH", headers: { "idempotency-key": `${key}:presentation` }, body: JSON.stringify(presentation) });
      }
    } else if (body.notes !== undefined || body.due_date !== undefined || body.payment_terms !== undefined || body.terms_text !== undefined || body.contact_name !== undefined || body.contact_email !== undefined || body.contact_phone !== undefined) {
      return json({ error: { code: "invoice_locked", message: "Issued invoice presentation is immutable. Void and create a replacement version if the document must change." } }, { status: 409 });
    }

    if (body.status === "issued" || body.status === "sent") {
      const latest = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}`);
      if (latest.status === "draft") await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}/issue`, { method: "POST", headers: { "idempotency-key": `${key}:issue` }, body: JSON.stringify({ dueAt: dueAt(body.due_date) }) });
    }
    const detail = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${id}`);
    return json({ data: await legacyInvoice(request, body.workspace_id, detail) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const current = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${workspaceId}/invoices/${id}`);
    if (current.status === "draft") return json({ error: { code: "draft_invoice_delete_unsupported", message: "Draft invoices are retained for audit/version history; create a replacement version instead of deleting them." } }, { status: 409 });
    const voided = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${workspaceId}/invoices/${id}/void`, { method: "POST", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify({ reason: "Voided from ServiceWriterFinal delete action" }) });
    const detail = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${workspaceId}/invoices/${voided.id}`);
    return json({ data: await legacyInvoice(request, workspaceId, detail) });
  } catch (error) { return errorResponse(error); }
}
