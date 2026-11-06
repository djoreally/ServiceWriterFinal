/**
 * Appointment money — the ONE server composition of an appointment's
 * money state (P3 payment-state fix).
 *
 * Before this module, every surface composed money its own way and they
 * disagreed: the Home cockpit composed from the INVOICE facts (correct),
 * while the payments route resolved rows by `payments.metadata
 * .appointment_id` only — a shortcut that misses every row bound through
 * the real chain, `payments.invoice_id` → invoice (whose metadata
 * carries the appointment_id). On INV-106 that made the succeeded
 * manual-closeout charge invisible and left the pending provider-sync
 * working row as the only "payment" three surfaces could see.
 *
 * The composition rule (identical to the cockpit's T-14 job money, from
 * which the linking + money code below is extracted verbatim):
 *   - the invoice total when the job is invoiced; due = total −
 *     amount_paid (invoice facts, never payment-row sums);
 *   - the locked quote verbatim when a channel locked it;
 *   - else the fee-loaded service-line total, owed in full at service.
 *
 * Consumers: the cockpit route, the appointments list route, the
 * appointment payments route. Client surfaces take their summary from
 * the composed facts this module produces — never from summing rows.
 */
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { lockedQuoteTotal } from "@/lib/price-lock";

const INVOICE_LINK_COLUMNS = "id,invoice_number,total,amount_paid,status,created_at,metadata";
const PAYMENT_ROW_COLUMNS =
  "id,invoice_id,amount,status,provider,provider_payment_id,created_at,updated_at,metadata";
const FEE_SETTINGS_COLUMNS =
  "waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,tax_rate";

type Row = Record<string, any>;

export interface AppointmentInvoiceFacts {
  invoice_id: string;
  invoice_number: string | number | null;
  invoice_status: string | null;
  total: number;
  amount_paid: number;
  balance: number;
}

export interface AppointmentJobMoney {
  total: number;
  due: number;
  invoice: AppointmentInvoiceFacts | null;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function appointmentInvoiceFacts(invoice: Row): AppointmentInvoiceFacts {
  const total = Number(invoice.total ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  return {
    invoice_id: invoice.id as string,
    invoice_number: (invoice.invoice_number as string | number | null | undefined) ?? null,
    invoice_status: (invoice.status as string | null | undefined) ?? null,
    total,
    amount_paid: amountPaid,
    balance: Math.max(total - amountPaid, 0),
  };
}

/**
 * Each appointment's invoice, linked by invoices.metadata.appointment_id
 * (written by the invoice sync) or by the sync's invoice_id write-back
 * on the appointment itself. The latest non-void invoice wins.
 * (Extracted verbatim from the cockpit route.)
 */
export async function linkAppointmentInvoices(
  db: any,
  workspaceId: string,
  rows: Array<Row>,
): Promise<Map<string, Row>> {
  const allRows = rows ?? [];
  const appointmentIds = [...new Set(allRows.map((row) => row.id as string))];
  const invoiceIdHints = new Map<string, string>();
  for (const row of allRows) {
    const hint = asRecord(row.metadata).invoice_id;
    if (typeof hint === "string" && hint) invoiceIdHints.set(hint, row.id as string);
  }
  const linkedInvoices = new Map<string, Row>();
  if (appointmentIds.length > 0) {
    const [byAppointment, byId] = await Promise.all([
      db.from("invoices")
        .select(INVOICE_LINK_COLUMNS)
        .eq("workspace_id", workspaceId)
        .filter("metadata->>appointment_id", "in", `(${appointmentIds.join(",")})`),
      invoiceIdHints.size > 0
        ? db.from("invoices")
            .select(INVOICE_LINK_COLUMNS)
            .eq("workspace_id", workspaceId)
            .in("id", [...invoiceIdHints.keys()])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (byAppointment.error) throw byAppointment.error;
    if (byId.error) throw byId.error;
    const candidates = [
      ...((byAppointment.data ?? []) as Array<Row>),
      ...((byId.data ?? []) as Array<Row>),
    ];
    for (const invoice of candidates) {
      if (invoice.status === "void") continue;
      const linked = asRecord(invoice.metadata).appointment_id;
      const appointmentId = (typeof linked === "string" && linked) || invoiceIdHints.get(invoice.id as string);
      if (!appointmentId) continue;
      const existing = linkedInvoices.get(appointmentId);
      if (!existing || String(invoice.created_at ?? "") > String(existing.created_at ?? "")) {
        linkedInvoices.set(appointmentId, invoice);
      }
    }
  }
  return linkedInvoices;
}

/**
 * Composed { total, due } per appointment (the cockpit's T-14 job
 * money), plus the invoice facts behind the invoiced branch. When
 * `options.feeSettings` is provided (including null) it is used as-is —
 * the cockpit passes the settings it already fetched; otherwise the
 * workspace fee settings are loaded best-effort, exactly as the cockpit
 * loads them.
 */
export async function composeAppointmentJobMoney(
  db: any,
  workspaceId: string,
  rows: Array<Row>,
  options?: { feeSettings?: unknown },
): Promise<Map<string, AppointmentJobMoney>> {
  const allRows = rows ?? [];
  const result = new Map<string, AppointmentJobMoney>();
  if (allRows.length === 0) return result;
  const appointmentIds = [...new Set(allRows.map((row) => row.id as string))];

  let feeSettings: unknown;
  if (options && "feeSettings" in options) {
    feeSettings = options.feeSettings ?? null;
  } else {
    const { data, error } = await db
      .from("workspace_settings")
      .select(FEE_SETTINGS_COLUMNS)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    feeSettings = error ? null : (data ?? null);
  }

  const linkedInvoices = await linkAppointmentInvoices(db, workspaceId, allRows);

  // Priced service lines per appointment — the same { price, quantity }
  // shape the appointments service-lines endpoint feeds the total math.
  const itemsByAppointment = new Map<string, Array<{ price: number; quantity: number }>>();
  if (appointmentIds.length > 0) {
    const { data: itemRows, error: itemsError } = await db
      .from("appointment_items")
      .select("appointment_id,quantity,unit_price")
      .eq("workspace_id", workspaceId)
      .in("appointment_id", appointmentIds);
    if (itemsError) throw itemsError;
    for (const item of (itemRows ?? []) as Array<Row>) {
      const list = itemsByAppointment.get(item.appointment_id as string) ?? [];
      list.push({ price: Number(item.unit_price ?? 0), quantity: Number(item.quantity ?? 1) });
      itemsByAppointment.set(item.appointment_id as string, list);
    }
  }

  for (const row of allRows) {
    const invoice = linkedInvoices.get(row.id as string);
    if (invoice) {
      const facts = appointmentInvoiceFacts(invoice);
      result.set(row.id as string, { total: facts.total, due: facts.balance, invoice: facts });
      continue;
    }
    const metadata = asRecord(row.metadata);
    const locked = lockedQuoteTotal({
      source: row.source as string | null | undefined,
      metadata: row.metadata,
      estimated_cost: row.estimated_cost,
    });
    if (locked != null) {
      result.set(row.id as string, { total: locked, due: locked, invoice: null });
      continue;
    }
    const total = computeAppointmentTotal(
      {
        estimated_cost: asNumber(metadata.estimated_cost) ?? asNumber(row.estimated_cost),
        tax_amount: asNumber(metadata.tax_amount) ?? asNumber(metadata.client_tax_amount),
        appointment_services: itemsByAppointment.get(row.id as string) ?? [],
      },
      feeSettings as never,
    );
    result.set(row.id as string, { total, due: total, invoice: null });
  }
  return result;
}

/**
 * The composed payment state for ONE appointment: the invoice facts of
 * its linked invoice, or null when the appointment has no invoice.
 * This is the summary every payment surface must read — amounts come
 * from the invoice row, never from summing payment rows.
 */
export async function composeAppointmentPaymentState(
  db: any,
  workspaceId: string,
  appointment: { id: string; metadata?: unknown },
): Promise<AppointmentInvoiceFacts | null> {
  const linked = await linkAppointmentInvoices(db, workspaceId, [
    { id: appointment.id, metadata: appointment.metadata },
  ]);
  const invoice = linked.get(appointment.id);
  return invoice ? appointmentInvoiceFacts(invoice) : null;
}

async function resolveAppointmentInvoiceIds(
  db: any,
  workspaceId: string,
  appointmentId: string,
  appointmentMetadata: unknown,
): Promise<string[]> {
  const ids = new Set<string>();
  const hint = asRecord(appointmentMetadata).invoice_id;
  if (typeof hint === "string" && hint) ids.add(hint);
  const { data, error } = await db
    .from("invoices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { appointment_id: appointmentId });
  if (error) throw error;
  for (const invoice of (data ?? []) as Array<Row>) {
    if (invoice?.id) ids.add(invoice.id as string);
  }
  return [...ids];
}

/**
 * Every payment row that belongs to an appointment, resolved through
 * BOTH bindings — the invoice chain (`payments.invoice_id` → an invoice
 * linked to the appointment) and the metadata shortcut
 * (`payments.metadata.appointment_id`) — deduped by id, newest first.
 * The optional status filter is applied across both paths.
 */
export async function resolveAppointmentPaymentRows(
  db: any,
  workspaceId: string,
  appointmentId: string,
  appointmentMetadata: unknown,
  status?: string | null,
): Promise<Array<Row>> {
  const invoiceIds = await resolveAppointmentInvoiceIds(db, workspaceId, appointmentId, appointmentMetadata);
  const queries: Array<PromiseLike<{ data: Array<Row> | null; error: unknown }>> = [
    db.from("payments")
      .select(PAYMENT_ROW_COLUMNS)
      .eq("workspace_id", workspaceId)
      .contains("metadata", { appointment_id: appointmentId }),
  ];
  if (invoiceIds.length > 0) {
    queries.push(
      db.from("payments")
        .select(PAYMENT_ROW_COLUMNS)
        .eq("workspace_id", workspaceId)
        .in("invoice_id", invoiceIds),
    );
  }
  const results = await Promise.all(queries);
  const byId = new Map<string, Row>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data ?? []) {
      if (row?.id && !byId.has(row.id as string)) byId.set(row.id as string, row);
    }
  }
  let resolved = [...byId.values()];
  if (status) resolved = resolved.filter((row) => row.status === status);
  resolved.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return resolved;
}
