import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { dispatchInvoiceTransition } from "@/server/messaging/invoice-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { z } from "zod";

const invoiceStatusSchema = z.enum(["draft", "issued", "partially_paid", "paid", "void", "past_due"]);
const lineSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(1000),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(100).optional(),
  display_order: z.number().int().min(0).optional(),
  vin: z.string().max(40).nullable().optional(),
  vehicle_year: z.number().int().min(1880).max(2200).nullable().optional(),
  vehicle_make: z.string().max(120).nullable().optional(),
  vehicle_model: z.string().max(120).nullable().optional(),
  vehicle_trim: z.string().max(120).nullable().optional(),
  vehicle_engine: z.string().max(120).nullable().optional(),
  oil_type: z.string().max(120).nullable().optional(),
  oil_capacity: z.string().max(40).nullable().optional(),
  oil_filter: z.string().max(120).nullable().optional(),
  vehicle_mileage: z.number().int().min(0).nullable().optional(),
  license_plate: z.string().max(40).nullable().optional(),
  odometer_measure: z.string().max(20).nullable().optional(),
});

const invoiceSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_number: z.union([z.number().int().positive(), z.string().trim().min(1).max(80)]).optional(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  status: invoiceStatusSchema.default("draft"),
  issue_date: z.string().date().optional(),
  due_date: z.string().date().nullable().optional(),
  subtotal: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  notes: z.string().max(10000).nullable().optional(),
  payment_terms: z.string().max(120).nullable().optional(),
  terms_text: z.string().max(10000).nullable().optional(),
  bill_to_type: z.string().trim().max(40).optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  discount_type: z.enum(["fixed", "percentage"]).optional(),
  discount_amount: z.number().nonnegative().optional(),
  tax_enabled: z.boolean().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  waste_oil_fee_enabled: z.boolean().optional(),
  waste_oil_fee: z.number().nonnegative().optional(),
  shop_fee_enabled: z.boolean().optional(),
  shop_fee: z.number().nonnegative().optional(),
  surcharge_enabled: z.boolean().optional(),
  surcharge: z.number().nonnegative().optional(),
  line_items: z.array(lineSchema).max(500).default([]),
});

function isoDate(value?: string | null): string | null {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function canonicalInvoiceNumber(value: number | string | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function lineRows(items: z.infer<typeof lineSchema>[], fallbackVehicleId: string | null) {
  return items.map((item, index) => ({
    vehicle_id: item.vehicle_id ?? fallbackVehicleId,
    service_catalog_id: item.service_catalog_id ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate ?? 0,
    sort_order: item.display_order ?? index,
    metadata: {
      vin: item.vin ?? null,
      vehicle_year: item.vehicle_year ?? null,
      vehicle_make: item.vehicle_make ?? null,
      vehicle_model: item.vehicle_model ?? null,
      vehicle_trim: item.vehicle_trim ?? null,
      vehicle_engine: item.vehicle_engine ?? null,
      oil_type: item.oil_type ?? null,
      oil_capacity: item.oil_capacity ?? null,
      oil_filter: item.oil_filter ?? null,
      vehicle_mileage: item.vehicle_mileage ?? null,
      license_plate: item.license_plate ?? null,
      odometer_measure: item.odometer_measure ?? null,
    },
  }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customers(id,first_name,last_name,email,phone), vehicles(id,year,make,model,vin,license_plate)")
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
    const body = invoiceSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);

    const metadata = {
      notes: body.notes ?? null,
      payment_terms: body.payment_terms ?? null,
      terms_text: body.terms_text ?? null,
      bill_to_type: body.bill_to_type ?? "customer",
      legacy_invoice_label: typeof body.invoice_number === "string" && !/^\d+$/.test(body.invoice_number) ? body.invoice_number : null,
      contact_name: body.contact_name ?? null,
      contact_email: body.contact_email ?? null,
      contact_phone: body.contact_phone ?? null,
      discount_type: body.discount_type ?? "fixed",
      discount_amount: body.discount_amount ?? 0,
      tax_enabled: body.tax_enabled ?? body.tax_amount > 0,
      tax_rate: body.tax_rate ?? 0,
      waste_oil_fee_enabled: body.waste_oil_fee_enabled ?? false,
      waste_oil_fee: body.waste_oil_fee ?? 0,
      shop_fee_enabled: body.shop_fee_enabled ?? false,
      shop_fee: body.shop_fee ?? 0,
      surcharge_enabled: body.surcharge_enabled ?? false,
      surcharge: body.surcharge ?? 0,
    };

    const header = {
      customer_id: body.customer_id,
      vehicle_id: body.vehicle_id ?? null,
      work_order_id: body.work_order_id ?? null,
      status: body.status,
      invoice_number: canonicalInvoiceNumber(body.invoice_number),
      subtotal: body.subtotal,
      tax_total: body.tax_amount,
      total: body.total,
      issued_at: body.issue_date ? isoDate(body.issue_date) : body.status === "issued" ? new Date().toISOString() : null,
      due_at: isoDate(body.due_date),
      metadata,
    };

    const { data: createdId, error } = await (supabase as any).rpc("create_invoice_v1", {
      p_workspace_id: body.workspace_id,
      p_header: header,
      p_lines: lineRows(body.line_items, body.vehicle_id ?? null),
    });
    if (error) throw error;

    const id = typeof createdId === "string" ? createdId : Array.isArray(createdId) ? createdId[0] : createdId;
    if (!id) throw new Error("Invoice creation returned no identifier.");

    const { data: invoice, error: readError } = await supabase
      .from("invoices")
      .select("*, customers(id,first_name,last_name,email)")
      .eq("workspace_id", body.workspace_id)
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    if (customer?.email && invoice.status !== "draft") {
      try {
        const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single();
        const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
        await dispatchInvoiceTransition({
          forceKey: LIFECYCLE_EVENT_KEYS.invoiceCreated,
          eventId: `${id}:created:${invoice.created_at ?? new Date().toISOString()}`,
          invoice: { ...invoice, customer_email: customer.email, customer_name: customerName },
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL(`/invoices/${id}`, request.url).toString(),
        });
      } catch (dispatchError) {
        console.error("[Lifecycle] invoice-created email enqueue failed", dispatchError);
      }
    }
    return json({ data: invoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
