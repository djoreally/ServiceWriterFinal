/**
 * Invoices Command — Write operations for manual invoices.
 */
import { supabase } from "@/integrations/supabase/client";
import { bankersRound } from "@/lib/financialMath";
import { generateInvoiceNumber } from "@/application/queries/invoices.query";


import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
export interface InvoiceLineItemInput {
  vehicle_id: string | null;
  service_catalog_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  display_order: number;
  /** Optional VIN-decoded vehicle context (NHTSA) */
  vin?: string | null;
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_trim?: string | null;
  vehicle_engine?: string | null;
  oil_type?: string | null;
  oil_capacity?: string | null;
  oil_filter?: string | null;
  /** Odometer reading captured for this vehicle at billing time (Carfax compliance) */
  vehicle_mileage?: number | null;
  license_plate?: string | null;
  odometer_measure?: string | null;
}

export interface CreateInvoiceInput {
  invoice_number: string;
  bill_to_type: "retail" | "fleet";
  customer_id: string | null;
  fleet_client_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  issue_date: string;
  due_date: string | null;
  payment_terms: string | null;
  notes: string | null;
  terms_text: string | null;

  discount_type: "fixed" | "percentage";
  discount_amount: number;
  tax_enabled: boolean;
  tax_rate: number;
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee: number;
  surcharge_enabled: boolean;
  surcharge: number;

  line_items: InvoiceLineItemInput[];
}

export interface InvoiceTotals {
  subtotal: number;
  effective_discount: number;
  tax_amount: number;
  total: number;
}

/**
 * Computes invoice totals using banker's rounding.
 * subtotal = sum(line_total) + waste_oil + shop_fee + surcharge
 * Discount is applied to the subtotal (capped at subtotal).
 * Tax is applied to (subtotal - discount).
 */
export function computeInvoiceTotals(input: {
  line_items: InvoiceLineItemInput[];
  discount_type: "fixed" | "percentage";
  discount_amount: number;
  tax_enabled: boolean;
  tax_rate: number;
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee: number;
  surcharge_enabled: boolean;
  surcharge: number;
}): InvoiceTotals {
  const lineTotal = input.line_items.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
    0,
  );
  const fees =
    (input.waste_oil_fee_enabled ? Number(input.waste_oil_fee) || 0 : 0) +
    (input.shop_fee_enabled ? Number(input.shop_fee) || 0 : 0) +
    (input.surcharge_enabled ? Number(input.surcharge) || 0 : 0);

  const subtotal = bankersRound(lineTotal + fees, 2);

  const rawDiscount =
    input.discount_type === "percentage"
      ? (subtotal * (Number(input.discount_amount) || 0)) / 100
      : Number(input.discount_amount) || 0;
  const effective_discount = bankersRound(Math.max(0, Math.min(rawDiscount, subtotal)), 2);

  const taxableBase = Math.max(0, subtotal - effective_discount);
  const tax_amount = input.tax_enabled
    ? bankersRound((taxableBase * (Number(input.tax_rate) || 0)) / 100, 2)
    : 0;

  const total = bankersRound(taxableBase + tax_amount, 2);

  return { subtotal, effective_discount, tax_amount, total };
}

export async function createInvoice(input: CreateInvoiceInput): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating an invoice.");
  const totals = computeInvoiceTotals(input);
  const { validateInvoice, assertValid } = await import("@/application/validation/fleet-validation");
  assertValid(validateInvoice({ invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, due_date: input.due_date, line_items: input.line_items, computedTotal: totals.total }), "Cannot create invoice");
  const result = await nextApi.invoices.create({ workspace_id, invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, contact_name: input.contact_name, contact_email: input.contact_email, contact_phone: input.contact_phone, issue_date: input.issue_date, due_date: input.due_date, payment_terms: input.payment_terms, notes: input.notes, terms_text: input.terms_text, status: "draft", subtotal: totals.subtotal, discount_type: input.discount_type, discount_amount: totals.effective_discount, tax_enabled: input.tax_enabled, tax_rate: input.tax_enabled ? input.tax_rate : 0, tax_amount: totals.tax_amount, waste_oil_fee_enabled: input.waste_oil_fee_enabled, waste_oil_fee: input.waste_oil_fee_enabled ? bankersRound(input.waste_oil_fee, 2) : 0, shop_fee_enabled: input.shop_fee_enabled, shop_fee: input.shop_fee_enabled ? bankersRound(input.shop_fee, 2) : 0, surcharge_enabled: input.surcharge_enabled, surcharge: input.surcharge_enabled ? bankersRound(input.surcharge, 2) : 0, total: totals.total, line_items: input.line_items.map((li, idx) => ({ ...li, quantity: bankersRound(Number(li.quantity) || 0, 2), unit_price: bankersRound(Number(li.unit_price) || 0, 2), display_order: li.display_order ?? idx })) });
  return (result.data as { id: string }).id;
}

export async function updateInvoice(invoiceId: string, input: CreateInvoiceInput): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before updating an invoice.");
  const totals = computeInvoiceTotals(input);
  const { validateInvoice, assertValid } = await import("@/application/validation/fleet-validation");
  assertValid(validateInvoice({ invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, due_date: input.due_date, line_items: input.line_items, computedTotal: totals.total }), "Cannot update invoice");
  await nextApi.invoices.update(invoiceId, { workspace_id, invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, contact_name: input.contact_name, contact_email: input.contact_email, contact_phone: input.contact_phone, issue_date: input.issue_date, due_date: input.due_date, payment_terms: input.payment_terms, notes: input.notes, terms_text: input.terms_text, subtotal: totals.subtotal, discount_type: input.discount_type, discount_amount: totals.effective_discount, tax_enabled: input.tax_enabled, tax_rate: input.tax_enabled ? input.tax_rate : 0, tax_amount: totals.tax_amount, waste_oil_fee_enabled: input.waste_oil_fee_enabled, waste_oil_fee: input.waste_oil_fee_enabled ? bankersRound(input.waste_oil_fee, 2) : 0, shop_fee_enabled: input.shop_fee_enabled, shop_fee: input.shop_fee_enabled ? bankersRound(input.shop_fee, 2) : 0, surcharge_enabled: input.surcharge_enabled, surcharge: input.surcharge_enabled ? bankersRound(input.surcharge, 2) : 0, total: totals.total, line_items: input.line_items.map((li, idx) => ({ ...li, quantity: bankersRound(Number(li.quantity) || 0, 2), unit_price: bankersRound(Number(li.unit_price) || 0, 2), display_order: li.display_order ?? idx })) });
}

export async function deleteInvoice(invoiceId: string, reason?: string): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before deleting an invoice.");
  await nextApi.invoices.remove(workspace_id, invoiceId);
}

export async function markInvoiceStatus(invoiceId: string, status: "draft" | "sent" | "partial" | "paid" | "void"): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before updating invoice status.");
  const patch: Record<string, unknown> = { workspace_id, status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  await nextApi.invoices.update(invoiceId, patch);
  if (status === "void") {
    const { error: eventError } = await (supabase as any).from("invoice_lifecycle_events").insert({
      invoice_id: invoiceId,
      user_id: user.id,
      event_type: "voided",
      idempotency_key: `voided:${invoiceId}`,
      details: { source: "invoice_ui" },
    });
    if (eventError && eventError.code !== "23505") throw eventError;
  }
}

/** Send an invoice email via edge function and mark it as sent. */
export async function sendManualInvoiceEmail(params: {
  invoiceId: string;
  recipientEmail?: string;
  subject?: string;
  message?: string;
}): Promise<{ recipient: string }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending an invoice.");
  const { data } = await nextApi.payments.action({ action: "send_manual_invoice", workspace_id, invoice_id: params.invoiceId, recipient_email: params.recipientEmail, subject: params.subject, message: params.message });
  const result = data as { recipient?: string } | null;
  return { recipient: result?.recipient ?? "" };
}

export async function recordFleetInvoicePayment(params: {
  invoiceId: string;
  amount: number;
  note?: string;
}): Promise<{ status: string; amount_paid: number; balance_due: number }> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("Payment amount must be greater than zero");
  const { data, error } = await (supabase as any).rpc("record_fleet_invoice_payment", {
    _invoice_id: params.invoiceId,
    _amount: params.amount,
    _idempotency_key: `manual:${params.invoiceId}:${crypto.randomUUID()}`,
    _details: { source: "fleet_invoice_ui", note: params.note || null },
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Payment reconciliation returned no result");
  return row as { status: string; amount_paid: number; balance_due: number };
}

/**
 * Create a draft manual invoice from a completed Fleet OS work order.
 * Pre-populates fleet_client, bill_to_type=fleet, and line items copied from the WO.
 * Returns the new invoice id.
 */
export async function createInvoiceFromFleetWorkOrder(workOrderId: string): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data: wo, error: woErr } = await supabase
    .from("fleet_work_orders")
    .select(
      "id, order_number, po_number, fleet_client_id, fleet_vehicle_id, fleet_vehicles(year, make, model, vin, license_plate, mileage), fleet_clients(company_name)"
    )
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .single();
  if (woErr || !wo) throw woErr ?? new Error("Work order not found");
  if (!wo.fleet_client_id) throw new Error("Work order has no fleet client attached");

  const { data: lines, error: lineErr } = await supabase
    .from("fleet_work_order_line_items")
    .select("description, quantity, unit_price, service_catalog_id, sort_order")
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id)
    .order("sort_order");
  if (lineErr) throw lineErr;
  if (!lines || lines.length === 0) throw new Error("Work order has no line items to invoice");

  // Check that an invoice does not already exist for this WO (best-effort — matched by po/order number)
  const invoice_number = wo.order_number ? `INV-${wo.order_number}` : await generateInvoiceNumber(user.id);
  const vehicle = wo.fleet_vehicles as unknown as {
    year: number | null; make: string | null; model: string | null; vin: string | null;
    license_plate: string | null; mileage: number | null;
  } | null;

  const line_items: InvoiceLineItemInput[] = lines.map((li, idx): InvoiceLineItemInput => ({
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

  const invoiceId = await createInvoice({
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
  });

  return invoiceId;
}

/**
 * Consolidate completed work orders for one fleet customer into a single invoice.
 * The resulting manual invoice uses the existing send flow, which creates a Stripe
 * Checkout session for connected shops when the invoice is emailed.
 */
export interface BulkFleetInvoicePreviewRow {
  work_order_id: string;
  order_number: string | null;
  status: string;
  fleet_client_id: string | null;
  invoice_id: string | null;
  line_count: number;
  order_total: number;
}

export interface BulkFleetInvoicePreview {
  clientId: string;
  workOrderCount: number;
  lineCount: number;
  subtotal: number;
  rows: BulkFleetInvoicePreviewRow[];
  errors: string[];
}

/**
 * Client-side pre-flight for bulk fleet invoicing. Reports the authoritative
 * counts the atomic RPC will operate on so the preview can show every work
 * order, every line, and the expected total before creation. Read-only.
 */
export async function previewFleetConsolidatedInvoice(
  workOrderIds: string[],
): Promise<BulkFleetInvoicePreview> {
  const ids = [...new Set(workOrderIds)];
  const errors: string[] = [];
  if (ids.length === 0) {
    return { clientId: "", workOrderCount: 0, lineCount: 0, subtotal: 0, rows: [], errors: ["Select at least one work order"] };
  }

  const { data: orders, error: ordersErr } = await supabase
    .from("fleet_work_orders")
    .select("id, order_number, status, fleet_client_id, invoice_id")
    .in("id", ids);
  if (ordersErr) throw ordersErr;

  if (!orders || orders.length !== ids.length) {
    errors.push("Some selected work orders are not accessible");
  }

  const { data: lines, error: linesErr } = await supabase
    .from("fleet_work_order_line_items")
    .select("fleet_work_order_id, quantity, unit_price, total")
    .in("fleet_work_order_id", ids);
  if (linesErr) throw linesErr;

  const linesByWo = new Map<string, { count: number; subtotal: number }>();
  for (const li of lines ?? []) {
    const wid = (li as { fleet_work_order_id: string }).fleet_work_order_id;
    const q = Number((li as { quantity: number }).quantity) || 0;
    const up = Number((li as { unit_price: number }).unit_price) || 0;
    const rawTotal = (li as { total: number | null }).total;
    const total = Number(rawTotal ?? q * up) || 0;
    const bucket = linesByWo.get(wid) ?? { count: 0, subtotal: 0 };
    bucket.count += 1;
    bucket.subtotal += total;
    linesByWo.set(wid, bucket);
  }

  const rows: BulkFleetInvoicePreviewRow[] = (orders ?? []).map((o) => {
    const b = linesByWo.get(o.id) ?? { count: 0, subtotal: 0 };
    return {
      work_order_id: o.id,
      order_number: o.order_number,
      status: o.status,
      fleet_client_id: o.fleet_client_id,
      invoice_id: (o as { invoice_id: string | null }).invoice_id ?? null,
      line_count: b.count,
      order_total: b.subtotal,
    };
  });

  const clients = new Set(rows.map((r) => r.fleet_client_id));
  if (clients.size > 1) errors.push("All selected work orders must belong to the same fleet customer");
  if (rows.some((r) => r.status !== "completed")) errors.push("Every work order must be completed before invoicing");
  if (rows.some((r) => r.invoice_id)) errors.push("One or more work orders is already invoiced");
  const zeroLine = rows.filter((r) => r.line_count === 0);
  if (zeroLine.length > 0) {
    errors.push(`${zeroLine.length} work order(s) have no invoiceable lines`);
  }

  return {
    clientId: rows[0]?.fleet_client_id ?? "",
    workOrderCount: rows.length,
    lineCount: rows.reduce((s, r) => s + r.line_count, 0),
    subtotal: rows.reduce((s, r) => s + r.order_total, 0),
    rows,
    errors,
  };
}

export interface BulkFleetInvoiceResult {
  invoice_id: string;
  invoice_number: string;
  work_order_count: number;
  line_item_count: number;
  subtotal: number;
  total: number;
}

export interface FleetInvoiceOptions {
  taxEnabled?: boolean;
  taxRate?: number;
  processingFeeEnabled?: boolean;
  processingFeeType?: "percentage" | "fixed";
  processingFeeValue?: number;
}

/** True when PostgREST has not yet exposed the fleet invoice RPC. */
export function isMissingFleetInvoiceRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || /could not find the function/i.test(error?.message ?? "");
}

/**
 * Consolidate completed work orders for one fleet customer into a single
 * invoice. Delegates header insert, line copy, work-order linkage, and status
 * flip to the contract-aware `create_fleet_consolidated_invoice_v3` Postgres
 * function, which validates billing groups, required POs and recipients, then
 * delegates the atomic write to the UUID-safe v2 implementation.
 * partial failure cannot leave the shop with a half-built invoice.
 */
export async function createInvoiceFromFleetWorkOrders(
  workOrderIds: string[],
  options: FleetInvoiceOptions = {},
): Promise<BulkFleetInvoiceResult> {
  const ids = [...new Set(workOrderIds)];
  if (ids.length === 0) throw new Error("Select at least one completed work order");

  const { data: invoiceOrders, error: preflightError } = await supabase
    .from("fleet_work_orders")
    .select("id,fleet_contract_id,fleet_purchase_order_id,po_number")
    .in("id", ids);
  if (preflightError || !invoiceOrders || invoiceOrders.length !== ids.length) throw new Error("Unable to validate work orders for invoicing");
  type InvoicePreflightOrder = { fleet_contract_id: string | null; fleet_purchase_order_id: string | null; po_number: string | null };
  if (invoiceOrders.some((order: InvoicePreflightOrder) => !order.fleet_contract_id)) throw new Error("Every work order needs an active contract for automated invoicing.");
  if (invoiceOrders.some((order: InvoicePreflightOrder) => !order.fleet_purchase_order_id || !order.po_number?.trim())) throw new Error("Every work order needs an open purchase order for automated invoicing.");

  const { data, error } = await (supabase as any).rpc("create_fleet_consolidated_invoice_v3", {
    _work_order_ids: ids,
    _invoice_number: null,
    _notes: null,
    _tax_enabled: options.taxEnabled ?? false,
    _tax_rate: options.taxRate ?? 0,
    _processing_fee_enabled: options.processingFeeEnabled ?? false,
    _processing_fee_type: options.processingFeeType ?? "percentage",
    _processing_fee_value: options.processingFeeValue ?? 0,
  });

  if (error) {
    console.error("[createInvoiceFromFleetWorkOrders] rpc failed", error);
    const msg = error.message || error.details || error.hint || "Failed to create invoice";
    throw new Error(msg);
  }

  const row = Array.isArray(data)
    ? (data[0] as BulkFleetInvoiceResult | undefined)
    : (data as BulkFleetInvoiceResult | null);
  if (!row?.invoice_id) throw new Error("Invoice creation returned no id");

  return {
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    work_order_count: Number(row.work_order_count) || ids.length,
    line_item_count: Number(row.line_item_count) || 0,
    subtotal: Number(row.subtotal) || 0,
    total: Number(row.total) || 0,
  };
}
