/**
 * DOCUMENTS domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/invoices/route.ts (GET, POST)
 * - app/api/v1/invoices/[id]/route.ts (GET, PATCH, DELETE)
 * - app/api/v1/invoices/[id]/send/route.ts (POST)
 * - app/api/v1/quotes/[id]/convert/route.ts (POST)
 * - app/api/v1/quotes/[id]/status/route.ts (POST)
 *
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, json, paginationSchema } from "@/server/api";
import type { Database } from "@/integrations/supabase/types.production";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { dispatchInvoiceTransition } from "@/server/messaging/invoice-events";
import { LIFECYCLE_EVENT_KEYS as INVOICE_LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { sendLifecycleEmail } from "@/server/messaging/lifecycle-sender";
import { dispatchQuoteLifecycle, LIFECYCLE_EVENT_KEYS as QUOTE_LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";

export const documentsRouter = new Hono();

// ---------------------------------------------------------------------------
// Invoices collection
// ---------------------------------------------------------------------------

const invoiceStatusSchema = z.enum(["draft", "issued", "partially_paid", "paid", "void", "past_due"]);
const invoiceLineSchema = z.object({
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
  line_items: z.array(invoiceLineSchema).max(500).default([]),
});

function isoDateTime(value?: string | null): string | null {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function canonicalInvoiceNumber(value: number | string | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function invoiceLineRows(items: z.infer<typeof invoiceLineSchema>[], fallbackVehicleId: string | null) {
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

documentsRouter.get("/v1/invoices", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase
    .from("invoices")
    .select("*, customers(id,first_name,last_name,email,phone), vehicles(id,year,make,model,vin,license_plate)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

documentsRouter.post("/v1/invoices", async (c) => {
  const body = invoiceSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

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
    issued_at: body.issue_date ? isoDateTime(body.issue_date) : body.status === "issued" ? new Date().toISOString() : null,
    due_at: isoDateTime(body.due_date),
    metadata,
  };

  const { data: createdId, error } = await (supabase as any).rpc("create_invoice_v1", {
    p_workspace_id: body.workspace_id,
    p_header: header,
    p_lines: invoiceLineRows(body.line_items, body.vehicle_id ?? null),
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
        forceKey: INVOICE_LIFECYCLE_EVENT_KEYS.invoiceCreated,
        eventId: `${id}:created:${invoice.created_at ?? new Date().toISOString()}`,
        invoice: { ...invoice, customer_email: customer.email, customer_name: customerName },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: new URL(`/invoices/${id}`, c.req.url).toString(),
      });
    } catch (dispatchError) {
      console.error("[Lifecycle] invoice-created email enqueue failed", dispatchError);
    }
  }
  return json({ data: invoice }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Invoice helpers: display numbering, fleet work-order sourcing,
// consolidated fleet billing
// ---------------------------------------------------------------------------

const workspaceIdQuerySchema = z.object({ workspace_id: z.string().uuid() });

/** Display-only legacy label. The database assigns the canonical bigint. */
documentsRouter.get("/v1/invoices/next-number", async (c) => {
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, undefined);
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace_id);
  if (error) throw error;
  const seq = (count ?? 0) + 1;
  const year = new Date().getFullYear();
  return json({ data: { number: `INV-${year}-${String(seq).padStart(5, "0")}` } });
});

type FleetPreviewOrder = {
  id: string;
  order_number: string | null;
  status: string;
  fleet_client_id: string | null;
  invoice_id: string | null;
};

type FleetPreviewLine = {
  fleet_work_order_id: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

/** Client-side pre-flight for bulk fleet invoicing (read-only). */
documentsRouter.get("/v1/invoices/fleet-consolidated-preview", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const ids = [...new Set(url.searchParams.getAll("work_order_ids").filter(Boolean))];
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);

  if (ids.length === 0) {
    return json({
      data: { clientId: "", workOrderCount: 0, lineCount: 0, subtotal: 0, rows: [], errors: ["Select at least one work order"] },
    });
  }

  const { data: orders, error: ordersErr } = await (supabase as any)
    .from("fleet_work_orders")
    .select("id, order_number, status, fleet_client_id, invoice_id")
    .in("id", ids);
  if (ordersErr) throw ordersErr;

  const errors: string[] = [];
  if (!orders || (orders as FleetPreviewOrder[]).length !== ids.length) {
    errors.push("Some selected work orders are not accessible");
  }

  const { data: lines, error: linesErr } = await (supabase as any)
    .from("fleet_work_order_line_items")
    .select("fleet_work_order_id, quantity, unit_price, total")
    .in("fleet_work_order_id", ids);
  if (linesErr) throw linesErr;

  const linesByWo = new Map<string, { count: number; subtotal: number }>();
  for (const li of ((lines ?? []) as FleetPreviewLine[])) {
    const quantity = Number(li.quantity) || 0;
    const unitPrice = Number(li.unit_price) || 0;
    const total = Number(li.total ?? quantity * unitPrice) || 0;
    const bucket = linesByWo.get(li.fleet_work_order_id) ?? { count: 0, subtotal: 0 };
    bucket.count += 1;
    bucket.subtotal += total;
    linesByWo.set(li.fleet_work_order_id, bucket);
  }

  const rows = ((orders ?? []) as FleetPreviewOrder[]).map((order) => {
    const bucket = linesByWo.get(order.id) ?? { count: 0, subtotal: 0 };
    return {
      work_order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      fleet_client_id: order.fleet_client_id,
      invoice_id: order.invoice_id ?? null,
      line_count: bucket.count,
      order_total: bucket.subtotal,
    };
  });

  const clients = new Set(rows.map((row) => row.fleet_client_id));
  if (clients.size > 1) errors.push("All selected work orders must belong to the same fleet customer");
  if (rows.some((row) => row.status !== "completed")) errors.push("Every work order must be completed before invoicing");
  if (rows.some((row) => row.invoice_id)) errors.push("One or more work orders is already invoiced");
  const zeroLine = rows.filter((row) => row.line_count === 0);
  if (zeroLine.length > 0) {
    errors.push(`${zeroLine.length} work order(s) have no invoiceable lines`);
  }

  return json({
    data: {
      clientId: rows[0]?.fleet_client_id ?? "",
      workOrderCount: rows.length,
      lineCount: rows.reduce((sum, row) => sum + row.line_count, 0),
      subtotal: rows.reduce((sum, row) => sum + row.order_total, 0),
      rows,
      errors,
    },
  });
});

/**
 * Build the manual-invoice payload for a completed fleet work order
 * (pre-populated fleet_client, bill_to_type=fleet, lines copied from the WO).
 */
documentsRouter.get("/v1/invoices/from-fleet-work-order/:workOrderId", async (c) => {
  const workOrderId = z.string().uuid().parse(c.req.param("workOrderId"));
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase, user } = await requireWorkspaceAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: wo, error: woErr } = await (supabase as any)
    .from("fleet_work_orders")
    .select("id, order_number, po_number, fleet_client_id, fleet_vehicle_id, fleet_vehicles(year, make, model, vin, license_plate, mileage), fleet_clients(company_name)")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .single();
  if (woErr || !wo) throw woErr ?? new ApiError(404, "Work order not found.", "not_found");
  if (!wo.fleet_client_id) throw new ApiError(422, "Work order has no fleet client attached.", "missing_fleet_client");

  const { data: lines, error: lineErr } = await (supabase as any)
    .from("fleet_work_order_line_items")
    .select("description, quantity, unit_price, service_catalog_id, sort_order")
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id)
    .order("sort_order");
  if (lineErr) throw lineErr;
  if (!lines || (lines as unknown[]).length === 0) throw new ApiError(422, "Work order has no line items to invoice.", "no_line_items");

  let invoice_number: string;
  if (wo.order_number) {
    invoice_number = `INV-${wo.order_number}`;
  } else {
    const { count, error: countErr } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id);
    if (countErr) throw countErr;
    const seq = (count ?? 0) + 1;
    invoice_number = `INV-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;
  }

  const vehicle = (wo.fleet_vehicles ?? null) as {
    year: number | null; make: string | null; model: string | null; vin: string | null;
    license_plate: string | null; mileage: number | null;
  } | null;

  const line_items = (lines as Array<{ description: string; quantity: number | null; unit_price: number | null; service_catalog_id: string | null }>).map((li, idx) => ({
    vehicle_id: null,
    service_catalog_id: li.service_catalog_id ?? null,
    description: li.description,
    quantity: Number(li.quantity) || 0,
    unit_price: Number(li.unit_price) || 0,
    display_order: idx,
    vin: vehicle?.vin ?? null,
    vehicle_year: vehicle?.year ?? null,
    vehicle_make: vehicle?.make ?? null,
    vehicle_model: vehicle?.model ?? null,
    vehicle_trim: null,
    vehicle_engine: null,
    oil_type: null,
    oil_capacity: null,
    oil_filter: null,
    vehicle_mileage: vehicle?.mileage ?? null,
    license_plate: vehicle?.license_plate ?? null,
    odometer_measure: null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);

  return json({
    data: {
      invoice_number,
      bill_to_type: "fleet",
      customer_id: null,
      fleet_client_id: wo.fleet_client_id,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      issue_date: today,
      due_date: due.toISOString().slice(0, 10),
      payment_terms: "Net 30",
      notes: wo.po_number ? `PO #${wo.po_number}` : null,
      terms_text: null,
      discount_type: "fixed",
      discount_amount: 0,
      tax_enabled: false,
      tax_rate: 0,
      waste_oil_fee_enabled: false,
      waste_oil_fee: 0,
      shop_fee_enabled: false,
      shop_fee: 0,
      surcharge_enabled: false,
      surcharge: 0,
      line_items,
    },
  });
});

const fleetConsolidatedBodySchema = z.object({
  workspace_id: z.string().uuid(),
  work_order_ids: z.array(z.string().uuid()).min(1).max(500),
  tax_enabled: z.boolean().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  processing_fee_enabled: z.boolean().optional(),
  processing_fee_type: z.enum(["percentage", "fixed"]).optional(),
  processing_fee_value: z.number().nonnegative().optional(),
});

/**
 * Consolidate completed work orders for one fleet customer into a single
 * invoice via the atomic `create_fleet_consolidated_invoice_v3` RPC.
 */
documentsRouter.post("/v1/invoices/fleet-consolidated", async (c) => {
  const body = fleetConsolidatedBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor"]);

  const ids = [...new Set(body.work_order_ids)];
  const { data: invoiceOrders, error: preflightError } = await (supabase as any)
    .from("fleet_work_orders")
    .select("id,fleet_contract_id,fleet_purchase_order_id,po_number")
    .in("id", ids);
  if (preflightError || !invoiceOrders || (invoiceOrders as unknown[]).length !== ids.length) {
    throw new ApiError(400, "Unable to validate work orders for invoicing.", "validation_failed");
  }
  type InvoicePreflightOrder = { fleet_contract_id: string | null; fleet_purchase_order_id: string | null; po_number: string | null };
  if ((invoiceOrders as InvoicePreflightOrder[]).some((order) => !order.fleet_contract_id)) {
    throw new ApiError(400, "Every work order needs an active contract for automated invoicing.", "missing_contract");
  }
  if ((invoiceOrders as InvoicePreflightOrder[]).some((order) => !order.fleet_purchase_order_id || !order.po_number?.trim())) {
    throw new ApiError(400, "Every work order needs an open purchase order for automated invoicing.", "missing_purchase_order");
  }

  const { data, error } = await (supabase as any).rpc("create_fleet_consolidated_invoice_v3", {
    _work_order_ids: ids,
    _invoice_number: null,
    _notes: null,
    _tax_enabled: body.tax_enabled ?? false,
    _tax_rate: body.tax_rate ?? 0,
    _processing_fee_enabled: body.processing_fee_enabled ?? false,
    _processing_fee_type: body.processing_fee_type ?? "percentage",
    _processing_fee_value: body.processing_fee_value ?? 0,
  });
  if (error) {
    console.error("[fleet-consolidated] rpc failed", error);
    const message = error.message || error.details || error.hint || "Failed to create invoice";
    throw new ApiError(502, message, "fleet_invoice_failed");
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    invoice_id?: string; invoice_number?: string; work_order_count?: number;
    line_item_count?: number; subtotal?: number; total?: number;
  } | null;
  if (!row?.invoice_id) throw new ApiError(502, "Invoice creation returned no id", "fleet_invoice_failed");

  return json({
    data: {
      invoice_id: row.invoice_id,
      invoice_number: row.invoice_number,
      work_order_count: Number(row.work_order_count) || ids.length,
      line_item_count: Number(row.line_item_count) || 0,
      subtotal: Number(row.subtotal) || 0,
      total: Number(row.total) || 0,
    },
  });
});

/** Fee/catalog defaults for the manual invoice form. */
documentsRouter.get("/v1/invoices/form-options", async (c) => {
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, undefined);
  const [{ data: catalog, error: catalogError }, { data: settings, error: settingsError }] = await Promise.all([
    (supabase as any)
      .from("service_catalog")
      .select("id,name,description,labor_price")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("workspace_settings")
      .select("waste_oil_fee,waste_oil_fee_enabled,shop_fee_value,shop_fee_type,shop_fee_enabled,surcharge_value,surcharge_type,surcharge_enabled,tax_rate")
      .eq("workspace_id", workspace_id)
      .maybeSingle(),
  ]);
  if (catalogError) throw catalogError;
  if (settingsError) throw settingsError;
  return json({
    data: {
      catalog: (catalog ?? []).map((row: { id: string; name: string; description: string | null; labor_price: number | null }) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        default_price: Number(row.labor_price ?? 0),
      })),
      fees: settings ? {
        waste_oil_fee: Number(settings.waste_oil_fee ?? 0),
        waste_oil_fee_enabled: Boolean(settings.waste_oil_fee_enabled),
        shop_fee_value: Number(settings.shop_fee_value ?? 0),
        shop_fee_type: settings.shop_fee_type ?? null,
        shop_fee_enabled: Boolean(settings.shop_fee_enabled),
        surcharge_value: Number(settings.surcharge_value ?? 0),
        surcharge_type: settings.surcharge_type ?? null,
        surcharge_enabled: Boolean(settings.surcharge_enabled),
        tax_rate: Number(settings.tax_rate ?? 0),
      } : null,
    },
  });
});

// ---------------------------------------------------------------------------
// Invoices [id]
// ---------------------------------------------------------------------------

type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];
type InvoiceTransitionRow = {
  id: string;
  status: string | null;
  updated_at?: string | null;
  customers?: InvoiceTransitionCustomer | InvoiceTransitionCustomer[] | null;
};
type InvoiceTransitionCustomer = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

const invoiceStatusInputSchema = z.enum(["draft", "issued", "sent", "partially_paid", "partial", "paid", "void", "past_due"]);
const invoiceUpdateLineSchema = z.object({
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

const patchInvoiceSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  status: invoiceStatusInputSchema.optional(),
  due_date: z.string().date().nullable().optional(),
  issue_date: z.string().date().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  payment_terms: z.string().max(120).nullable().optional(),
  terms_text: z.string().max(10000).nullable().optional(),
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
  subtotal: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  line_items: z.array(invoiceUpdateLineSchema).max(500).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one invoice field is required",
});

function isoOptionalDateTime(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function canonicalStatus(value?: z.infer<typeof invoiceStatusInputSchema>) {
  if (value === "sent") return "issued";
  if (value === "partial") return "partially_paid";
  return value;
}

function mergeMetadata(current: unknown, patch: Record<string, unknown>) {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...base, ...patch };
}

function updateLineRows(items: z.infer<typeof invoiceUpdateLineSchema>[]) {
  return items.map((item, index) => ({
    vehicle_id: item.vehicle_id ?? null,
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

async function notifyInvoiceTransition(
  supabase: SupabaseClient<Database>,
  request: Request,
  invoice: InvoiceTransitionRow,
  previousStatus: string | null,
  workspaceId: string,
) {
  const customer = Array.isArray(invoice?.customers) ? invoice.customers[0] : invoice?.customers;
  if (!customer?.email || invoice?.status === previousStatus) return;
  try {
    const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", workspaceId).single();
    const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";
    await dispatchInvoiceTransition({
      invoice: {
        ...invoice,
        workspace_id: workspaceId,
        customer_email: customer.email,
        customer_name: customerName,
      },
      previousStatus,
      eventId: `${invoice.id}:${invoice.status}:${invoice.updated_at ?? new Date().toISOString()}`,
      workspaceName: workspace?.name ?? "Service Writer",
      workspaceTimezone: workspace?.timezone ?? "UTC",
      actionUrl: new URL(`/invoices/${invoice.id}`, request.url).toString(),
    });
  } catch (dispatchError) {
    console.error("[Lifecycle] invoice transition email enqueue failed", dispatchError);
  }
}

documentsRouter.get("/v1/invoices/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);
  const { data, error } = await supabase
    .from("invoices")
    .select("*, invoice_lines(*), customers(id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,metadata), vehicles(id,year,make,model,vin,license_plate)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return json({ data });
});

documentsRouter.patch("/v1/invoices/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = patchInvoiceSchema.parse(await c.req.json());
  const normalizedStatus = canonicalStatus(body.status);
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: current, error: currentError } = await supabase
    .from("invoices")
    .select("id,status,metadata")
    .eq("id", id)
    .eq("workspace_id", body.workspace_id)
    .single();
  if (currentError || !current) throw currentError ?? new Error("Invoice not found");

  if (body.line_items !== undefined && current.status !== "draft") {
    return json({ error: { code: "invoice_locked", message: "Line items can only be replaced while an invoice is draft." } }, { status: 409 });
  }

  const metadataPatch: Record<string, unknown> = {};
  for (const key of [
    "notes", "contact_name", "contact_email", "contact_phone", "payment_terms", "terms_text",
    "discount_type", "discount_amount", "tax_enabled", "tax_rate", "waste_oil_fee_enabled",
    "waste_oil_fee", "shop_fee_enabled", "shop_fee", "surcharge_enabled", "surcharge",
  ] as const) {
    if (body[key] !== undefined) metadataPatch[key] = body[key];
  }

  const patch: Record<string, unknown> = {};
  if (body.customer_id !== undefined) patch.customer_id = body.customer_id;
  if (body.vehicle_id !== undefined) patch.vehicle_id = body.vehicle_id;
  if (body.work_order_id !== undefined) patch.work_order_id = body.work_order_id;
  if (normalizedStatus !== undefined) patch.status = normalizedStatus;
  if (body.subtotal !== undefined) patch.subtotal = body.subtotal;
  if (body.tax_amount !== undefined) patch.tax_total = body.tax_amount;
  if (body.total !== undefined) patch.total = body.total;
  if (body.due_date !== undefined) patch.due_at = isoOptionalDateTime(body.due_date);
  if (body.issue_date !== undefined) patch.issued_at = isoOptionalDateTime(body.issue_date);
  if (normalizedStatus === "issued" && body.issue_date === undefined && current.status === "draft") patch.issued_at = new Date().toISOString();
  if (Object.keys(metadataPatch).length) patch.metadata = mergeMetadata(current.metadata, metadataPatch);

  if (body.line_items !== undefined) {
    const { error: atomicError } = await supabase.rpc("patch_draft_invoice_v1", {
      p_workspace_id: body.workspace_id,
      p_invoice_id: id,
      p_patch: patch,
      p_lines: updateLineRows(body.line_items),
    });
    if (atomicError) throw atomicError;

    const { data, error } = await supabase.from("invoices").select("*, customers(id,first_name,last_name,email)").eq("workspace_id", body.workspace_id).eq("id", id).single();
    if (error) throw error;
    await notifyInvoiceTransition(supabase, c.req.raw, data, current.status, body.workspace_id);
    return json({ data });
  }

  const { data, error } = await supabase.from("invoices")
    .update(patch as InvoiceUpdate)
    .eq("id", id)
    .eq("workspace_id", body.workspace_id)
    .select("*, customers(id,first_name,last_name,email)")
    .single();
  if (error) throw error;
  await notifyInvoiceTransition(supabase, c.req.raw, data, current.status, body.workspace_id);
  return json({ data });
});

documentsRouter.delete("/v1/invoices/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin", "manager"]);
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Invoices [id]/send
// ---------------------------------------------------------------------------

const sendInvoiceBodySchema = z.object({ workspace_id: z.string().uuid(), recipient_email: z.string().email().optional(), subject: z.string().trim().max(200).optional(), message: z.string().trim().max(10000).optional() });
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function trimmedText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function escapeHtml(value: unknown): string { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function formatMoney(value: unknown, currency = "USD"): string { const amount = Number(value ?? 0); return Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency }) : String(value ?? ""); }
function lineAmount(quantity: unknown, unitPrice: unknown): number { const qty = Number(quantity ?? 0); const rate = Number(unitPrice ?? 0); return Number.isFinite(qty) && Number.isFinite(rate) ? Number((qty * rate).toFixed(2)) : 0; }

documentsRouter.post("/v1/invoices/:id/send", async (c) => {
  const invoiceId = z.string().uuid().parse(c.req.param("id")); const body = sendInvoiceBodySchema.parse(await c.req.json()); const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
  const [{ data: invoice, error: invoiceError }, { data: workspace, error: workspaceError }] = await Promise.all([supabase.from("invoices").select("id,workspace_id,invoice_number,status,subtotal,tax_total,total,amount_paid,due_at,metadata,invoice_lines(description,quantity,unit_price,sort_order),customers(id,first_name,last_name,email)").eq("workspace_id", body.workspace_id).eq("id", invoiceId).single(), supabase.from("workspaces").select("name,currency_code").eq("id", body.workspace_id).single()]);
  if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found"); if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace not found"); if (invoice.status === "void") return json({ error: { code: "invoice_void", message: "A void invoice cannot be sent." } }, { status: 409 });
  const metadata = asRecord(invoice.metadata); const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers; const recipient = body.recipient_email ?? trimmedText(metadata.contact_email) ?? customer?.email ?? null; if (!recipient) return json({ error: { code: "customer_email_required", message: "Recipient email is required to send this invoice." } }, { status: 422 });
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || trimmedText(metadata.contact_name) || "Customer"; const currency = workspace.currency_code || "USD"; const total = Math.max(0, Number(invoice.total) || 0); const paid = Math.max(0, Number(invoice.amount_paid) || 0); const balance = Math.max(0, Number((total - paid).toFixed(2))); const isPaid = invoice.status === "paid" || balance < 0.01; const isPartial = !isPaid && paid > 0;
  const subject = body.subject?.trim() || (isPaid ? `Paid invoice ${invoice.invoice_number} from ${workspace.name}` : isPartial ? `Invoice ${invoice.invoice_number} — ${formatMoney(balance, currency)} remaining` : `Invoice ${invoice.invoice_number} from ${workspace.name} — ${formatMoney(total, currency)}`);
  const intro = body.message?.trim() || (isPaid ? `Hi ${customerName},\n\nThis invoice is paid in full. Here is your final invoice for your records.\n\nThanks,\n${workspace.name}` : isPartial ? `Hi ${customerName},\n\nWe received ${formatMoney(paid, currency)} toward invoice ${invoice.invoice_number}. The remaining balance is ${formatMoney(balance, currency)}.\n\nThanks,\n${workspace.name}` : `Hi ${customerName},\n\nPlease find invoice ${invoice.invoice_number} below. Let us know if you have any questions.\n\nThanks,\n${workspace.name}`);
  const lines = [...(invoice.invoice_lines ?? [])].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)); const lineText = lines.length ? lines.map((line) => `${line.description} — ${line.quantity} × ${formatMoney(line.unit_price, currency)} = ${formatMoney(lineAmount(line.quantity, line.unit_price), currency)}`).join("\n") : "No line items"; const paymentSummary = isPaid ? `Paid: ${formatMoney(paid, currency)}\nBalance due: ${formatMoney(0, currency)}\nStatus: PAID IN FULL` : isPartial ? `Paid: ${formatMoney(paid, currency)}\nBalance due: ${formatMoney(balance, currency)}` : `Balance due: ${formatMoney(balance, currency)}`; const dueText = !isPaid && invoice.due_at ? `\nDue: ${new Date(invoice.due_at).toLocaleDateString("en-US")}` : ""; const plainText = `${intro}\n\nInvoice ${invoice.invoice_number}\n${lineText}\n\nSubtotal: ${formatMoney(invoice.subtotal, currency)}\nTax: ${formatMoney(invoice.tax_total, currency)}\nTotal: ${formatMoney(total, currency)}\n${paymentSummary}${dueText}`;
  const rowsHtml = lines.length ? lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(formatMoney(line.unit_price, currency))}</td><td>${escapeHtml(formatMoney(lineAmount(line.quantity, line.unit_price), currency))}</td></tr>`).join("") : `<tr><td colspan="4">No line items</td></tr>`; const html = `<!doctype html><html><body><h1>Invoice ${escapeHtml(invoice.invoice_number)}</h1><div>${escapeHtml(intro).replaceAll("\n", "<br>")}</div><table><tbody>${rowsHtml}</tbody></table><p>Total: ${escapeHtml(formatMoney(total, currency))}<br>Paid: ${escapeHtml(formatMoney(paid, currency))}<br>Balance due: ${escapeHtml(formatMoney(isPaid ? 0 : balance, currency))}</p></body></html>`;
  const sent = await sendLifecycleEmail({ workspaceId: body.workspace_id, recipientEmail: recipient, customerId: customer?.id ?? null, templateKey: isPaid ? "invoice_and_payment_sequence.payment_received" : "invoice_and_payment_sequence.invoice_created", idempotencyKey: `invoice-send:${invoice.id}:${Date.now()}:${crypto.randomUUID()}`, variables: { "business.name": workspace.name, "invoice.number": invoice.invoice_number, "invoice.total": formatMoney(total, currency), "invoice.balance_due": formatMoney(balance, currency), "invoice.status": String(invoice.status), "customer.full_name": customerName }, metadata: { invoiceId: invoice.id, source: "invoice_send_dialog", invoiceStatus: String(invoice.status), amountPaid: paid.toFixed(2), balanceDue: balance.toFixed(2) }, renderedOverride: { subject, text: plainText, html, purpose: "transactional", fromName: workspace.name } });
  if (sent.status === "suppressed") return json({ data: { recipient, delivery_status: "suppressed", provider: sent.providerName, provider_message_id: sent.providerMessageId, invoice_status: invoice.status, amount_paid: paid, balance_due: balance } });
  const sentAt = new Date().toISOString(); const nextStatus = invoice.status === "draft" ? "issued" : invoice.status; const nextMetadata = { ...metadata, last_sent_at: sentAt, last_sent_to: recipient.toLowerCase(), last_sent_provider: sent.providerName, last_sent_provider_message_id: sent.providerMessageId }; const invoicePatch: Record<string, unknown> = { status: nextStatus, metadata: nextMetadata, updated_at: sentAt }; if (invoice.status === "draft") invoicePatch.issued_at = sentAt;
  const { error: invoiceUpdateError } = await (supabase.from("invoices") as any).update(invoicePatch).eq("workspace_id", body.workspace_id).eq("id", invoice.id); if (invoiceUpdateError) console.error("[invoice-send] email sent but invoice delivery state update failed", invoiceUpdateError);
  return json({ data: { recipient, delivery_status: sent.status, provider: sent.providerName, provider_message_id: sent.providerMessageId, invoice_status: nextStatus, amount_paid: paid, balance_due: balance } });
});

// ---------------------------------------------------------------------------
// Invoices [id]/fleet-payment + lifecycle events
// ---------------------------------------------------------------------------

const fleetPaymentBodySchema = z.object({
  workspace_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
});

documentsRouter.post("/v1/invoices/:id/fleet-payment", async (c) => {
  const invoiceId = z.string().uuid().parse(c.req.param("id"));
  const body = fleetPaymentBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data, error } = await (supabase as any).rpc("record_fleet_invoice_payment", {
    _invoice_id: invoiceId,
    _amount: body.amount,
    _idempotency_key: `manual:${invoiceId}:${crypto.randomUUID()}`,
    _details: { source: "fleet_invoice_ui", note: body.note ?? null },
  });
  if (error) throw new ApiError(502, error.message || "Payment reconciliation failed", "fleet_payment_failed");

  const row = (Array.isArray(data) ? data[0] : data) as {
    status?: string; amount_paid?: number; balance_due?: number;
  } | null;
  if (!row) throw new ApiError(502, "Payment reconciliation returned no result", "fleet_payment_failed");
  return json({
    data: {
      status: String(row.status ?? ""),
      amount_paid: Number(row.amount_paid) || 0,
      balance_due: Number(row.balance_due) || 0,
    },
  });
});

const lifecycleEventBodySchema = z.object({
  workspace_id: z.string().uuid(),
  event_type: z.string().trim().min(1).max(80),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

documentsRouter.post("/v1/invoices/:id/lifecycle-events", async (c) => {
  const invoiceId = z.string().uuid().parse(c.req.param("id"));
  const body = lifecycleEventBodySchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { error } = await (supabase as any).from("invoice_lifecycle_events").insert({
    invoice_id: invoiceId,
    user_id: user.id,
    event_type: body.event_type,
    idempotency_key: body.idempotency_key ?? null,
    details: body.details ?? {},
  });
  // Idempotent on the caller's idempotency key.
  if (error && error.code !== "23505") throw error;
  return json({ data: { inserted: !error } });
});

// ---------------------------------------------------------------------------
// Quotes [id]/convert
// ---------------------------------------------------------------------------

const conversionRequestSchema = z.object({
  workspace_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(16).max(200),
  service_date: z.string().date().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  internal_notes: z.string().trim().max(10000).nullable().optional(),
  expected_quote_updated_at: z.string().datetime().nullable().optional(),
}).strict();

const quoteIdSchema = z.string().uuid();

const quoteConversionErrorMap: Record<string, { status: number; code: string }> = {
  quote_conversion_forbidden: { status: 403, code: "forbidden" },
  quote_not_found: { status: 404, code: "quote_not_found" },
  quote_already_converted: { status: 409, code: "quote_already_converted" },
  quote_status_not_convertible: { status: 409, code: "quote_status_not_convertible" },
  quote_changed_refresh_required: { status: 409, code: "quote_changed_refresh_required" },
};

function normalizeConversionError(error: unknown): never {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "quote_conversion_failed";
  const normalized = quoteConversionErrorMap[message];
  if (normalized) throw new ApiError(normalized.status, message.replaceAll("_", " "), normalized.code);
  throw error;
}

documentsRouter.post("/v1/quotes/:id/convert", async (c) => {
  // The original handler mapped ZodErrors to a 400 validation_error response
  // (the app-level onError has no ZodError special-case), so that branch is
  // preserved here while all other errors propagate to onError.
  try {
    const quoteId = quoteIdSchema.parse(c.req.param("id"));
    const body = conversionRequestSchema.parse(await c.req.json());
    const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor"]);
    const { data, error } = await supabase.rpc("convert_quote_to_service_record_v1", {
      p_workspace_id: body.workspace_id,
      p_quote_id: quoteId,
      p_idempotency_key: body.idempotency_key,
      p_created_by: user.id,
      p_service_date: body.service_date ?? null,
      p_technician_id: body.technician_id ?? null,
      p_appointment_id: body.appointment_id ?? null,
      p_work_order_id: body.work_order_id ?? null,
      p_internal_notes: body.internal_notes ?? null,
      p_expected_quote_updated_at: body.expected_quote_updated_at ?? null,
    });
    if (error) normalizeConversionError(error);

    try {
      if (typeof (supabase as { from?: unknown }).from !== "function") return json({ data });
      const { data: quote } = await supabase
        .from("quotes")
        .select("id,workspace_id,customer_id,total,expires_at,status,metadata")
        .eq("workspace_id", body.workspace_id)
        .eq("id", quoteId)
        .maybeSingle();
      if (quote?.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("first_name,last_name,email")
        .eq("workspace_id", body.workspace_id)
        .eq("id", quote.customer_id)
        .maybeSingle();
      if (customer?.email) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name,timezone")
          .eq("id", body.workspace_id)
          .maybeSingle();
        void dispatchQuoteLifecycle({
          eventKey: QUOTE_LIFECYCLE_EVENT_KEYS.estimateConverted,
          eventId: `${quoteId}:${body.idempotency_key}`,
          quote: {
            ...quote,
            customer_email: customer.email,
            customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
          },
          workspaceName: workspace?.name || "Service Writer workspace",
          workspaceTimezone: workspace?.timezone || "UTC",
          actionUrl: body.appointment_id ? `/appointments/${body.appointment_id}` : `/quotes/${quoteId}`,
          }).catch((dispatchError) => console.error("[Lifecycle] quote conversion email failed", dispatchError));
        }
      }
    } catch (dispatchLookupError) {
      console.error("[Lifecycle] quote conversion enrichment failed", dispatchLookupError);
    }

    return json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: { code: "validation_error", message: "Invalid quote conversion request.", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Quotes [id]/status
// ---------------------------------------------------------------------------

const quoteStatusBodySchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["approved", "declined"]),
  expected_updated_at: z.string().datetime().nullable().optional(),
});

documentsRouter.post("/v1/quotes/:id/status", async (c) => {
  const quoteId = z.string().uuid().parse(c.req.param("id"));
  const body = quoteStatusBodySchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: current, error: currentError } = await supabase
    .from("quotes")
    .select("id,workspace_id,customer_id,status,updated_at,quote_number,total,expires_at,metadata,customers(id,first_name,last_name,email)")
    .eq("workspace_id", body.workspace_id)
    .eq("id", quoteId)
    .single();
  if (currentError || !current) throw currentError ?? new Error("Quote not found");
  if (current.status === "converted") return json({ error: { code: "quote_locked", message: "Converted quotes are immutable." } }, { status: 409 });
  if (body.expected_updated_at && current.updated_at !== body.expected_updated_at) {
    return json({ error: { code: "quote_conflict", message: "The quote changed before this response was submitted." } }, { status: 409 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("quotes")
    .update({ status: body.status })
    .eq("workspace_id", body.workspace_id)
    .eq("id", quoteId)
    .select("id,workspace_id,customer_id,status,updated_at,quote_number,total,expires_at,metadata,customers(id,first_name,last_name,email)")
    .single();
  if (updateError || !updated) throw updateError ?? new Error("Quote status update returned no row");

  const customer = Array.isArray(updated.customers) ? updated.customers[0] : updated.customers;
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";
  const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single();
  const userEmail = typeof user.email === "string" ? user.email : null;
  try {
    if (customer?.email) {
      await dispatchQuoteLifecycle({
        eventKey: body.status === "approved" ? QUOTE_LIFECYCLE_EVENT_KEYS.quoteApproved : QUOTE_LIFECYCLE_EVENT_KEYS.quoteDeclined,
        eventId: `${quoteId}:customer:${body.status}:${updated.updated_at}`,
        quote: { ...updated, customer_email: customer.email, customer_name: customerName },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: new URL(`/quotes/${quoteId}`, c.req.url).toString(),
      });
    }
    if (userEmail) {
      await dispatchQuoteLifecycle({
        eventKey: body.status === "approved" ? QUOTE_LIFECYCLE_EVENT_KEYS.quoteApprovedStaff : QUOTE_LIFECYCLE_EVENT_KEYS.quoteDeclinedStaff,
        eventId: `${quoteId}:staff:${body.status}:${updated.updated_at}`,
        quote: { ...updated, customer_email: customer.email, customer_name: customerName },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: new URL(`/quotes/${quoteId}`, c.req.url).toString(),
        recipientEmail: userEmail,
        recipientRole: "staff",
      });
    }
  } catch (dispatchError) {
    console.error("[Lifecycle] quote status email enqueue failed", dispatchError);
  }

  return json({ data: updated });
});

// ---------------------------------------------------------------------------
// Quotes collection + items + print document
// ---------------------------------------------------------------------------

/**
 * Page-data bundle for the quotes list screen: quotes, customers, vehicles,
 * and the active service catalog for one workspace. The client keeps the
 * legacy UI shaping; the server only scopes the reads.
 */
documentsRouter.get("/v1/quotes/page-data", async (c) => {
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, undefined);

  const [quotesRes, customersRes, vehiclesRes, catalogRes] = await Promise.all([
    (supabase as any)
      .from("quotes")
      .select("id,workspace_id,customer_id,vehicle_id,work_order_id,status,subtotal,tax_total,total,expires_at,created_at,updated_at,metadata")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("customers")
      .select("id,first_name,last_name,company_name")
      .eq("workspace_id", workspace_id)
      .neq("status", "archived")
      .order("last_name"),
    (supabase as any)
      .from("vehicles")
      .select("id,customer_id,make,model,year,vin")
      .eq("workspace_id", workspace_id)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("service_catalog")
      .select("id,name,description,labor_price,metadata")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true)
      .order("name"),
  ]);
  if (quotesRes.error) throw quotesRes.error;
  if (customersRes.error) throw customersRes.error;
  if (vehiclesRes.error) throw vehiclesRes.error;
  if (catalogRes.error) throw catalogRes.error;

  return json({
    data: {
      quotes: quotesRes.data ?? [],
      customers: customersRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
      catalog: catalogRes.data ?? [],
    },
  });
});

const quoteCreateBodySchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: z.string().trim().min(1).max(40),
  subtotal: z.number().nonnegative(),
  tax_total: z.number().nonnegative(),
  total: z.number().nonnegative(),
  expires_at: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

documentsRouter.post("/v1/quotes", async (c) => {
  const body = quoteCreateBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: row, error } = await (supabase as any).from("quotes").insert({
    workspace_id: body.workspace_id,
    customer_id: body.customer_id,
    vehicle_id: body.vehicle_id ?? null,
    status: body.status,
    subtotal: body.subtotal,
    tax_total: body.tax_total,
    total: body.total,
    expires_at: body.expires_at ?? null,
    created_by: body.created_by ?? null,
    metadata: body.metadata,
  }).select().single();
  if (error) throw error;
  return json({ data: row }, { status: 201 });
});

const quotePatchBodySchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: z.string().trim().min(1).max(40).optional(),
  expires_at: z.string().nullable().optional(),
  subtotal: z.number().nonnegative().optional(),
  tax_total: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  metadata_patch: z.record(z.string(), z.unknown()).optional(),
});

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

documentsRouter.patch("/v1/quotes/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = quotePatchBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: current, error: currentError } = await (supabase as any)
    .from("quotes")
    .select("id,status,metadata")
    .eq("workspace_id", body.workspace_id)
    .eq("id", id)
    .single();
  if (currentError || !current) throw currentError ?? new ApiError(404, "Quote not found.", "not_found");
  if (current.status === "converted") {
    return json({ error: { code: "quote_locked", message: "Converted quotes are immutable." } }, { status: 409 });
  }

  const updates: Record<string, unknown> = {
    metadata: { ...asMetadataObject(current.metadata), ...(body.metadata_patch ?? {}) },
  };
  if (body.customer_id !== undefined) updates.customer_id = body.customer_id;
  if (body.vehicle_id !== undefined) updates.vehicle_id = body.vehicle_id;
  if (body.status !== undefined) updates.status = body.status;
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at;
  if (body.subtotal !== undefined) updates.subtotal = body.subtotal;
  if (body.tax_total !== undefined) updates.tax_total = body.tax_total;
  if (body.total !== undefined) updates.total = body.total;

  const { data: row, error } = await (supabase as any)
    .from("quotes")
    .update(updates)
    .eq("workspace_id", body.workspace_id)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data: row });
});

/** UI delete archives a quote without destroying its header or line-item history. */
documentsRouter.delete("/v1/quotes/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: quote, error: readError } = await (supabase as any)
    .from("quotes")
    .select("status,metadata")
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .single();
  if (readError || !quote) throw readError ?? new ApiError(404, "Quote not found.", "not_found");
  if (quote.status === "converted") {
    return json({ error: { code: "quote_locked", message: "Converted quotes cannot be deleted." } }, { status: 409 });
  }

  const metadata = {
    ...asMetadataObject(quote.metadata),
    archived_at: new Date().toISOString(),
    archived_reason: "user_delete",
  };
  const { data: row, error } = await (supabase as any)
    .from("quotes")
    .update({ status: "declined", metadata })
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data: row });
});

documentsRouter.get("/v1/quotes/:id/items", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, undefined);

  const { data, error } = await (supabase as any)
    .from("quote_items")
    .select("id,quote_id,inventory_item_id,description,quantity,unit_price,total_price")
    .eq("workspace_id", workspace_id)
    .eq("quote_id", id)
    .order("created_at");
  if (error) throw error;
  return json({ data: data ?? [] });
});

const quoteItemsBodySchema = z.object({
  workspace_id: z.string().uuid(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid().nullable().optional(),
    description: z.string().trim().min(1).max(1000),
    quantity: z.number(),
    unit_price: z.number(),
    total_price: z.number(),
  })).max(500),
});

documentsRouter.post("/v1/quotes/:id/items", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = quoteItemsBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  if (body.items.length === 0) return json({ data: [] });
  const rows = body.items.map((item) => ({
    ...item,
    inventory_item_id: item.inventory_item_id ?? null,
    quote_id: id,
    workspace_id: body.workspace_id,
  }));
  const { data, error } = await (supabase as any).from("quote_items").insert(rows).select();
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});

/** Draft-edit helper: line replacement is allowed before conversion. */
documentsRouter.delete("/v1/quotes/:id/items", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data: quote, error } = await (supabase as any)
    .from("quotes")
    .select("status")
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .single();
  if (error || !quote) throw error ?? new ApiError(404, "Quote not found.", "not_found");
  if (quote.status === "converted") {
    return json({ error: { code: "quote_locked", message: "Converted quote items are immutable." } }, { status: 409 });
  }

  const { error: deleteError } = await (supabase as any)
    .from("quote_items")
    .delete()
    .eq("workspace_id", workspace_id)
    .eq("quote_id", id);
  if (deleteError) throw deleteError;
  return json({ data: null });
});

/** Print-document bundle for one quote (raw rows; the client shapes the UI). */
documentsRouter.get("/v1/quotes/:id/document", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const customerId = url.searchParams.get("customer_id");
  const vehicleId = url.searchParams.get("vehicle_id");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);

  const [quoteRes, itemsRes, customerRes, vehicleRes, workspaceRes, settingsRes] = await Promise.all([
    (supabase as any)
      .from("quotes")
      .select("id,customer_id,vehicle_id,status,subtotal,tax_total,total,expires_at,created_at,updated_at,metadata")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single(),
    (supabase as any)
      .from("quote_items")
      .select("id,description,quantity,unit_price,total_price")
      .eq("workspace_id", workspaceId)
      .eq("quote_id", id)
      .order("created_at"),
    customerId
      ? supabase.from("customers").select("id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,created_at").eq("workspace_id", workspaceId).eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    vehicleId
      ? supabase.from("vehicles").select("id,make,model,year,trim,license_plate,vin,mileage,color,metadata").eq("workspace_id", workspaceId).eq("id", vehicleId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("owner_name,phone,email,address_line1,address_line2,city,region,postal_code,logo_url").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  if (quoteRes.error) throw quoteRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (customerRes.error) throw customerRes.error;
  if (vehicleRes.error) throw vehicleRes.error;
  if (workspaceRes.error) throw workspaceRes.error;
  if (settingsRes.error) throw settingsRes.error;

  return json({
    data: {
      quote: quoteRes.data,
      items: itemsRes.data ?? [],
      customer: customerRes.data ?? null,
      vehicle: vehicleRes.data ?? null,
      workspace: workspaceRes.data ?? null,
      settings: settingsRes.data ?? null,
    },
  });
});

// ---------------------------------------------------------------------------
// Declined services
// ---------------------------------------------------------------------------

/** Reads for the declined-services tracker (raw rows; the client formats). */
documentsRouter.get("/v1/declined-services", async (c) => {
  const { workspace_id } = workspaceIdQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, undefined);

  const [declinedRes, customerRes, vehicleRes] = await Promise.all([
    (supabase as any).from("declined_services").select("*,customers(first_name,last_name,company_name,email,phone),vehicles(year,make,model)").eq("workspace_id", workspace_id).order("declined_at", { ascending: false }),
    (supabase as any).from("customers").select("id,first_name,last_name,company_name").eq("workspace_id", workspace_id),
    (supabase as any).from("vehicles").select("id,customer_id,year,make,model").eq("workspace_id", workspace_id).order("make"),
  ]);
  if (declinedRes.error) throw declinedRes.error;
  if (customerRes.error) throw customerRes.error;
  if (vehicleRes.error) throw vehicleRes.error;

  return json({
    data: {
      services: declinedRes.data ?? [],
      customers: customerRes.data ?? [],
      vehicles: vehicleRes.data ?? [],
    },
  });
});

const trackDeclinedServiceSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable(),
  recommended_service: z.string().trim().min(1).max(500),
  catalog_item_id: z.string().uuid().nullable(),
  estimated_cost: z.number().nonnegative(),
  urgency: z.string().trim().min(1).max(40),
  decline_reason: z.string().max(2000).nullable().optional(),
  decline_notes: z.string().max(10000).nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
});

documentsRouter.post("/v1/declined-services/track", async (c) => {
  const body = trackDeclinedServiceSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"]);

  const { error } = await (supabase as any).rpc("track_declined_service", {
    p_customer_id: body.customer_id,
    p_vehicle_id: body.vehicle_id,
    p_recommended_service: body.recommended_service,
    p_estimated_cost: body.estimated_cost,
    p_urgency: body.urgency,
    p_decline_reason: body.decline_reason ?? null,
    p_notes: body.decline_notes ?? null,
    p_appointment_id: body.appointment_id ?? null,
    p_catalog_item_id: body.catalog_item_id,
  });
  if (error) throw error;
  return json({ data: null }, { status: 201 });
});

const declinedFollowUpSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  customer_email: z.string().email().nullable().optional(),
  customer_name: z.string().max(240).nullable().optional(),
  recommended_service: z.string().trim().min(1).max(500),
  estimated_cost: z.number().nonnegative(),
  urgency: z.string().trim().min(1).max(40),
});

documentsRouter.post("/v1/declined-services/:id/follow-up", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = declinedFollowUpSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { error } = await (supabase as any)
    .from("declined_services")
    .update({ follow_up_status: "sent", follow_up_sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", body.workspace_id);
  if (error) throw error;

  const { error: queueError } = await (supabase as any).from("email_queue").insert({
    user_id: user.id,
    customer_id: body.customer_id,
    email_type: "declined_service_followup",
    recipient_email: body.customer_email ?? null,
    recipient_name: body.customer_name ?? null,
    scheduled_for: new Date().toISOString(),
    metadata: {
      service_name: body.recommended_service,
      estimated_cost: body.estimated_cost,
      urgency: body.urgency,
    },
  });
  if (queueError) throw queueError;
  return json({ data: null });
});

documentsRouter.post("/v1/declined-services/:id/convert", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { workspace_id } = workspaceIdQuerySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { error } = await (supabase as any)
    .from("declined_services")
    .update({ follow_up_status: "converted", was_converted: true, converted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspace_id);
  if (error) throw error;
  return json({ data: null });
});

// ---------------------------------------------------------------------------
// Document intake (expense document parsing & promotion)
// ---------------------------------------------------------------------------

const INTAKE_BUCKET = "document-intake";
const intakeProfileSchema = z.enum(["service", "fuel", "general"]);

documentsRouter.get("/v1/document-intake", async (c) => {
  const url = new URL(c.req.url);
  const reviewStatus = url.searchParams.get("review_status");
  const profile = url.searchParams.get("profile");
  const fleetVehicleId = url.searchParams.get("fleet_vehicle_id");
  const { supabase, user } = await requireAuth(c);

  let query = (supabase as any)
    .from("document_intake")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (reviewStatus) query = query.eq("review_status", reviewStatus);
  if (profile) query = query.eq("profile", profile);
  if (fleetVehicleId) query = query.eq("fleet_vehicle_id", fleetVehicleId);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

documentsRouter.get("/v1/document-intake/signed-url", async (c) => {
  const url = new URL(c.req.url);
  const filePath = z.string().trim().min(1).max(1024).parse(url.searchParams.get("file_path"));
  const expiresIn = Math.min(3600, Math.max(60, Number(url.searchParams.get("expires_in")) || 600));
  const { supabase, user } = await requireAuth(c);
  if (!filePath.startsWith(`${user.id}/`)) {
    throw new ApiError(403, "You do not have access to this file.", "forbidden");
  }
  const { data, error } = await supabase.storage.from(INTAKE_BUCKET).createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return json({ data: { signedUrl: data?.signedUrl ?? null } });
});

const intakeUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(160),
  file_size_bytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
  profile: intakeProfileSchema,
  content_base64: z.string().min(1),
});

documentsRouter.post("/v1/document-intake/upload", async (c) => {
  const body = intakeUploadSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);

  const ext = body.file_name.includes(".") ? body.file_name.split(".").pop() : "bin";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(body.content_base64, "base64");
  const { error: upErr } = await supabase.storage.from(INTAKE_BUCKET).upload(path, bytes, {
    upsert: false,
    contentType: body.mime_type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await (supabase as any)
    .from("document_intake")
    .insert([{
      user_id: user.id,
      uploaded_by_user_id: user.id,
      file_path: path,
      file_name: body.file_name,
      mime_type: body.mime_type || "application/octet-stream",
      file_size_bytes: body.file_size_bytes,
      profile: body.profile,
      parse_status: "pending",
      review_status: "pending_review",
    }])
    .select("*")
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

documentsRouter.post("/v1/document-intake/:id/parse", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);

  const { data: doc, error: docError } = await (supabase as any)
    .from("document_intake")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new ApiError(404, "Document not found.", "not_found");

  const { data, error } = await supabase.functions.invoke("expense-document-parse", {
    body: { documentId: id },
  });
  if (error) throw error;
  return json({ data });
});

const intakePatchSchema = z.object({
  profile: intakeProfileSchema.optional(),
  parsed_json: z.unknown().optional(),
  review_status: z.enum(["rejected"]).optional(),
  rejection_reason: z.string().max(5000).nullable().optional(),
});

documentsRouter.patch("/v1/document-intake/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = intakePatchSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);

  const patch: Record<string, unknown> = {};
  if (body.profile !== undefined) {
    Object.assign(patch, { profile: body.profile, parse_status: "pending", parsed_json: null, confidence: null });
  }
  if (body.parsed_json !== undefined) patch.parsed_json = body.parsed_json;
  if (body.review_status !== undefined) {
    Object.assign(patch, {
      review_status: body.review_status,
      rejection_reason: body.rejection_reason ?? null,
      reviewed_at: new Date().toISOString(),
    });
  }
  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "No intake fields to update.", "validation_error");
  }

  const { error } = await (supabase as any)
    .from("document_intake")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: null });
});

/** Soft delete: stamps deleted_at, keeps the row for audit. */
documentsRouter.delete("/v1/document-intake/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);

  const { error } = await (supabase as any)
    .from("document_intake")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: null });
});

function intakeNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function intakeNumOrZero(value: unknown): number {
  return intakeNumOrNull(value) ?? 0;
}

/**
 * Approve a parsed document and create the linked downstream record
 * (fleet fuel log for fuel profiles, expense + line items otherwise).
 */
documentsRouter.post("/v1/document-intake/:id/approve", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);

  const { data: doc, error: docError } = await (supabase as any)
    .from("document_intake")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new ApiError(404, "Document not found.", "not_found");
  if (doc.review_status === "approved") {
    return json({
      data: {
        expense_id: doc.promoted_expense_id ?? null,
        work_order_id: doc.promoted_work_order_id ?? null,
        fuel_log_id: doc.promoted_fuel_log_id ?? null,
      },
    });
  }
  if (!doc.parsed_json) throw new ApiError(422, "Document has no parsed data — parse it first.", "parse_required");

  const parsed = doc.parsed_json as Record<string, unknown>;
  const result: { expense_id: string | null; work_order_id: string | null; fuel_log_id: string | null } = {
    expense_id: null,
    work_order_id: null,
    fuel_log_id: null,
  };

  const { data: signed } = await supabase.storage.from(INTAKE_BUCKET).createSignedUrl(doc.file_path, 60 * 60 * 24 * 365);
  const receiptUrl = signed?.signedUrl ?? null;

  // Resolve vendor → vendor_id + suggested category via fuzzy matcher RPC.
  let resolvedVendorId: string | null = null;
  let resolvedCategoryId: string | null = null;
  const rawVendorName = typeof parsed.vendor_name === "string" ? parsed.vendor_name : undefined;
  if (rawVendorName && rawVendorName.trim().length > 0) {
    const { data: matches } = await (supabase as any).rpc("match_vendor_by_name", {
      p_user_id: user.id,
      p_raw_name: rawVendorName,
    });
    const match = Array.isArray(matches) ? matches[0] : null;
    if (match) {
      resolvedVendorId = match.vendor_id ?? null;
      resolvedCategoryId = match.default_category_id ?? null;
    }
  }

  if (doc.profile === "fuel") {
    const { data: log, error } = await (supabase as any)
      .from("fleet_fuel_logs")
      .insert([{
        user_id: user.id,
        fleet_vehicle_id: doc.fleet_vehicle_id,
        fuel_date: (parsed.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        gallons: intakeNumOrNull(parsed.gallons),
        price_per_gallon: intakeNumOrNull(parsed.price_per_gallon),
        total_amount: intakeNumOrZero(parsed.total_amount),
        odometer: parsed.odometer ? Math.round(Number(parsed.odometer)) : null,
        fuel_type: (parsed.fuel_type as string) ?? null,
        station_name: (parsed.station_name as string) ?? null,
        station_location: (parsed.station_location as string) ?? null,
        payment_method: (parsed.payment_method as string) ?? null,
        reference_number: (parsed.reference_number as string) ?? null,
        source_document_id: doc.id,
      }])
      .select("id")
      .single();
    if (error) throw error;
    result.fuel_log_id = log.id;
  } else {
    // service & general → create an expense (service additionally captures vehicle context)
    const lineItems = Array.isArray(parsed.line_items)
      ? (parsed.line_items as Array<Record<string, unknown>>).map((li) => ({
          description: String(li.description ?? ""),
          quantity: Number(li.quantity ?? 1),
          unit_price: Number(li.unit_price ?? 0),
          line_total: Number(li.line_total ?? 0),
        }))
      : [];

    const noteParts: string[] = [];
    if (doc.profile === "service") {
      if (parsed.vin) noteParts.push(`VIN: ${parsed.vin}`);
      if (parsed.mileage) noteParts.push(`Mileage: ${parsed.mileage}`);
      if (parsed.oil_type) noteParts.push(`Oil: ${parsed.oil_type}`);
      if (parsed.oil_spec) noteParts.push(`Spec: ${parsed.oil_spec}`);
    }

    const { data: exp, error: expErr } = await (supabase as any)
      .from("expenses")
      .insert([{
        user_id: user.id,
        submitted_by_user_id: user.id,
        vendor_id: resolvedVendorId,
        vendor_name_raw: (parsed.vendor_name as string) ?? doc.file_name,
        category_id: resolvedCategoryId,
        transaction_date: (parsed.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        subtotal: intakeNumOrZero(parsed.subtotal),
        tax_amount: intakeNumOrZero(parsed.tax_amount),
        total_amount: intakeNumOrZero(parsed.total_amount),
        payment_method: (parsed.payment_method as string) ?? null,
        last4: (parsed.last4 as string) ?? null,
        reference_number: (parsed.reference_number as string) ?? null,
        notes: noteParts.length ? noteParts.join(" • ") : null,
        receipt_url: receiptUrl,
        ocr_confidence: doc.confidence,
        ocr_raw_json: doc.parsed_json,
        status: "approved",
      }])
      .select("id")
      .single();
    if (expErr) throw expErr;
    result.expense_id = exp.id;

    if (lineItems.length > 0) {
      const rows = lineItems.map((li, idx) => ({ ...li, expense_id: exp.id, sort_order: idx }));
      const { error: liErr } = await (supabase as any).from("expense_line_items").insert(rows);
      if (liErr) throw liErr;
    }
  }

  const { error: markErr } = await (supabase as any)
    .from("document_intake")
    .update({
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      promoted_expense_id: result.expense_id,
      promoted_fuel_log_id: result.fuel_log_id,
    })
    .eq("id", doc.id);
  if (markErr) throw markErr;

  return json({ data: result });
});

// ---------------------------------------------------------------------------
// Service recommendations
// ---------------------------------------------------------------------------

documentsRouter.get("/v1/service-recommendations", async (c) => {
  const url = new URL(c.req.url);
  const appointmentId = z.string().uuid().parse(url.searchParams.get("appointment_id"));
  const workspaceParam = url.searchParams.get("workspace_id");
  const { supabase } = workspaceParam
    ? await requireWorkspaceAuth(c, z.string().uuid().parse(workspaceParam), undefined)
    : await requireAuth(c);

  let query = (supabase as any).from("service_recommendations").select("*").eq("appointment_id", appointmentId);
  if (workspaceParam) query = query.eq("workspace_id", z.string().uuid().parse(workspaceParam));
  const { data, error } = await query.order("created_at");
  if (error) throw error;
  return json({ data: data ?? [] });
});

const serviceRecommendationBodySchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  inspection_id: z.string().uuid(),
  inspection_result_id: z.string().uuid().nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(2000),
  technician_notes: z.string().trim().max(10000).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
});

documentsRouter.post("/v1/service-recommendations", async (c) => {
  const body = serviceRecommendationBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist"]);

  const { data, error } = await (supabase as any).from("service_recommendations").insert({
    workspace_id: body.workspace_id,
    appointment_id: body.appointment_id,
    vehicle_id: body.vehicle_id,
    inspection_id: body.inspection_id,
    inspection_result_id: body.inspection_result_id ?? null,
    service_catalog_id: body.service_catalog_id ?? null,
    description: body.description,
    technician_notes: body.technician_notes ?? null,
    price: body.price ?? null,
    status: "pending",
  }).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

const recommendationDecisionBodySchema = z.object({
  decision: z.enum(["approved", "declined"]),
});

documentsRouter.post("/v1/service-recommendations/:id/decide", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = recommendationDecisionBodySchema.parse(await c.req.json());
  const { supabase } = await requireAuth(c);

  // The workspace is resolved from the recommendation row itself so the
  // client never has to supply it for authorization.
  const { data: row, error: rowError } = await (supabase as any)
    .from("service_recommendations")
    .select("workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row?.workspace_id) throw new ApiError(404, "Service recommendation not found.", "not_found");
  await requireWorkspaceAuth(c, row.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  const { data, error } = await (supabase as any).rpc("decide_service_recommendation_v1", {
    p_recommendation_id: id,
    p_decision: body.decision,
  });
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Service-record invoice/print adapter
// ---------------------------------------------------------------------------

/** Print-document bundle for one service record (raw rows; the client shapes the UI). */
documentsRouter.get("/v1/service-invoices/:serviceId", async (c) => {
  const serviceId = z.string().uuid().parse(c.req.param("serviceId"));
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const customerId = url.searchParams.get("customer_id");
  const vehicleId = url.searchParams.get("vehicle_id");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);

  const [serviceRes, customerRes, vehicleRes, workspaceRes, settingsRes, linesRes, specsRes] = await Promise.all([
    (supabase as any).from("service_records").select("*").eq("workspace_id", workspaceId).eq("id", serviceId).maybeSingle(),
    customerId
      ? supabase.from("customers").select("*").eq("workspace_id", workspaceId).eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    vehicleId
      ? supabase.from("vehicles").select("*").eq("workspace_id", workspaceId).eq("id", vehicleId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("owner_name,phone,email,address_line1,address_line2,city,region,postal_code,logo_url").eq("workspace_id", workspaceId).maybeSingle(),
    (supabase as any).from("service_record_line_items").select("*").eq("workspace_id", workspaceId).eq("service_record_id", serviceId).order("sort_order"),
    vehicleId
      ? (supabase as any).from("vehicle_service_specs").select("engine,oil_type,oil_capacity").eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (serviceRes.error) throw serviceRes.error;

  return json({
    data: {
      service: serviceRes.data ?? null,
      customer: customerRes.data ?? null,
      vehicle: vehicleRes.data ?? null,
      workspace: workspaceRes.data ?? null,
      settings: settingsRes.data ?? null,
      lines: linesRes.data ?? [],
      specs: specsRes.data ?? null,
    },
  });
});
