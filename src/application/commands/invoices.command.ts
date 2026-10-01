/**
 * Invoices Command — Write operations for manual invoices.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. The server resolves
 * workspace membership from the auth token; exported signatures are unchanged.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { bankersRound } from "@/lib/financialMath";


import { getCurrentAuthUser } from "@/lib/auth/current-user";
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
  const result = await apiClient.post<{ data: { id: string } }>(`/v1/invoices`, { workspace_id, invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, contact_name: input.contact_name, contact_email: input.contact_email, contact_phone: input.contact_phone, issue_date: input.issue_date, due_date: input.due_date, payment_terms: input.payment_terms, notes: input.notes, terms_text: input.terms_text, status: "draft", subtotal: totals.subtotal, discount_type: input.discount_type, discount_amount: totals.effective_discount, tax_enabled: input.tax_enabled, tax_rate: input.tax_enabled ? input.tax_rate : 0, tax_amount: totals.tax_amount, waste_oil_fee_enabled: input.waste_oil_fee_enabled, waste_oil_fee: input.waste_oil_fee_enabled ? bankersRound(input.waste_oil_fee, 2) : 0, shop_fee_enabled: input.shop_fee_enabled, shop_fee: input.shop_fee_enabled ? bankersRound(input.shop_fee, 2) : 0, surcharge_enabled: input.surcharge_enabled, surcharge: input.surcharge_enabled ? bankersRound(input.surcharge, 2) : 0, total: totals.total, line_items: input.line_items.map((li, idx) => ({ ...li, quantity: bankersRound(Number(li.quantity) || 0, 2), unit_price: bankersRound(Number(li.unit_price) || 0, 2), display_order: li.display_order ?? idx })) });
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
  await apiClient.patch<{ data: unknown }>(`/v1/invoices/${encodeURIComponent(invoiceId)}`, { workspace_id, invoice_number: input.invoice_number, bill_to_type: input.bill_to_type, customer_id: input.customer_id, fleet_client_id: input.fleet_client_id, contact_name: input.contact_name, contact_email: input.contact_email, contact_phone: input.contact_phone, issue_date: input.issue_date, due_date: input.due_date, payment_terms: input.payment_terms, notes: input.notes, terms_text: input.terms_text, subtotal: totals.subtotal, discount_type: input.discount_type, discount_amount: totals.effective_discount, tax_enabled: input.tax_enabled, tax_rate: input.tax_enabled ? input.tax_rate : 0, tax_amount: totals.tax_amount, waste_oil_fee_enabled: input.waste_oil_fee_enabled, waste_oil_fee: input.waste_oil_fee_enabled ? bankersRound(input.waste_oil_fee, 2) : 0, shop_fee_enabled: input.shop_fee_enabled, shop_fee: input.shop_fee_enabled ? bankersRound(input.shop_fee, 2) : 0, surcharge_enabled: input.surcharge_enabled, surcharge: input.surcharge_enabled ? bankersRound(input.surcharge, 2) : 0, total: totals.total, line_items: input.line_items.map((li, idx) => ({ ...li, quantity: bankersRound(Number(li.quantity) || 0, 2), unit_price: bankersRound(Number(li.unit_price) || 0, 2), display_order: li.display_order ?? idx })) });
}

export async function deleteInvoice(invoiceId: string, reason?: string): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before deleting an invoice.");
  await apiClient.delete(`/v1/invoices/${encodeURIComponent(invoiceId)}`, { query: { workspace_id } });
}

export async function markInvoiceStatus(invoiceId: string, status: "draft" | "sent" | "partial" | "paid" | "void"): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before updating invoice status.");
  const patch: Record<string, unknown> = { workspace_id, status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  await apiClient.patch<{ data: unknown }>(`/v1/invoices/${encodeURIComponent(invoiceId)}`, patch);
  if (status === "void") {
    // Server records the lifecycle event idempotently on the caller's key.
    await apiClient.post<{ data: { inserted: boolean } }>(
      `/v1/invoices/${encodeURIComponent(invoiceId)}/lifecycle-events`,
      {
        workspace_id,
        event_type: "voided",
        idempotency_key: `voided:${invoiceId}`,
        details: { source: "invoice_ui" },
      },
    );
  }
}

/** Send an invoice email via the documents router and mark it as sent. */
export async function sendManualInvoiceEmail(params: {
  invoiceId: string;
  recipientEmail?: string;
  subject?: string;
  message?: string;
}): Promise<{ recipient: string }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending an invoice.");
  try {
    const { data } = await apiClient.post<{ data: { recipient?: string } | null }>(
      `/v1/invoices/${encodeURIComponent(params.invoiceId)}/send`,
      {
        workspace_id,
        recipient_email: params.recipientEmail,
        subject: params.subject,
        message: params.message,
      },
    );
    return { recipient: data?.recipient ?? "" };
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? error.message : "Failed to send invoice");
  }
}

export async function recordFleetInvoicePayment(params: {
  invoiceId: string;
  amount: number;
  note?: string;
}): Promise<{ status: string; amount_paid: number; balance_due: number }> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("Payment amount must be greater than zero");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before recording a payment.");
  const { data } = await apiClient.post<{ data: { status: string; amount_paid: number; balance_due: number } | null }>(
    `/v1/invoices/${encodeURIComponent(params.invoiceId)}/fleet-payment`,
    { workspace_id, amount: params.amount, note: params.note ?? null },
  );
  if (!data) throw new Error("Payment reconciliation returned no result");
  return data;
}

interface FleetWorkOrderInvoicePayload {
  invoice_number: string;
  bill_to_type: "fleet";
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

/**
 * Create a draft manual invoice from a completed Fleet OS work order.
 * The documents router builds the pre-populated fleet_client /
 * bill_to_type=fleet payload from the work order; this function then feeds
 * it through the canonical createInvoice path. Returns the new invoice id.
 */
export async function createInvoiceFromFleetWorkOrder(workOrderId: string): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating an invoice.");

  const { data } = await apiClient.get<{ data: FleetWorkOrderInvoicePayload }>(
    `/v1/invoices/from-fleet-work-order/${encodeURIComponent(workOrderId)}`,
    { query: { workspace_id } },
  );

  return createInvoice({
    invoice_number: data.invoice_number,
    bill_to_type: "fleet",
    customer_id: data.customer_id,
    fleet_client_id: data.fleet_client_id,
    contact_name: data.contact_name,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    issue_date: data.issue_date,
    due_date: data.due_date,
    payment_terms: data.payment_terms,
    notes: data.notes,
    terms_text: data.terms_text,
    discount_type: data.discount_type,
    discount_amount: data.discount_amount,
    tax_enabled: data.tax_enabled,
    tax_rate: data.tax_rate,
    waste_oil_fee_enabled: data.waste_oil_fee_enabled,
    waste_oil_fee: data.waste_oil_fee,
    shop_fee_enabled: data.shop_fee_enabled,
    shop_fee: data.shop_fee,
    surcharge_enabled: data.surcharge_enabled,
    surcharge: data.surcharge,
    line_items: data.line_items,
  });
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
  if (ids.length === 0) {
    return { clientId: "", workOrderCount: 0, lineCount: 0, subtotal: 0, rows: [], errors: ["Select at least one work order"] };
  }
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before previewing a fleet invoice.");

  const { data } = await apiClient.get<{ data: BulkFleetInvoicePreview }>(
    `/v1/invoices/fleet-consolidated-preview`,
    { query: { workspace_id, work_order_ids: ids } },
  );
  return data;
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
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating a fleet invoice.");

  try {
    const { data } = await apiClient.post<{ data: BulkFleetInvoiceResult | null }>(
      `/v1/invoices/fleet-consolidated`,
      {
        workspace_id,
        work_order_ids: ids,
        tax_enabled: options.taxEnabled ?? false,
        tax_rate: options.taxRate ?? 0,
        processing_fee_enabled: options.processingFeeEnabled ?? false,
        processing_fee_type: options.processingFeeType ?? "percentage",
        processing_fee_value: options.processingFeeValue ?? 0,
      },
    );
    if (!data?.invoice_id) throw new Error("Invoice creation returned no id");
    return {
      invoice_id: data.invoice_id,
      invoice_number: data.invoice_number,
      work_order_count: Number(data.work_order_count) || ids.length,
      line_item_count: Number(data.line_item_count) || 0,
      subtotal: Number(data.subtotal) || 0,
      total: Number(data.total) || 0,
    };
  } catch (error) {
    console.error("[createInvoiceFromFleetWorkOrders] request failed", error);
    throw new Error(error instanceof Error ? error.message : "Failed to create invoice");
  }
}
