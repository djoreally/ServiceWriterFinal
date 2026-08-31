import { Q, type Model } from '@nozbe/watermelondb';
import { supabase } from '@/integrations/supabase/client';
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

async function getCurrentTechnicianId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('technicians')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[offline] unable to resolve technician for pull sync', error.message);
    return null;
  }

  return data?.id ?? null;
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

async function markMissingAsDeleted(
  entity: 'appointments' | 'customers' | 'vehicles' | 'fleet_work_orders' | 'service_catalog',
  tableName: string,
  userId: string,
): Promise<void> {
  const source = await supabase.from(entity).select('id').eq('user_id', userId);
  if (source.error) {
    console.warn(`[offline] deletion reconcile skipped for ${entity}`, source.error.message);
    return;
  }

  const activeIds = new Set<string>((source.data ?? []).map((row) => String(row.id)));
  await markMissingAsDeletedFromIdList(tableName, activeIds);
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

async function pullAppointments(userId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_APPOINTMENTS);
  let query = supabase
    .from('appointments')
    .select('id,title,status,scheduled_date,scheduled_time,customer_id,vehicle_id,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] appointments pull failed: ${response.error.message}`);

  const rows = response.data ?? [];
  await upsertRows('offline_appointments', rows, (record, row) => {
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
  await markMissingAsDeleted(ENTITY_APPOINTMENTS, 'offline_appointments', userId);
}

async function pullCustomers(userId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_CUSTOMERS);
  let query = supabase
    .from('customers')
    .select('id,name,email,phone,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] customers pull failed: ${response.error.message}`);

  const rows = response.data ?? [];
  await upsertRows('offline_customers', rows, (record, row) => {
    writeRaw(record, { name: row.name, email: row.email, phone: row.phone });
  });

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_CUSTOMERS, nextCursor);
  await markMissingAsDeleted(ENTITY_CUSTOMERS, 'offline_customers', userId);
}

async function pullVehicles(userId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_VEHICLES);
  let query = supabase
    .from('vehicles')
    .select('id,customer_id,make,model,year,vin,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] vehicles pull failed: ${response.error.message}`);

  const rows = response.data ?? [];
  await upsertRows('offline_vehicles', rows, (record, row) => {
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
  await markMissingAsDeleted(ENTITY_VEHICLES, 'offline_vehicles', userId);
}

async function pullFleetWorkOrders(userId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_FLEET_WORK_ORDERS);
  let query = supabase
    .from('fleet_work_orders')
    .select('id,order_number,status,priority,scheduled_date,service_type,po_number,total,fleet_vehicle_id,fleet_client_id,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] fleet work order pull failed: ${response.error.message}`);

  const rows = response.data ?? [];
  await upsertRows('offline_fleet_work_orders', rows, (record, row) => {
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
  await markMissingAsDeleted(ENTITY_FLEET_WORK_ORDERS, 'offline_fleet_work_orders', userId);
}

async function pullServiceCatalog(userId: string): Promise<void> {
  const cursor = await getCursor(ENTITY_SERVICE_CATALOG);
  let query = supabase
    .from('service_catalog')
    .select('id,name,category,default_price,is_active,sort_order,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] service catalog pull failed: ${response.error.message}`);

  const rows = response.data ?? [];
  await upsertRows('offline_service_catalog', rows, (record, row) => {
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
  await markMissingAsDeleted(ENTITY_SERVICE_CATALOG, 'offline_service_catalog', userId);
}

async function pullTechnicianMessages(userId: string): Promise<void> {
  const technicianId = await getCurrentTechnicianId(userId);
  if (!technicianId) {
    return;
  }

  const cursor = await getCursor(ENTITY_TECH_MESSAGES);
  let query = supabase
    .from('appointments')
    .select('id,dispatch_notes,updated_at')
    .eq('assigned_technician_id', technicianId)
    .not('dispatch_notes', 'is', null)
    .order('updated_at', { ascending: true });

  if (cursor) query = query.gt('updated_at', cursor);

  const response = await query;
  if (response.error) throw new Error(`[offline] technician message pull failed: ${response.error.message}`);

  const rows = (response.data ?? []).map((row) => ({
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

  const nextCursor = getLatestCursor(rows, cursor);
  if (nextCursor) await setCursor(ENTITY_TECH_MESSAGES, nextCursor);

  const activeIds = new Set<string>(rows.map((row) => String(row.id)));
  await markMissingAsDeletedFromIdList('offline_technician_messages', activeIds);
}

export async function runOfflinePullSync(): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  if (!isOfflineEligibleForUser(userId)) {
    return;
  }

  await pullAppointments(userId);
  await pullCustomers(userId);
  await pullVehicles(userId);
  await pullFleetWorkOrders(userId);
  await pullServiceCatalog(userId);
  await pullTechnicianMessages(userId);
  await emitOfflineObservability('pull_sync');
}
