/**
 * Canonical status vocabularies (Total Redesign B1 — truth rows T-9…T-12).
 *
 * One status set per entity, owned here, consumed at the API boundary.
 * Every job/invoice response carries the canonical `status` plus the
 * server-composed `status_label` and `status_tone`, so no client ever has
 * to invent a label, translate a dialect, or guess a tone again.
 *
 * Rules (from the approved truth table):
 * - T-9: an unrecognized status renders as ITSELF — humanized raw label,
 *   neutral tone. It never collapses into another status.
 * - T-10: invoice dialect is unified on `partially_paid`; the legacy
 *   `partial` / `sent` spellings are read/write aliases that normalize to
 *   the canonical value at the boundary, never values the API emits.
 * - T-11: dispatch state has one home — the `appointments.dispatch_status`
 *   column. Reads resolve column-first, metadata copy second (the copy is
 *   legacy until the remaining DB writers migrate).
 * - T-12: `en_route` is the canonical "en route"; `on_the_way` is an alias.
 *
 * This module is pure (no I/O, no framework imports) so the server, the
 * domain layer, and later the clients all read the same table.
 */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusView {
  status: string | null;
  status_label: string | null;
  status_tone: StatusTone;
}

interface StatusEntry {
  label: string;
  tone: StatusTone;
}

function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return key.length > 0 ? key : null;
}

/** Humanize an unrecognized raw status for display ("walk_in" → "Walk in"). */
function humanizeStatus(key: string): string {
  const words = key.split("_").filter(Boolean);
  if (words.length === 0) return key;
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function buildView(
  table: Record<string, StatusEntry>,
  aliases: Record<string, string>,
  raw: unknown,
): StatusView {
  const key = normalizeKey(raw);
  if (!key) return { status: null, status_label: null, status_tone: "neutral" };
  const canonical = aliases[key] ?? key;
  const entry = table[canonical];
  if (entry) {
    return { status: canonical, status_label: entry.label, status_tone: entry.tone };
  }
  // T-9: unknown statuses render as themselves, never as another status.
  return { status: key, status_label: humanizeStatus(key), status_tone: "neutral" };
}

// ---------------------------------------------------------------------------
// Appointments (T-9, T-12)
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = [
  "requested",
  "pending",
  "scheduled",
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const APPOINTMENT_STATUS_TABLE: Record<string, StatusEntry> = {
  requested: { label: "Requested", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  confirmed: { label: "Confirmed", tone: "info" },
  assigned: { label: "Assigned", tone: "info" },
  en_route: { label: "En route", tone: "info" },
  arrived: { label: "Arrived", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  no_show: { label: "No-show", tone: "neutral" },
};

/** Spellings the system has produced that mean a canonical status. */
const APPOINTMENT_STATUS_ALIASES: Record<string, string> = {
  on_the_way: "en_route", // T-12
  canceled: "cancelled",
  complete: "completed",
  started: "in_progress",
};

export function normalizeAppointmentStatus(raw: unknown): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return APPOINTMENT_STATUS_ALIASES[key] ?? key;
}

export function isAppointmentStatus(raw: unknown): raw is AppointmentStatus {
  const canonical = normalizeAppointmentStatus(raw);
  return canonical !== null && (APPOINTMENT_STATUSES as readonly string[]).includes(canonical);
}

export function appointmentStatusView(raw: unknown): StatusView {
  return buildView(APPOINTMENT_STATUS_TABLE, APPOINTMENT_STATUS_ALIASES, raw);
}

// ---------------------------------------------------------------------------
// Dispatch axis (T-11, T-12) — one home: appointments.dispatch_status column
// ---------------------------------------------------------------------------

export const DISPATCH_STATUSES = [
  "unassigned",
  "assigned",
  "acknowledged",
  "en_route",
  "arrived",
  "started",
  "completed",
  "could_not_complete",
  "cancelled",
] as const;

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

const DISPATCH_STATUS_TABLE: Record<string, StatusEntry> = {
  unassigned: { label: "Unassigned", tone: "warning" },
  assigned: { label: "Assigned", tone: "info" },
  acknowledged: { label: "Acknowledged", tone: "info" },
  en_route: { label: "En route", tone: "info" },
  arrived: { label: "Arrived", tone: "info" },
  started: { label: "Started", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  could_not_complete: { label: "Could not complete", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const DISPATCH_STATUS_ALIASES: Record<string, string> = {
  on_the_way: "en_route", // T-12
  canceled: "cancelled",
};

export function normalizeDispatchStatus(raw: unknown): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return DISPATCH_STATUS_ALIASES[key] ?? key;
}

export function dispatchStatusView(raw: unknown): StatusView {
  return buildView(DISPATCH_STATUS_TABLE, DISPATCH_STATUS_ALIASES, raw);
}

interface DispatchCarrier {
  dispatch_status?: unknown;
  metadata?: unknown;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Resolve a row's dispatch status from its one home (the column),
 * falling back to the legacy metadata copy until every writer migrates.
 */
export function resolveDispatchStatus(row: DispatchCarrier): string | null {
  const fromColumn = normalizeDispatchStatus(row.dispatch_status);
  if (fromColumn) return fromColumn;
  return normalizeDispatchStatus(metadataRecord(row.metadata).dispatch_status);
}

export function dispatchStatusViewForRow(row: DispatchCarrier): StatusView {
  return dispatchStatusView(resolveDispatchStatus(row));
}

// ---------------------------------------------------------------------------
// Invoices (T-10) — partially_paid end-to-end
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
  "past_due",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const INVOICE_STATUS_TABLE: Record<string, StatusEntry> = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Issued", tone: "info" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "neutral" },
  past_due: { label: "Past due", tone: "danger" },
};

/** Legacy dialect spellings; normalized at the boundary, never emitted. */
const INVOICE_STATUS_ALIASES: Record<string, string> = {
  partial: "partially_paid",
  sent: "issued",
};

export function normalizeInvoiceStatus(raw: unknown): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return INVOICE_STATUS_ALIASES[key] ?? key;
}

export function isInvoiceStatus(raw: unknown): raw is InvoiceStatus {
  const canonical = normalizeInvoiceStatus(raw);
  return canonical !== null && (INVOICE_STATUSES as readonly string[]).includes(canonical);
}

export function invoiceStatusView(raw: unknown): StatusView {
  return buildView(INVOICE_STATUS_TABLE, INVOICE_STATUS_ALIASES, raw);
}

// ---------------------------------------------------------------------------
// Payments — record statuses on the payments ledger
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const PAYMENT_STATUS_TABLE: Record<string, StatusEntry> = {
  pending: { label: "Pending", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  succeeded: { label: "Succeeded", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partially refunded", tone: "neutral" },
};

export function normalizePaymentStatus(raw: unknown): string | null {
  return normalizeKey(raw);
}

export function paymentStatusView(raw: unknown): StatusView {
  return buildView(PAYMENT_STATUS_TABLE, {}, raw);
}

// ---------------------------------------------------------------------------
// Row composers — what the API boundary applies to outgoing rows
// ---------------------------------------------------------------------------

export interface AppointmentStatusFields {
  status: string | null;
  status_label: string | null;
  status_tone: StatusTone;
  dispatch_status: string | null;
  dispatch_status_label: string | null;
  dispatch_status_tone: StatusTone | null;
}

type StatusCarrier = {
  status?: unknown;
  dispatch_status?: unknown;
  metadata?: unknown;
};

/**
 * Compose the canonical status fields for an appointment-bearing row.
 * The status triple is always present. The dispatch triple is added only
 * when the row actually carries dispatch sources (a `dispatch_status`
 * column value or metadata), so status-only projections stay lean.
 */
export function withAppointmentStatusView<T extends StatusCarrier>(row: T): T & AppointmentStatusFields {
  const view = appointmentStatusView(row.status);
  const carriesDispatch =
    Object.prototype.hasOwnProperty.call(row, "dispatch_status") ||
    Object.prototype.hasOwnProperty.call(row, "metadata");
  const dispatch = carriesDispatch
    ? dispatchStatusViewForRow(row)
    : { status: null, status_label: null, status_tone: null as StatusTone | null };
  return {
    ...row,
    status: view.status ?? row.status ?? null,
    status_label: view.status_label,
    status_tone: view.status_tone,
    dispatch_status: dispatch.status,
    dispatch_status_label: dispatch.status_label,
    dispatch_status_tone: dispatch.status_tone,
  } as T & AppointmentStatusFields;
}

export interface InvoiceStatusFields {
  status: string | null;
  status_label: string | null;
  status_tone: StatusTone;
}

export function withInvoiceStatusView<T extends { status?: unknown }>(row: T): T & InvoiceStatusFields {
  const view = invoiceStatusView(row.status);
  return {
    ...row,
    status: view.status ?? row.status ?? null,
    status_label: view.status_label,
    status_tone: view.status_tone,
  } as T & InvoiceStatusFields;
}
