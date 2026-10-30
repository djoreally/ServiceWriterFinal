/**
 * Provider Sync — canonical server implementation.
 *
 * The appointment "Provider Sync" card and the Settings provider-sync panel
 * were built against two Supabase Edge Functions
 * (`sync-appointment-to-provider` and `provider-sync-manager`) that do not
 * exist in this repository, so every call failed: the anonymous version
 * probe hit a missing function ("fn unreachable") and the authenticated
 * proxy answered 401 "Not authenticated" before forwarding (it read the
 * session from a request-scoped Supabase client that never has one — see
 * the git history of `proxyEdgeWithQuery` in the platform router).
 *
 * The sync now runs here, in the platform API:
 *
 * - The Stripe work is delegated to the canonical invoice sync
 *   (`syncCanonicalInvoiceToStripe`), which creates and finalizes the
 *   invoice on the workspace's own Stripe account (Connect or direct) from
 *   `invoice_lines`, matches `invoices.total` exactly, and is idempotent:
 *   it reuses the Stripe invoice id stored on `invoices.metadata` and uses
 *   Stripe idempotency keys, so a second sync never duplicates the invoice.
 * - Every attempt is recorded in `payment_provider_records` /
 *   `payment_provider_sync_logs` — the tables the card reads and subscribes
 *   to in realtime — so sync state is durable and visible in the UI.
 *
 * If the appointment has an invoice but no payment yet (the normal state
 * of a confirmed, not-yet-completed appointment), the canonical pending
 * payment is created first, mirroring `complete_appointment_closeout_v1`
 * (migration 20260907133500); closeout reuses that same pending payment
 * when the job completes, so this never double-charges.
 *
 * Only Stripe invoice sync exists in Service Writer. A workspace whose
 * active provider is Square (or anything else) gets an honest failure —
 * recorded on the sync record — instead of a silent no-op.
 */
import { ApiError } from "@/server/api";
import { syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";

type SupabaseClientLike = any;

export const PROVIDER_SYNC_VERSION = "2.0.0";
export const PROVIDER_SYNC_FUNCTION_NAME = "sync-appointment-to-provider";

/** Staff roles allowed to trigger a provider sync (mirrors POST /v1/payments). */
export const PROVIDER_SYNC_STAFF_ROLES = [
  "owner",
  "admin",
  "manager",
  "service_advisor",
  "receptionist",
];

export type ProviderSyncMode =
  | "appointment_created"
  | "payment_pending"
  | "payment_succeeded"
  | "manual_resync";

const SYNC_MODES: readonly ProviderSyncMode[] = [
  "appointment_created",
  "payment_pending",
  "payment_succeeded",
  "manual_resync",
];

export function normalizeSyncMode(value: unknown): ProviderSyncMode {
  return typeof value === "string" && (SYNC_MODES as readonly string[]).includes(value)
    ? (value as ProviderSyncMode)
    : "manual_resync";
}

/**
 * Local, truthful replacement for the missing edge function's version
 * probe. The sync transport is the platform API itself now, so the probe
 * always answers and the card's "fn unreachable" badge clears.
 */
export function providerSyncFunctionVersion() {
  return {
    ok: true,
    function: PROVIDER_SYNC_FUNCTION_NAME,
    version: PROVIDER_SYNC_VERSION,
    built_at: "platform-api",
    capabilities: {
      transport: "platform_api",
      stripe_invoice_sync: true,
      manual_resync: true,
      square_invoice_sync: false,
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface AppointmentSyncTarget {
  id: string;
  workspace_id: string;
  customer_id: string | null;
}

/** Resolve an appointment's workspace/customer via the service-role client. */
export async function findAppointmentSyncTarget(
  admin: SupabaseClientLike,
  appointmentId: string,
): Promise<AppointmentSyncTarget | null> {
  const { data, error } = await admin
    .from("appointments")
    .select("id,workspace_id,customer_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return (data as AppointmentSyncTarget | null) ?? null;
}

export async function getSyncRecord(
  admin: SupabaseClientLike,
  recordId: string,
): Promise<Record<string, any> | null> {
  const { data, error } = await admin
    .from("payment_provider_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listAppointmentSyncRecords(
  admin: SupabaseClientLike,
  appointmentId: string,
): Promise<Array<Record<string, any>>> {
  const { data, error } = await admin
    .from("payment_provider_records")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSyncRecordLogs(
  admin: SupabaseClientLike,
  recordId: string,
): Promise<Array<Record<string, any>>> {
  const { data, error } = await admin
    .from("payment_provider_sync_logs")
    .select("id,attempt_number,status,error_message,duration_ms,context,created_at")
    .eq("provider_record_id", recordId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Appointment ids for a workspace, newest first, capped for summary reads. */
export async function listWorkspaceAppointmentIds(
  admin: SupabaseClientLike,
  workspaceId: string,
  cap = 2000,
): Promise<string[]> {
  const { data, error } = await admin
    .from("appointments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

export async function listSyncRecordsForAppointments(
  admin: SupabaseClientLike,
  appointmentIds: string[],
  options: { status?: string; limit?: number } = {},
): Promise<Array<Record<string, any>>> {
  if (appointmentIds.length === 0) return [];
  let query = admin
    .from("payment_provider_records")
    .select("*")
    .in("appointment_id", appointmentIds)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.status) query = query.eq("sync_status", options.status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface ProviderSyncSummaryCounts {
  total: number;
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
  dead_letter: number;
  stripe: number;
  square: number;
}

export function summarizeSyncRecords(
  records: Array<Record<string, any>>,
): ProviderSyncSummaryCounts {
  const summary: ProviderSyncSummaryCounts = {
    total: records.length,
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
    dead_letter: 0,
    stripe: 0,
    square: 0,
  };
  for (const record of records) {
    if (record.sync_status === "pending") summary.pending += 1;
    else if (record.sync_status === "processing") summary.processing += 1;
    else if (record.sync_status === "succeeded") summary.succeeded += 1;
    else if (record.sync_status === "failed") summary.failed += 1;
    if (record.dead_letter) summary.dead_letter += 1;
    if (record.provider === "stripe") summary.stripe += 1;
    else if (record.provider === "square") summary.square += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Sync execution
// ---------------------------------------------------------------------------

async function findSyncRecord(
  admin: SupabaseClientLike,
  appointmentId: string,
  provider: string,
  syncMode: ProviderSyncMode,
): Promise<Record<string, any> | null> {
  const { data, error } = await admin
    .from("payment_provider_records")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("provider", provider)
    .eq("sync_mode", syncMode)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

/** Log rows are observability only — never let a log write mask the sync outcome. */
async function writeSyncLog(
  admin: SupabaseClientLike,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await admin.from("payment_provider_sync_logs").insert(row);
    if (error) console.error("[ProviderSync] failed to write sync log", error);
  } catch (logError) {
    console.error("[ProviderSync] failed to write sync log", logError);
  }
}

export interface ExecuteAppointmentProviderSyncParams {
  /** Request-scoped client: canonical invoice/payment reads and writes. */
  supabase: SupabaseClientLike;
  /** Service-role client: the user-keyed provider-sync record tables. */
  admin: SupabaseClientLike;
  workspaceId: string;
  appointment: AppointmentSyncTarget;
  actorUserId: string;
  syncMode?: ProviderSyncMode;
  paymentRecordId?: string | null;
}

export interface AppointmentProviderSyncResult {
  status: "succeeded";
  provider: "stripe";
  version: string;
  record_id: string;
  appointment_id: string;
  invoice_id: string;
  payment_id: string;
  external_invoice_id: string | null;
  external_customer_id: string | null;
  hosted_invoice_url: string | null;
}

export async function executeAppointmentProviderSync(
  params: ExecuteAppointmentProviderSyncParams,
): Promise<AppointmentProviderSyncResult> {
  const { supabase, admin, workspaceId, appointment, actorUserId } = params;
  const syncMode = params.syncMode ?? "manual_resync";
  const appointmentId = appointment.id;

  // The workspace's configured provider governs the sync. (Callers may pass
  // a provider hint from the client; it is advisory only — the canonical
  // invoice sync reads workspace_settings itself.)
  const { data: settings, error: settingsError } = await supabase
    .from("workspace_settings")
    .select("payment_provider")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const provider = text(settings?.payment_provider) ?? "none";

  if (provider !== "stripe") {
    const message =
      provider === "square"
        ? "Square invoice sync is not available in Service Writer — only Stripe workspaces can sync invoices."
        : `The active payment provider is ${provider}; Stripe was not invoked.`;
    // Record the attempt where the schema models it (stripe/square) so the
    // card and Settings panel show the failure instead of "no sync attempted".
    if (provider === "square") {
      const existing = await findSyncRecord(admin, appointmentId, "square", syncMode);
      const attemptCount = (existing?.attempt_count ?? 0) + 1;
      const failedAt = new Date().toISOString();
      let recordId = existing?.id as string | undefined;
      if (existing) {
        const { error } = await admin
          .from("payment_provider_records")
          .update({
            sync_status: "failed",
            attempt_count: attemptCount,
            last_attempt_at: failedAt,
            last_error: message,
            next_retry_at: null,
            updated_at: failedAt,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await admin
          .from("payment_provider_records")
          .insert({
            appointment_id: appointmentId,
            payment_record_id: params.paymentRecordId ?? null,
            customer_id: appointment.customer_id,
            provider: "square",
            sync_mode: syncMode,
            sync_status: "failed",
            attempt_count: attemptCount,
            last_attempt_at: failedAt,
            last_error: message,
            user_id: actorUserId,
            metadata: { source: "platform_api" },
          })
          .select("id")
          .single();
        if (error) throw error;
        recordId = inserted.id;
      }
      if (recordId) {
        await writeSyncLog(admin, {
          provider_record_id: recordId,
          appointment_id: appointmentId,
          attempt_number: attemptCount,
          status: "failed",
          error_message: message,
          sync_mode: syncMode,
          provider: "square",
          user_id: actorUserId,
          context: { source: "platform_api" },
        });
      }
    }
    throw new ApiError(
      409,
      message,
      provider === "square" ? "provider_sync_unsupported" : "active_provider_not_stripe",
    );
  }

  // The appointment's canonical invoice (website and staff invoices link to
  // the appointment via invoices.metadata->>'appointment_id').
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("id,customer_id,subtotal,tax_total,total,status,metadata")
    .eq("workspace_id", workspaceId)
    .eq("metadata->>appointment_id", appointmentId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1);
  if (invoiceError) throw invoiceError;
  const invoice = Array.isArray(invoiceRows) ? invoiceRows[0] : null;
  if (!invoice) {
    throw new ApiError(
      409,
      "This appointment has no invoice yet, so there is nothing to sync to Stripe.",
      "invoice_required",
    );
  }
  if (!invoice.customer_id) {
    throw new ApiError(
      409,
      "The appointment's invoice has no customer, so Stripe cannot invoice it.",
      "invoice_customer_required",
    );
  }

  // Resolve the canonical payment: explicit id, then the appointment's
  // existing payment (closeout's lookup order), then the invoice's.
  let payment: { id: string } | null = null;
  if (params.paymentRecordId) {
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", params.paymentRecordId)
      .maybeSingle();
    if (error) throw error;
    payment = data ?? null;
  }
  if (!payment) {
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("metadata->>appointment_id", appointmentId)
      .in("status", ["pending", "succeeded", "partially_refunded"])
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    payment = Array.isArray(data) ? (data[0] ?? null) : null;
  }
  if (!payment) {
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoice.id)
      .in("status", ["pending", "succeeded", "partially_refunded"])
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    payment = Array.isArray(data) ? (data[0] ?? null) : null;
  }
  if (!payment) {
    // Mirror complete_appointment_closeout_v1's pending payment exactly
    // (source differs so the provenance is visible); closeout finds and
    // reuses this row when the appointment completes.
    const subtotal = Number(invoice.subtotal ?? 0);
    const taxTotal = Number(invoice.tax_total ?? 0);
    const { data: created, error: createError } = await supabase
      .from("payments")
      .insert({
        workspace_id: workspaceId,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        provider: null,
        provider_payment_id: null,
        status: "pending",
        amount: Number(invoice.total ?? 0),
        currency_code: "USD",
        created_by: actorUserId,
        metadata: {
          appointment_id: appointmentId,
          invoice_id: invoice.id,
          source: "provider_sync",
          payment_type: "pay_at_service",
          subtotal,
          tax_amount: taxTotal,
          subtotal_cents: Math.round(subtotal * 100),
          tax_amount_cents: Math.round(taxTotal * 100),
        },
      })
      .select("id")
      .single();
    if (createError) throw createError;
    payment = created;
  }
  if (!payment) throw new Error("Canonical payment could not be resolved for provider sync.");

  // One record per (appointment, provider, sync mode): retries update the
  // same row, so the card shows a single evolving sync state per mode.
  const existing = await findSyncRecord(admin, appointmentId, "stripe", syncMode);
  const attemptCount = (existing?.attempt_count ?? 0) + 1;
  const startedIso = new Date().toISOString();
  let recordId: string;
  if (existing) {
    const { error } = await admin
      .from("payment_provider_records")
      .update({
        payment_record_id: payment.id,
        customer_id: invoice.customer_id,
        sync_status: "processing",
        attempt_count: attemptCount,
        last_attempt_at: startedIso,
        last_error: null,
        updated_at: startedIso,
      })
      .eq("id", existing.id);
    if (error) throw error;
    recordId = existing.id;
  } else {
    const { data: inserted, error } = await admin
      .from("payment_provider_records")
      .insert({
        appointment_id: appointmentId,
        payment_record_id: payment.id,
        customer_id: invoice.customer_id,
        provider: "stripe",
        sync_mode: syncMode,
        sync_status: "processing",
        attempt_count: attemptCount,
        last_attempt_at: startedIso,
        user_id: actorUserId,
        metadata: { source: "platform_api" },
      })
      .select("id")
      .single();
    if (error) throw error;
    recordId = inserted.id;
  }
  await writeSyncLog(admin, {
    provider_record_id: recordId,
    appointment_id: appointmentId,
    attempt_number: attemptCount,
    status: "started",
    sync_mode: syncMode,
    provider: "stripe",
    user_id: actorUserId,
    context: { source: "platform_api", invoice_id: invoice.id, payment_id: payment.id },
  });

  const startedAt = Date.now();
  try {
    const sync = await syncCanonicalInvoiceToStripe({
      supabase,
      workspaceId,
      appointmentId,
      invoiceId: invoice.id,
      paymentId: payment.id,
    });
    if (sync.provider !== "stripe" || sync.status !== "synced") {
      throw new ApiError(
        409,
        `The active payment provider is ${sync.provider}; Stripe was not invoked.`,
        "active_provider_not_stripe",
      );
    }
    const syncedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("payment_provider_records")
      .update({
        sync_status: "succeeded",
        external_invoice_id: sync.stripeInvoiceId ?? null,
        external_customer_id: sync.stripeCustomerId ?? null,
        synced_at: syncedAt,
        last_attempt_at: syncedAt,
        next_retry_at: null,
        last_error: null,
        updated_at: syncedAt,
        metadata: {
          ...object(existing?.metadata),
          source: "platform_api",
          stripe_account_id: sync.stripeAccountId ?? null,
          stripe_hosted_invoice_url: sync.hostedInvoiceUrl ?? null,
          stripe_payment_mode: sync.paymentMode ?? null,
        },
      })
      .eq("id", recordId);
    if (updateError) throw updateError;
    await writeSyncLog(admin, {
      provider_record_id: recordId,
      appointment_id: appointmentId,
      attempt_number: attemptCount,
      status: "succeeded",
      duration_ms: Date.now() - startedAt,
      sync_mode: syncMode,
      provider: "stripe",
      user_id: actorUserId,
      context: {
        source: "platform_api",
        stripe_invoice_id: sync.stripeInvoiceId ?? null,
        stripe_account_id: sync.stripeAccountId ?? null,
        hosted_invoice_url: sync.hostedInvoiceUrl ?? null,
      },
    });
    return {
      status: "succeeded",
      provider: "stripe",
      version: PROVIDER_SYNC_VERSION,
      record_id: recordId,
      appointment_id: appointmentId,
      invoice_id: invoice.id,
      payment_id: payment.id,
      external_invoice_id: sync.stripeInvoiceId ?? null,
      external_customer_id: sync.stripeCustomerId ?? null,
      hosted_invoice_url: sync.hostedInvoiceUrl ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider sync failed";
    // Record the failure, but never mask the original error.
    try {
      const failedAt = new Date().toISOString();
      await admin
        .from("payment_provider_records")
        .update({
          sync_status: "failed",
          last_error: message.slice(0, 500),
          last_attempt_at: failedAt,
          // No background retry worker exists; retries are manual (the
          // card button / Settings retry), so no next_retry_at is promised.
          next_retry_at: null,
          updated_at: failedAt,
        })
        .eq("id", recordId);
      await writeSyncLog(admin, {
        provider_record_id: recordId,
        appointment_id: appointmentId,
        attempt_number: attemptCount,
        status: "failed",
        error_message: message,
        duration_ms: Date.now() - startedAt,
        sync_mode: syncMode,
        provider: "stripe",
        user_id: actorUserId,
        context: { source: "platform_api" },
      });
    } catch {
      // The original sync error below is the one the caller needs.
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, message, "provider_sync_failed");
  }
}
