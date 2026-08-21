import { Q } from '@nozbe/watermelondb';
import { getOfflineDatabase } from '@/offline/database';
import { supabase } from '@/integrations/supabase/client';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';
import { getRuntimeEnvString } from '@/lib/runtime-env';

export interface QueueAppointmentStatusPayload {
  appointmentId: string;
  status: string;
}

export interface QueueInventoryTransferPayload {
  itemId: string;
  vanId: string;
  quantity: number;
}

export interface QueueServiceCatalogPayload {
  action: 'create' | 'update' | 'delete';
  itemId?: string;
  data?: Record<string, unknown>;
}

export interface QueueJobThreadMessagePayload {
  jobId: string;
  jobSource: 'appointment' | 'fleet_work_order';
  content: string;
  channel?: 'dispatch' | 'customer_sms' | 'customer_email';
  recipient?: string | null;
  clientMessageId: string;
}

export interface QueueInventoryMovementPayload {
  vanInventoryId: string;
  entryType: 'consume' | 'waste' | 'return' | 'restock' | 'adjust';
  quantity: number;
  idempotencyKey: string;
  jobId?: string | null;
  jobSource?: string | null;
  note?: string | null;
}

export interface QueueChecklistStepPayload {
  stepId: string;
  status: string;
  evidenceUrl?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}

export interface OutboxAck {
  mutationId: string;
  idempotencyKey: string;
  ackedAt: number;
}

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
const APPOINTMENT_STATUS_ORDER = ['pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled'] as const;

function resolveMaxRetryAttempts(): number {
  const raw = Number(getRuntimeEnvString('VITE_OFFLINE_OUTBOX_MAX_RETRY_ATTEMPTS'));
  if (!Number.isFinite(raw)) return DEFAULT_MAX_RETRY_ATTEMPTS;
  // Guardrails for production safety: keep retries bounded to avoid infinite churn.
  return Math.min(10, Math.max(1, Math.floor(raw)));
}

const MAX_RETRY_ATTEMPTS = resolveMaxRetryAttempts(); // Escalate to dead-letter after this many attempts

async function hasSyncedMutationWithIdempotencyKey(idempotencyKey: string): Promise<boolean> {
  const db = getOfflineDatabase();
  if (!db || !idempotencyKey) return false;
  const rows = await db
    .get('offline_outbox')
    .query(
      Q.where('idempotency_key', idempotencyKey),
      Q.where('status', 'synced'),
    )
    .fetch();
  return rows.length > 0;
}

function classifySyncError(error: unknown): { retryable: boolean; reason: string } {
  const asObj = (error && typeof error === 'object') ? (error as Record<string, unknown>) : null;
  const message = String(asObj?.message || error || 'sync_error');
  const code = String(asObj?.code || '');
  const lower = message.toLowerCase();
  const nonRetryable =
    code === '23505' ||
    code === '23503' ||
    code === 'PGRST116' ||
    lower.includes('invalid') ||
    lower.includes('not found') ||
    lower.includes('permission') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('stale') ||
    lower.includes('conflict');

  return {
    retryable: !nonRetryable,
    reason: message,
  };
}

/**
 * Enqueue an appointment status update for later sync.
 */
export async function queueAppointmentStatusForSync(
  appointmentId: string,
  status: string,
): Promise<void> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return;
  }

  const db = getOfflineDatabase();
  if (!db) return;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `appointment-${appointmentId}-status-${Date.now()}`;
      outbox.entity = 'appointment';
      outbox.operation = 'update_status';
      outbox.payload = JSON.stringify({ appointmentId, status });
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      outbox.idempotency_key = `appointment-${appointmentId}-status-${status}`;
    });
  });
}

/**
 * Enqueue an inventory transfer for later sync.
 */
export async function enqueueInventoryTransfer(
  payload: QueueInventoryTransferPayload,
): Promise<void> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return;
  }

  const db = getOfflineDatabase();
  if (!db) return;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `inventory-${payload.vanId}-${payload.itemId}-${Date.now()}`;
      outbox.entity = 'inventory';
      outbox.operation = 'transfer';
      outbox.payload = JSON.stringify(payload);
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      outbox.idempotency_key = `inventory-transfer-${payload.vanId}-${payload.itemId}-${payload.quantity}`;
    });
  });
}

/**
 * Enqueue a job-thread message (dispatch note or customer update) for later sync.
 * Delivery itself stays server-side; this only replays the authoritative RPC call.
 */
export async function queueJobThreadMessage(
  payload: QueueJobThreadMessagePayload,
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return false;
  }

  const db = getOfflineDatabase();
  if (!db) return false;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `job-message-${payload.clientMessageId}`;
      outbox.entity = 'job_message';
      outbox.operation = 'send';
      outbox.payload = JSON.stringify(payload);
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      // The server dedupes on client_message_id, so a replay can never double-send.
      outbox.idempotency_key = `job-message-${payload.clientMessageId}`;
    });
  });

  return true;
}

/**
 * Enqueue a van stock movement for later sync (ledger-backed, never a raw quantity write).
 */
export async function queueInventoryMovement(
  payload: QueueInventoryMovementPayload,
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return false;
  }

  const db = getOfflineDatabase();
  if (!db) return false;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `inventory-movement-${payload.idempotencyKey}`;
      outbox.entity = 'inventory_movement';
      outbox.operation = payload.entryType;
      outbox.payload = JSON.stringify(payload);
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      outbox.idempotency_key = `inventory-movement-${payload.idempotencyKey}`;
    });
  });

  return true;
}

/**
 * Enqueue a checklist step completion (including its uploaded photo URLs) for later sync.
 */
export async function queueChecklistStep(
  payload: QueueChecklistStepPayload,
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return false;
  }

  const db = getOfflineDatabase();
  if (!db) return false;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `checklist-${payload.idempotencyKey}`;
      outbox.entity = 'job_checklist';
      outbox.operation = 'advance';
      outbox.payload = JSON.stringify(payload);
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      outbox.idempotency_key = `checklist-${payload.idempotencyKey}`;
    });
  });

  return true;
}

/**
 * Enqueue a service catalog item change for later sync.
 * Returns false when the mutation could NOT be queued (offline layer unavailable),
 * so callers can fail over to a direct backend write instead of silently dropping it.
 */
export async function enqueueServiceCatalogChange(
  payload: QueueServiceCatalogPayload,
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return false;
  }

  const db = getOfflineDatabase();
  if (!db) return false;

  await db.write(async () => {
    await db.get('offline_outbox').create((outbox: any) => {
      outbox.mutation_id = `service-catalog-${payload.action}-${payload.itemId || 'new'}-${Date.now()}`;
      outbox.entity = 'service_catalog';
      outbox.operation = payload.action as 'create' | 'update' | 'delete';
      outbox.payload = JSON.stringify(payload.data || {});
      outbox.created_at = Date.now();
      outbox.updated_at = Date.now();
      outbox.status = 'pending';
      outbox.attempt_count = 0;
      outbox.idempotency_key = `service-catalog-${payload.action}-${payload.itemId || 'new'}`;
    });
  });

  return true;
}

/**
 * Process the offline outbox and attempt to sync mutations to Supabase.
 * Implements exponential backoff, max retry limits, and dead-letter escalation.
 *
 * Conflict Policy (Protected Pending):
 * - Locally pending mutations are protected from server overwrites until synced.
 * - Retry follows exponential backoff: 5s, 10s, 20s, 40s, up to 5 minutes.
 * - After MAX_RETRY_ATTEMPTS (5), mutations escalate to 'dead_letter' status.
 * - Dead-letter items remain in queue for operator inspection/action (retry or discard).
 */
export async function processOfflineOutbox(): Promise<void> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return;
  }

  const db = getOfflineDatabase();
  if (!db) return;

  const outbox = await db.get('offline_outbox').query().fetch();
  const orderedMutations = [...outbox].sort((a: any, b: any) => {
    const ar = a?._raw || {};
    const br = b?._raw || {};
    return Number(ar.created_at || 0) - Number(br.created_at || 0);
  });
  const processedKeys = new Set<string>();

  for (const mutation of orderedMutations) {
    const m = mutation as any;
    const rawData = m._raw || {};

    // Skip already synced mutations
    if (rawData.status === 'synced') {
      continue;
    }

    // Skip dead-letter items (operator-only actions)
    if (rawData.status === 'dead_letter') {
      continue;
    }

    // Skip discarded mutations
    if (rawData.status === 'discarded') {
      continue;
    }

    // Check if it's time to retry (based on next_retry_at)
    const nextRetryAt = Number(rawData.next_retry_at ?? 0);
    if (nextRetryAt > 0 && nextRetryAt > Date.now()) {
      continue;
    }

    try {
      const idempotencyKey = String(rawData.idempotency_key || '');
      if (idempotencyKey && processedKeys.has(idempotencyKey)) {
        const now = Date.now();
        await db.write(async () => {
          await mutation.update((rec: any) => {
            rec._raw.status = 'discarded';
            rec._raw.updated_at = now;
            rec._raw.last_error = 'discarded: duplicate idempotency key in current replay window';
          });
        });
        continue;
      }
      if (idempotencyKey && (await hasSyncedMutationWithIdempotencyKey(idempotencyKey))) {
        const now = Date.now();
        await db.write(async () => {
          await mutation.update((rec: any) => {
            rec._raw.status = 'synced';
            rec._raw.acked_at = now;
            rec._raw.updated_at = now;
            rec._raw.last_error = null;
          });
        });
        console.info(`[offline:outbox] replay-safe skip for idempotency_key=${idempotencyKey}`);
        continue;
      }

      const entity = rawData.entity as string;
      const operation = rawData.operation as string;
      let payloadData = {};

      // Safely parse JSON payload
      if (rawData.payload && typeof rawData.payload === 'string') {
        try {
          payloadData = JSON.parse(rawData.payload);
        } catch {
          payloadData = {};
        }
      } else if (typeof rawData.payload === 'object') {
        payloadData = rawData.payload;
      }

      console.info(`[offline:outbox] processing ${entity}.${operation} (attempt ${rawData.attempt_count + 1})`);

      // Route to appropriate sync handler
      switch (entity) {
        case 'appointment':
          await syncAppointmentMutation(m, operation, payloadData);
          break;
        case 'inventory':
          await syncInventoryTransfer(m, operation, payloadData);
          break;
        case 'service_catalog':
          await syncServiceCatalogMutation(m, operation, payloadData);
          break;
        case 'job_message':
          await syncJobThreadMessage(payloadData);
          break;
        case 'inventory_movement':
          await syncInventoryMovement(payloadData);
          break;
        case 'job_checklist':
          await syncChecklistStep(payloadData);
          break;
        default:
          throw new Error(`Unknown entity type: ${entity}`);
      }

      // Mark as synced on success
      const now = Date.now();
      await db.write(async () => {
        await mutation.update((rec: any) => {
          rec._raw.status = 'synced';
          rec._raw.acked_at = now;
          rec._raw.updated_at = now;
          rec._raw.last_error = null;
        });
      });

      console.info(`[offline:outbox] ✓ ${entity}.${operation} synced`);
      if (idempotencyKey) {
        processedKeys.add(idempotencyKey);
      }
    } catch (error: any) {
      const attemptCount = Number(rawData.attempt_count ?? 0);
      const nextAttempt = attemptCount + 1;
      const classification = classifySyncError(error);
      const isFinal = !classification.retryable || nextAttempt > MAX_RETRY_ATTEMPTS;
      const errorMsg = classification.reason || 'Sync failed';

      console.warn(
        `[offline:outbox] ✗ mutation failed (attempt ${nextAttempt}/${MAX_RETRY_ATTEMPTS + 1})`,
        { entity: rawData.entity, operation: rawData.operation, error: errorMsg },
      );

      const now = Date.now();
      const nextRetryDelay = Math.min(
        RETRY_BASE_MS * Math.pow(2, attemptCount),
        RETRY_MAX_MS,
      );

      await db.write(async () => {
        await mutation.update((rec: any) => {
          rec._raw.attempt_count = nextAttempt;
          rec._raw.updated_at = now;
          rec._raw.last_error = errorMsg;

          if (isFinal) {
            // Escalate to dead-letter after max attempts OR immediately for non-retryable command rejection.
            rec._raw.status = classification.retryable ? 'dead_letter' : 'discarded';
            rec._raw.dead_letter_reason = classification.retryable
              ? `Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded: ${errorMsg}`
              : `Permanent rejection: ${errorMsg}`;
            console.warn(`[offline:outbox] ⚠ escalated to dead-letter: ${rec._raw.dead_letter_reason}`);
          } else {
            // Schedule next retry
            rec._raw.status = 'failed';
            rec._raw.next_retry_at = now + nextRetryDelay;
          }
        });
      });
    }
  }
}

async function syncAppointmentMutation(
  mutation: any,
  operation: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const rawData = mutation._raw || {};
  const appointmentId = rawData.mutation_id?.split('-')[1]; // Extract from mutation_id

  if (!appointmentId) {
    throw new Error('Missing appointmentId in mutation');
  }

  if (operation === 'update_status' || operation === 'update') {
    const targetStatus = String(payload.status || '');
    if (!targetStatus) {
      throw new Error('Missing appointment target status');
    }
    const { data: current, error: readError } = await supabase
      .from('appointments')
      .select('id,status')
      .eq('id', appointmentId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current?.id) {
      throw new Error('appointment not found');
    }
    const currentStatus = String(current.status || '');
    if (currentStatus === targetStatus) {
      return;
    }
    const currentIdx = APPOINTMENT_STATUS_ORDER.indexOf(currentStatus as (typeof APPOINTMENT_STATUS_ORDER)[number]);
    const targetIdx = APPOINTMENT_STATUS_ORDER.indexOf(targetStatus as (typeof APPOINTMENT_STATUS_ORDER)[number]);
    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      throw new Error(`stale transition rejected: ${currentStatus} -> ${targetStatus}`);
    }

    const { error } = await supabase
      .from('appointments')
      .update({
        status: targetStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .eq('status', currentStatus);

    if (error) throw error;
  } else {
    throw new Error(`Unsupported appointment operation: ${operation}`);
  }
}

async function syncInventoryTransfer(
  mutation: any,
  operation: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (operation !== 'transfer') {
    throw new Error(`Unsupported inventory operation: ${operation}`);
  }

  // Type-safe extraction of inventory transfer fields
  const itemId = payload.itemId as string | undefined;
  const vanId = payload.vanId as string | undefined;
  const quantity = payload.quantity as number | undefined;

  if (!itemId || !vanId || quantity === undefined) {
    throw new Error('Missing required fields for inventory transfer');
  }

  // Transactional server-side transfer. The queued mutation's idempotency key is
  // passed through so a retried replay resolves to the original ledger entry
  // instead of moving stock a second time.
  const { error } = await supabase.rpc('transfer_inventory_to_van', {
    p_item_id: itemId,
    p_van_id: vanId,
    p_quantity: quantity,
    p_idempotency_key:
      (mutation?._raw?.idempotency_key as string | undefined) ??
      `inventory-transfer-${vanId}-${itemId}-${quantity}`,
  });

  if (error) throw error;

}

async function syncServiceCatalogMutation(
  mutation: any,
  operation: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const rawData = mutation._raw || {};
  const itemId = payload.itemId as string | undefined;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from('service_catalog')
        .insert(payload as any);
      if (error) throw error;
      break;
    }
    case 'update': {
      if (!itemId) {
        throw new Error('Missing itemId for service_catalog update');
      }
      const { error } = await supabase
        .from('service_catalog')
        .update(payload as any)
        .eq('id', itemId);
      if (error) throw error;
      break;
    }
    case 'delete': {
      if (!itemId) {
        throw new Error('Missing itemId for service_catalog delete');
      }
      const { error } = await supabase
        .from('service_catalog')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      break;
    }
    default:
      throw new Error(`Unsupported service_catalog operation: ${operation}`);
  }
}

async function syncJobThreadMessage(payload: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.rpc as any)('send_job_thread_message_v2', {
    p_job_id: payload.jobId,
    p_job_source: payload.jobSource,
    p_content: payload.content,
    p_channel: payload.channel ?? 'dispatch',
    p_recipient: payload.recipient ?? null,
    p_attachments: [],
    p_client_message_id: payload.clientMessageId,
  });
  if (error) throw error;
}

async function syncInventoryMovement(payload: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.rpc as any)('record_inventory_movement_v1', {
    p_van_inventory_id: payload.vanInventoryId,
    p_entry_type: payload.entryType,
    p_quantity: payload.quantity,
    p_idempotency_key: payload.idempotencyKey,
    p_job_id: payload.jobId ?? null,
    p_job_source: payload.jobSource ?? null,
    p_note: payload.note ?? null,
  });
  if (error) throw error;
}

async function syncChecklistStep(payload: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.rpc as any)('advance_job_execution_step_v1', {
    p_step_id: payload.stepId,
    p_status: payload.status,
    p_evidence_url: payload.evidenceUrl ?? undefined,
    p_notes: payload.notes ?? undefined,
  });
  if (error) throw error;
}

/**
 * Get count of pending outbox items (pending or failed status).
 */
export async function getPendingOutboxCount(): Promise<number> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return 0;
  }

  const db = getOfflineDatabase();
  if (!db) return 0;

  const rows = await db
    .get('offline_outbox')
    .query(
      Q.or(Q.where('status', 'pending'), Q.where('status', 'failed')),
    )
    .fetch();

  return rows.length;
}

/**
 * Get all dead-letter items (failed after max retries).
 */
export async function getDeadLetterOutboxItems(): Promise<any[]> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return [];
  }

  const db = getOfflineDatabase();
  if (!db) return [];

  const rows = await db
    .get('offline_outbox')
    .query(Q.where('status', 'dead_letter'))
    .fetch();

  return rows;
}

/**
 * Move a dead-letter item back to 'failed' status for retry.
 * The outbox worker will pick it up on next tick.
 */
export async function retryDeadLetterOutboxItem(mutationId: string): Promise<void> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return;
  }

  const db = getOfflineDatabase();
  if (!db) {
    throw new Error('Offline database not available');
  }

  const rows = await db
    .get('offline_outbox')
    .query(Q.where('mutation_id', mutationId))
    .fetch();

  if (rows.length === 0) {
    throw new Error('Mutation not found');
  }

  const mutation = rows[0];
  const rawData = mutation._raw || {};
  const nextRetryDelay = RETRY_BASE_MS; // Reset retry backoff when operator retries

  await db.write(async () => {
    await mutation.update((rec: any) => {
      rec._raw.status = 'failed';
      rec._raw.attempt_count = 0; // Reset attempt counter
      rec._raw.next_retry_at = Date.now() + nextRetryDelay;
      rec._raw.updated_at = Date.now();
      rec._raw.dead_letter_reason = null;
    });
  });

  console.info(`[offline:outbox] operator retry: ${mutationId}`);
}

/**
 * Discard a dead-letter item (mark as 'discarded').
 * The item will remain in the database for audit purposes but will not be processed.
 */
export async function discardDeadLetterOutboxItem(mutationId: string): Promise<void> {
  if (!(await isOfflineEligibleForCurrentUser())) {
    return;
  }

  const db = getOfflineDatabase();
  if (!db) {
    throw new Error('Offline database not available');
  }

  const rows = await db
    .get('offline_outbox')
    .query(Q.where('mutation_id', mutationId))
    .fetch();

  if (rows.length === 0) {
    throw new Error('Mutation not found');
  }

  const mutation = rows[0];

  await db.write(async () => {
    await mutation.update((rec: any) => {
      rec._raw.status = 'discarded';
      rec._raw.updated_at = Date.now();
    });
  });

  console.info(`[offline:outbox] operator discard: ${mutationId}`);
}

// Intentionally no module-level background side effects.
// The outbox worker hook owns scheduling and execution.
