import { errorResponse, json, paginationSchema } from "@/server/api";
import { ApiInvoice, cents, legacyInvoice, quantityMilli } from "@/server/cutover/invoices";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const invoiceStatusSchema = z.enum(["draft", "issued", "partially_paid", "paid", "void", "past_due"]);
const lineSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(), service_catalog_id: z.string().uuid().nullable().optional(), description: z.string().trim().min(1).max(1000),
  quantity: z.number().positive(), unit_price: z.number().nonnegative(), tax_rate: z.number().min(0).max(100).optional(), display_order: z.number().int().min(0).optional(),
  vin: z.string().max(40).nullable().optional(), vehicle_year: z.number().int().min(1880).max(2200).nullable().optional(), vehicle_make: z.string().max(120).nullable().optional(), vehicle_model: z.string().max(120).nullable().optional(), vehicle_trim: z.string().max(120).nullable().optional(), vehicle_engine: z.string().max(120).nullable().optional(), oil_type: z.string().max(120).nullable().optional(), oil_capacity: z.string().max(40).nullable().optional(), oil_filter: z.string().max(120).nullable().optional(), vehicle_mileage: z.number().int().min(0).nullable().optional(), license_plate: z.string().max(40).nullable().optional(), odometer_measure: z.string().max(20).nullable().optional(),
});
const invoiceSchema = z.object({
  workspace_id: z.string().uuid(), invoice_number: z.union([z.number().int().positive(), z.string().trim().min(1).max(80)]).optional(), customer_id: z.string().uuid(), vehicle_id: z.string().uuid().nullable().optional(), work_order_id: z.string().uuid(), status: invoiceStatusSchema.default("draft"), issue_date: z.string().date().optional(), due_date: z.string().date().nullable().optional(), subtotal: z.number().nonnegative().default(0), tax_amount: z.number().nonnegative().default(0), total: z.number().nonnegative().default(0), notes: z.string().max(10000).nullable().optional(), payment_terms: z.string().max(120).nullable().optional(), terms_text: z.string().max(10000).nullable().optional(), bill_to_type: z.string().trim().max(40).optional(), contact_name: z.string().max(200).nullable().optional(), contact_email: z.string().email().max(320).nullable().optional(), contact_phone: z.string().max(40).nullable().optional(), discount_type: z.enum(["fixed", "percentage"]).optional(), discount_amount: z.number().nonnegative().optional(), tax_enabled: z.boolean().optional(), tax_rate: z.number().min(0).max(100).optional(), waste_oil_fee_enabled: z.boolean().optional(), waste_oil_fee: z.number().nonnegative().optional(), shop_fee_enabled: z.boolean().optional(), shop_fee: z.number().nonnegative().optional(), surcharge_enabled: z.boolean().optional(), surcharge: z.number().nonnegative().optional(), line_items: z.array(lineSchema).max(500).default([]),
});

function dueAt(value?: string | null) { return value ? new Date(`${value}T23:59:59.999Z`).toISOString() : null; }
function lineMetadata(item: z.infer<typeof lineSchema>) { return { vehicle_id: item.vehicle_id ?? null, service_catalog_id: item.service_catalog_id ?? null, vin: item.vin ?? null, vehicle_year: item.vehicle_year ?? null, vehicle_make: item.vehicle_make ?? null, vehicle_model: item.vehicle_model ?? null, vehicle_trim: item.vehicle_trim ?? null, vehicle_engine: item.vehicle_engine ?? null, oil_type: item.oil_type ?? null, oil_capacity: item.oil_capacity ?? null, oil_filter: item.oil_filter ?? null, vehicle_mileage: item.vehicle_mileage ?? null, license_plate: item.license_plate ?? null, odometer_measure: item.odometer_measure ?? null }; }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const workOrderId = url.searchParams.get("work_order_id"); if (workOrderId) params.set("workOrderId", workOrderId);
    const requestedStatus = url.searchParams.get("status"); if (requestedStatus && ["draft","issued","void","superseded"].includes(requestedStatus)) params.set("status", requestedStatus);
    const rows = await serviceWriterApi<ApiInvoice[]>(request, `/api/v1/workspaces/${workspaceId}/invoices?${params}`);
    const data = await Promise.all(rows.map(async (row) => {
      const detail = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${workspaceId}/invoices/${row.id}`);
      return legacyInvoice(request, workspaceId, detail);
    }));
    const filtered = requestedStatus && !["draft","issued","void","superseded"].includes(requestedStatus) ? data.filter((row) => row.status === requestedStatus) : data;
    return json({ data: filtered, pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = invoiceSchema.parse(await request.json());
    const manualLines = body.line_items.map((item, index) => ({ source: "manual" as const, description: item.description, quantityMilli: quantityMilli(item.quantity), unitPriceCents: cents(item.unit_price), taxable: (item.tax_rate ?? body.tax_rate ?? 0) > 0, sortOrder: item.display_order ?? index, metadata: lineMetadata(item) }));
    const fees = [
      body.waste_oil_fee_enabled && body.waste_oil_fee ? ["Waste oil fee", body.waste_oil_fee, 900001] as const : null,
      body.shop_fee_enabled && body.shop_fee ? ["Shop fee", body.shop_fee, 900002] as const : null,
      body.surcharge_enabled && body.surcharge ? ["Surcharge", body.surcharge, 900003] as const : null,
    ].filter(Boolean).map(([description, amount, sortOrder]) => ({ source: "manual" as const, description, quantityMilli: 1000, unitPriceCents: cents(amount), taxable: false, sortOrder, metadata: { legacyFee: true } }));
    const baseSubtotalCents = cents(body.subtotal || body.line_items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
    const discountCents = body.discount_type === "percentage" ? Math.round(baseSubtotalCents * ((body.discount_amount ?? 0) / 100)) : cents(body.discount_amount ?? 0);
    const metadata = { legacy_invoice_number: body.invoice_number ?? null, customer_id_requested: body.customer_id, vehicle_id_requested: body.vehicle_id ?? null, payment_terms: body.payment_terms ?? null, terms_text: body.terms_text ?? null, bill_to_type: body.bill_to_type ?? "customer", contact_name: body.contact_name ?? null, contact_email: body.contact_email ?? null, contact_phone: body.contact_phone ?? null, legacy_requested_status: body.status, legacy_supplied_total: body.total, legacy_supplied_tax_amount: body.tax_amount };
    const created = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices`, { method: "POST", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify({ workOrderId: body.work_order_id, includeWorkOrderLines: body.line_items.length === 0, includeParts: body.line_items.length === 0, includeLabor: body.line_items.length === 0, additionalLines: [...manualLines, ...fees], discountCents, taxRateBasisPoints: body.tax_enabled === false ? 0 : Math.round((body.tax_rate ?? 0) * 100), customerMessage: body.notes ?? null, internalNotes: null, dueAt: dueAt(body.due_date), metadata }) });
    let finalInvoice = created;
    if (body.status !== "draft") {
      finalInvoice = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${created.id}/issue`, { method: "POST", headers: { "idempotency-key": `${ensureIdempotencyKey(request)}:issue` }, body: JSON.stringify({ dueAt: dueAt(body.due_date) }) });
    }
    const detail = await serviceWriterApi<ApiInvoice>(request, `/api/v1/workspaces/${body.workspace_id}/invoices/${finalInvoice.id}`);
    return json({ data: await legacyInvoice(request, body.workspace_id, detail) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
