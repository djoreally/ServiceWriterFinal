/**
 * Appointment Payments Query — Read operations for canonical payment records on appointments.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 *
 * P3: the route resolves rows through BOTH bindings (the invoice chain
 * and the metadata shortcut) and returns the composed `payment_state`
 * (invoice facts) alongside the rows. Summaries must read the
 * composition — never row sums: the provider-sync working row is an
 * accounting-invisible artifact (it mirrors the invoice to the provider;
 * its amount is not money owed or collected), so summing rows
 * double-counts it against the real charge.
 */
import { apiClient } from "@/lib/api-client";

export interface AppointmentPaymentRow {
  id: string;
  amount: number;
  subtotal: number | null;
  tax_amount: number | null;
  status: string;
  payment_type: string;
  customer_email: string | null;
  customer_name: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  invoice_sent_at: string | null;
  /** The invoice this row settles, when it binds through the invoice chain. */
  invoice_id: string | null;
  /** metadata.source — e.g. "provider_sync" (working row) or "manual_closeout". */
  source: string | null;
  /** Provider-sync state stamped by the sync (e.g. "synced"), when present. */
  stripe_sync_status: string | null;
  /** The provider-side invoice this row mirrors, when synced. */
  stripe_invoice_id: string | null;
  /** Hosted payment page for the mirrored invoice, when synced. */
  payment_url: string | null;
}

/** Composed payment state for an appointment, from the invoice facts (dollars). */
export interface AppointmentPaymentState {
  invoice_id: string;
  invoice_number: string | number | null;
  invoice_status: string | null;
  total: number;
  amount_paid: number;
  balance: number;
}

export interface AppointmentPaymentsResult {
  payments: AppointmentPaymentRow[];
  paymentState: AppointmentPaymentState | null;
}

type CanonicalPaymentRow = {
  id: string;
  invoice_id: string | null;
  amount: number | string;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * A provider-sync working row: it exists to mirror the appointment's
 * invoice to the payment provider, not to record money. It contributes
 * $0 to every total while its status is not `succeeded`; if its status
 * ever truly flips to `succeeded` (money moved against it), it counts
 * and renders as a normal paid row.
 */
export function isProviderSyncArtifact(row: AppointmentPaymentRow): boolean {
  return row.source === "provider_sync" || row.stripe_sync_status != null;
}

/**
 * A cash-closeout waiver row: the manual-payment flow records the waived
 * difference as its own succeeded row (metadata.source =
 * "manual_adjustment") so the invoice can settle PAID, but no money was
 * collected on it. Collected means succeeded payments that are NOT
 * adjustments. Null-tolerant: `source` is null whenever the row's
 * metadata carried no source, and null never matches.
 */
export function isManualAdjustmentRow(row: AppointmentPaymentRow): boolean {
  return row.source === "manual_adjustment";
}

/** Cents actually collected per the resolved rows (succeeded, non-adjustment rows only). */
export function sumSucceededPaymentsCents(rows: AppointmentPaymentRow[]): number {
  return rows
    .filter((row) => row.status === "succeeded" && !isManualAdjustmentRow(row))
    .reduce((sum, row) => sum + row.amount, 0);
}

/** Cents genuinely outstanding per the resolved rows (sync artifacts excluded). */
export function sumPendingPaymentsCents(rows: AppointmentPaymentRow[]): number {
  return rows
    .filter((row) => row.status === "pending" && !isProviderSyncArtifact(row))
    .reduce((sum, row) => sum + row.amount, 0);
}

function mapPaymentRow(row: CanonicalPaymentRow): AppointmentPaymentRow {
  const metadata = row.metadata ?? {};
  const cents = Math.round(Number(row.amount || 0) * 100);
  return {
    id: row.id,
    amount: cents,
    subtotal: typeof metadata.subtotal_cents === "number" ? metadata.subtotal_cents : null,
    tax_amount: typeof metadata.tax_amount_cents === "number" ? metadata.tax_amount_cents : null,
    status: row.status,
    payment_type: typeof metadata.payment_type === "string" ? metadata.payment_type : row.provider ?? "payment",
    customer_email: typeof metadata.customer_email === "string" ? metadata.customer_email : null,
    customer_name: typeof metadata.customer_name === "string" ? metadata.customer_name : null,
    stripe_payment_intent_id: row.provider === "stripe" ? row.provider_payment_id : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    invoice_sent_at: typeof metadata.invoice_sent_at === "string" ? metadata.invoice_sent_at : null,
    invoice_id: row.invoice_id ?? null,
    source: typeof metadata.source === "string" ? metadata.source : null,
    stripe_sync_status: typeof metadata.stripe_sync_status === "string" ? metadata.stripe_sync_status : null,
    stripe_invoice_id: typeof metadata.stripe_invoice_id === "string" ? metadata.stripe_invoice_id : null,
    payment_url: typeof metadata.payment_url === "string" ? metadata.payment_url : null,
  };
}

/**
 * Fetch the appointment's payment rows AND its composed payment state.
 * Rows arrive resolved through both bindings (invoice chain + metadata
 * shortcut), deduped; the state is composed server-side from the
 * invoice facts and is the only summary source.
 */
export async function fetchAppointmentPaymentsWithState(appointmentId: string): Promise<AppointmentPaymentsResult> {
  const response = await apiClient.get<{ data: CanonicalPaymentRow[]; payment_state: AppointmentPaymentState | null }>(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/payments`,
  );
  return {
    payments: ((response.data || []) as unknown as CanonicalPaymentRow[]).map(mapPaymentRow),
    paymentState: (response as unknown as { payment_state?: AppointmentPaymentState | null }).payment_state ?? null,
  };
}

/** Fetch canonical payment rows resolved for this appointment (both bindings). */
export async function fetchAppointmentPayments(appointmentId: string): Promise<AppointmentPaymentRow[]> {
  const { payments } = await fetchAppointmentPaymentsWithState(appointmentId);
  return payments;
}
