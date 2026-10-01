import { Q, type Model } from '@nozbe/watermelondb';
import { apiClient } from '@/lib/api-client';
import { getOfflineDatabase } from './index';
import { isOfflineEligibleForUser } from '../rollout';
import { emitOfflineObservability } from '../observability';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
const SYNCED = 'synced';
const ENTITY_APPOINTMENTS = 'appointments';
const ENTITY_CUSTOMERS = 'customers';
const ENTITY_VEHICLES = 'vehicles';
const ENTITY_FLEET_WORK_ORDERS = 'fleet_work_orders';
const ENTITY_SERVICE_CATALOG = 'service_catalog';
const ENTITY_TECH_MESSAGES = 'technician_messages';

type PullEntity =
  | typeof ENTITY_APPOINTMENTS
  | typeof ENTITY_CUSTOMERS
  | typeof ENTITY_VEHICLES
  | typeof ENTITY_FLEET_WORK_ORDERS
  | typeof ENTITY_SERVICE_CATALOG
  | typeof ENTITY_TECH_MESSAGES;

interface SyncRow {
  id: string;
  updated_at?: string | null;
}

interface AppointmentPullRow extends SyncRow {
  title?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  assigned_technician_id?: string | null;
  dispatch_notes?: string | null;
}

interface CustomerPullRow extends SyncRow {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface FleetWorkOrderPullRow extends SyncRow {
  order_number?: string | null;
  status?: string | null;
  priority?: string | null;
  scheduled_date?: string | null;
  service_type?: string | null;
  po_number?: string | null;
  total?: number | null;
  fleet_vehicle_id?: string | null;
  fleet_client_id?: string | null;
}

interface VehiclePullRow extends SyncRow {
  customer_id?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  vin?: string | null;
}

interface ServiceCatalogPullRow extends SyncRow {
  name?: string | null;
  category?: string | null;
  default_price?: number | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

const PULL_PAGE_SIZE = 100; // server paginationSchema max

function readRaw(model: Model, key: string): unknown {
  return Reflect.get(model._raw, key);
}

function writeRaw(model: Model, fields: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fields)) {
    Reflect.set(model._raw, key, value);
  }
}

function toEpoch(value?: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await getCurrentAuthUser();
  if (error) {
    console.warn('[offline] unable to resolve user for pull sync', error);
    return null;
  }
  return data.user?.id ?? null;
}

/**
 * Resolve the caller's workspace through the sanctioned API path.
 * The Hono layer derives it server-side from the auth token.
 */
async function resolveWorkspaceId(): Promise<string | null> {
  try {
    const { workspaceId } = await apiClient.get<{ workspaceId: string | null }>(
      '/v1/workspace-context',
    );
    return workspaceId ?? null;
  } catch (error) {
    console.warn('[offline] unable to resolve workspace for pull sync', error);
    return null;
  }
}

/**
 * Page through a workspace-scoped list endpoint until every row is fetched.
 * The server endpoints return `{ data, pagination }`.
 */
async function fetchAllPages<T>(path: string, workspaceId: string): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await apiClient.get<{ data: T[]; pagination?: { limit: number; offset: number } }>(
      path,
      { query: { workspace_id: workspaceId, limit: PULL_PAGE_SIZE, offset } },
    );
    const batch = page.data ?? [];
    rows.push(...batch);
    if (batch.length < PULL_PAGE_SIZE) break;
    offset += PULL_PAGE_SIZE;
  }
  return rows;
}

function isFreshAfterCursor(row: SyncRow, cursor: string | null): boolean {
  if (!cursor) return true;
  const stamp = toEpoch(row.updated_at);
  if (stamp === undefined) return false;
  return stamp > Date.parse(cursor);
}

async function getCurrentTechnicianId(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ data: { technician_id: string | null } }>(
      '/v1/tech-app/technician-id',
    );
    return data?.technician_id ?? null;
  } catch (error) {
    console.warn('[offline] unable to resolve technician for pull sync', error);
    return null;
  }
}

async function getCursor(entity: PullEntity): Promise<string | null> {
  const database = getOfflineDatabase();
  if (!database) return null;

  const rows = await database.get('offline_sync_state').query(Q.where('entity', entity)).fetch();
  if (rows.length === 0) {
    return null;
  }

  const cursor: unknown = readRaw(rows[0], 'cursor');
  return typeof cursor === 'string' ? cursor : null;
}

async function setCursor(entity: PullEntity, cursor: string): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const rows = await database.get('offline_sync_state').query(Q.where('entity', entity)).fetch();
  const now = Date.now();

  await database.write(async () => {
    if (rows.length > 0) {
      await rows[0].update((record) => {
        writeRaw(record, { cursor, updated_at: now });
      });
      return;
    }

    await database.get('offline_sync_state').create((record) => {
      writeRaw(record, { entity, cursor, updated_at: now });
    });
  });
}

async function markMissingAsDeletedFromIdList(
  tableName: string,
  activeIds: Set<string>,
): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const localRows = await database.get(tableName).query().fetch();

  await database.write(async () => {
    for (const row of localRows) {
      const serverId: unknown = Reflect.get(row._raw, 'server_id');
      if (typeof serverId !== 'string' || activeIds.has(serverId)) {
        continue;
      }

      await row.update((record) => {
        Reflect.set(record._raw, 'is_deleted', true);
        Reflect.set(record._raw, 'sync_status', SYNCED);
        Reflect.set(record._raw, 'updated_at_local', Date.now());
      });
    }
  });
}

function activeIdsOf<T extends SyncRow>(rows: T[]): Set<string> {
  return new Set(rows.map((row) => String(row.id)));
}

function shouldAcceptServerRecord(localRecord: Model, serverUpdatedAt?: number): boolean {
  const localSyncStatus = readRaw(localRecord, 'sync_status');
  const localUpdatedAt = Number(readRaw(localRecord, 'updated_at_local') ?? 0);
  const serverStamp = Number(serverUpdatedAt ?? 0);

  // Protected Pending Policy: Local edits in 'pending' or 'failed' state are protected
  // from being overwritten by stale server data. Only accept server update if the
  // server timestamp is >= local timestamp. This prevents workstation A from losing
  // a user's local edit because workstation B's stale pull came back.
  //
  // Subsequent pulls will see the synced mutation result from the server and accept it.
  if (localSyncStatus === 'pending' || localSyncStatus === 'failed') {
    return serverStamp >= localUpdatedAt;
  }

  // For synced records, always accept server state (last-write-wins by server timestamp)
  return true;
}

async function upsertRows<T extends SyncRow>(
  tableName: string,
  rows: T[],
  project: (record: Model, row: T, now: number) => void,
): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const now = Date.now();
  let protectedPendingSkipCount = 0;
  await database.write(async () => {
    const collection = database.get(tableName);
    for (const row of rows) {
      const existing = await collection.query(Q.where('server_id', row.id)).fetch();
      const serverUpdatedAt = toEpoch(row.updated_at);

      if (existing.length > 0) {
        if (!shouldAcceptServerRecord(existing[0], serverUpdatedAt)) {
          protectedPendingSkipCount += 1;
          continue;
        }

        await existing[0].update((record) => {
          project(record, row, now);
          writeRaw(record, {
            updated_at_server: serverUpdatedAt,
            updated_at_local: now,
            sync_status: SYNCED,
            is_deleted: false,
          });
        });
      } else {
        await collection.create((record) => {
          writeRaw(record, { server_id: row.id });
          project(record, row, now);
          writeRaw(record, {
            updated_at_server: serverUpdatedAt,
            updated_at_local: now,
            sync_status: SYNCED,
            is_deleted: false,
          });
        });
      }
    }
  });

  if (protectedPendingSkipCount > 0) {
    console.info('[offline:conflict] protected-pending local state retained', {
      tableName,
      protectedPendingSkipCount,
    });
  }
}

function getLatestCursor(rows: SyncRow[], currentCursor: string | null): string | null {
  const sorted = rows
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  const candidate = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  return candidate ?? currentCursor;
}

async function pullAppointments(workspaceId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_APPOINTMENTS);
  const rows = await fetchAllPages<AppointmentPullRow>('/v1/appointments', workspaceId);
  const fresh = rows.filter((row) => isFreshAfterCursor(row, cursor));

  await upsertRows('offline_appointments', fresh, (record, row) => {
    writeRaw(record, {
      title: row.title,
      status: row.status,
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      customer_server_id: row.customer_id,
      vehicle_server_id: row.vehicle_id,
    });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_APPOINTMENTS, nextCursor);
  await markMissingAsDeletedFromIdList('offline_appointments', activeIdsOf(rows));
}

async function pullCustomers(workspaceId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_CUSTOMERS);
  const rows = await fetchAllPages<CustomerPullRow>('/v1/customers', workspaceId);
  const fresh = rows.filter((row) => isFreshAfterCursor(row, cursor));

  await upsertRows('offline_customers', fresh, (record, row) => {
    writeRaw(record, { name: row.name, email: row.email, phone: row.phone });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_CUSTOMERS, nextCursor);
  await markMissingAsDeletedFromIdList('offline_customers', activeIdsOf(rows));
}

async function pullVehicles(workspaceId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_VEHICLES);
  const rows = await fetchAllPages<VehiclePullRow>('/v1/vehicles', workspaceId);
  const fresh = rows.filter((row) => isFreshAfterCursor(row, cursor));

  await upsertRows('offline_vehicles', fresh, (record, row) => {
    writeRaw(record, {
      customer_server_id: row.customer_id,
      make: row.make,
      model: row.model,
      year: row.year,
      vin: row.vin,
    });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_VEHICLES, nextCursor);
  await markMissingAsDeletedFromIdList('offline_vehicles', activeIdsOf(rows));
}

async function pullFleetWorkOrders(): Promise<void> {
  const cursor = await getCursor(ENTITY_FLEET_WORK_ORDERS);
  // The fleet_work_orders table is user_id-scoped (not workspace-scoped), so
  // the server endpoint scopes by the caller — no workspace_id is sent.
  const { data } = await apiClient.get<{ data: FleetWorkOrderPullRow[] }>('/v1/fleet/work-orders');
  const rows = data ?? [];
  const fresh = rows.filter((row) => isFreshAfterCursor(row, cursor));

  await upsertRows('offline_fleet_work_orders', fresh, (record, row) => {
    writeRaw(record, {
      order_number: row.order_number,
      status: row.status,
      priority: row.priority,
      scheduled_date: row.scheduled_date,
      service_type: row.service_type,
      po_number: row.po_number,
      total: row.total,
      vehicle_server_id: row.fleet_vehicle_id,
      client_server_id: row.fleet_client_id,
    });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_FLEET_WORK_ORDERS, nextCursor);
  await markMissingAsDeletedFromIdList('offline_fleet_work_orders', activeIdsOf(rows));
}

async function pullServiceCatalog(workspaceId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_SERVICE_CATALOG);
  // Note: the server endpoint returns only is_active catalog rows; inactive
  // items will no longer be pulled (previously the pull was unfiltered).
  const { data } = await apiClient.get<{ data: ServiceCatalogPullRow[] }>('/v1/service-catalog', {
    query: { workspace_id: workspaceId },
  });
  const rows = data ?? [];
  const fresh = rows.filter((row) => isFreshAfterCursor(row, cursor));

  await upsertRows('offline_service_catalog', fresh, (record, row) => {
    writeRaw(record, {
      name: row.name,
      category: row.category,
      default_price: row.default_price,
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_SERVICE_CATALOG, nextCursor);
  await markMissingAsDeletedFromIdList('offline_service_catalog', activeIdsOf(rows));
}

async function pullTechnicianMessages(workspaceId: string): Promise<void> {
  const technicianId = await getCurrentTechnicianId();
  if (!technicianId) {
    return;
  }

  const cursor = await getCursor(ENTITY_TECH_MESSAGES);
  const appointments = await fetchAllPages<AppointmentPullRow>('/v1/appointments', workspaceId);
  const matching = appointments.filter(
    (row) => row.assigned_technician_id === technicianId && row.dispatch_notes != null,
  );
  const fresh = matching.filter((row) => isFreshAfterCursor(row, cursor));

  const rows = fresh.map((row) => ({
    id: row.id,
    appointment_id: row.id,
    dispatch_notes: row.dispatch_notes,
    updated_at: row.updated_at,
  }));

  await upsertRows('offline_technician_messages', rows, (record, row) => {
    const body = row.dispatch_notes || '';
    const type = body.toLowerCase().includes('urgent') ? 'urgent' : 'dispatch';
    const stamp = toEpoch(row.updated_at);
    writeRaw(record, {
      appointment_server_id: row.appointment_id,
      message_type: type,
      title: 'Dispatch Note',
      body,
      created_at_server: stamp,
    });
  });

  const nextCursor = getLatestCursor(matching, cursor);
  if (nextCursor) await setCursor(ENTITY_TECH_MESSAGES, nextCursor);

  // Deletion reconcile runs against the full matching set (not the
  // cursor-filtered window) so unchanged messages are never marked deleted.
  await markMissingAsDeletedFromIdList('offline_technician_messages', activeIdsOf(matching));
}

export async function runOfflinePullSync(): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  if (!isOfflineEligibleForUser(userId)) {
    return;
  }

  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return;

  await pullAppointments(workspaceId);
  await pullCustomers(workspaceId);
  await pullVehicles(workspaceId);
  await pullFleetWorkOrders();
  await pullServiceCatalog(workspaceId);
  await pullTechnicianMessages(workspaceId);
  await emitOfflineObservability('pull_sync');
}
