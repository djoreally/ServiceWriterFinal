import { Q } from '@nozbe/watermelondb';
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

  return ((rows[0] as any)._raw.cursor as string | null) ?? null;
}

async function setCursor(entity: PullEntity, cursor: string): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) return;

  const rows = await database.get('offline_sync_state').query(Q.where('entity', entity)).fetch();
  const now = Date.now();

  await database.write(async () => {
    if (rows.length > 0) {
      await rows[0].update((record: any) => {
        record._raw.cursor = cursor;
        record._raw.updated_at = now;
      });
      return;
    }

    await database.get('offline_sync_state').create((record: any) => {
      record._raw.entity = entity;
      record._raw.cursor = cursor;
      record._raw.updated_at = now;
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
    for (const row of localRows as any[]) {
      const serverId = row?._raw?.server_id;
      if (!serverId || activeIds.has(serverId)) {
        continue;
      }

      await row.update((record: any) => {
        record._raw.is_deleted = true;
        record._raw.sync_status = SYNCED;
        record._raw.updated_at_local = Date.now();
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

  const activeIds = new Set<string>((source.data ?? []).map((row: any) => String(row.id)));
  await markMissingAsDeletedFromIdList(tableName, activeIds);
}

function shouldAcceptServerRecord(localRaw: any, serverUpdatedAt?: number): boolean {
  if (!localRaw) {
    return true;
  }

  const localSyncStatus = localRaw.sync_status as string | undefined;
  const localUpdatedAt = Number(localRaw.updated_at_local ?? 0);
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
  project: (record: any, row: T, now: number) => void,
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
        const localRaw = (existing[0] as any)._raw;
        if (!shouldAcceptServerRecord(localRaw, serverUpdatedAt)) {
          protectedPendingSkipCount += 1;
          continue;
        }

        await existing[0].update((record: any) => {
          project(record, row, now);
          record._raw.updated_at_server = serverUpdatedAt;
          record._raw.updated_at_local = now;
          record._raw.sync_status = SYNCED;
          record._raw.is_deleted = false;
        });
      } else {
        await collection.create((record: any) => {
          record._raw.server_id = row.id;
          project(record, row, now);
          record._raw.updated_at_server = serverUpdatedAt;
          record._raw.updated_at_local = now;
          record._raw.sync_status = SYNCED;
          record._raw.is_deleted = false;
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
  await upsertRows('offline_appointments', rows, (record, row: any) => {
    record._raw.title = row.title;
    record._raw.status = row.status;
    record._raw.scheduled_date = row.scheduled_date;
    record._raw.scheduled_time = row.scheduled_time;
    record._raw.customer_server_id = row.customer_id;
    record._raw.vehicle_server_id = row.vehicle_id;
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
  await upsertRows('offline_customers', rows, (record, row: any) => {
    record._raw.name = row.name;
    record._raw.email = row.email;
    record._raw.phone = row.phone;
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
  await upsertRows('offline_vehicles', rows, (record, row: any) => {
    record._raw.customer_server_id = row.customer_id;
    record._raw.make = row.make;
    record._raw.model = row.model;
    record._raw.year = row.year;
    record._raw.vin = row.vin;
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
  await upsertRows('offline_fleet_work_orders', rows as SyncRow[], (record, row: any) => {
    record._raw.order_number = row.order_number;
    record._raw.status = row.status;
    record._raw.priority = row.priority;
    record._raw.scheduled_date = row.scheduled_date;
    record._raw.service_type = row.service_type;
    record._raw.po_number = row.po_number;
    record._raw.total = row.total;
    record._raw.vehicle_server_id = row.fleet_vehicle_id;
    record._raw.client_server_id = row.fleet_client_id;
  });

  const nextCursor = getLatestCursor(rows as SyncRow[], cursor);
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
  await upsertRows('offline_service_catalog', rows, (record, row: any) => {
    record._raw.name = row.name;
    record._raw.category = row.category;
    record._raw.default_price = row.default_price;
    record._raw.is_active = row.is_active;
    record._raw.sort_order = row.sort_order;
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

  const rows = (response.data ?? []).map((row: any) => ({
    id: row.id,
    appointment_id: row.id,
    dispatch_notes: row.dispatch_notes,
    updated_at: row.updated_at,
  }));

  await upsertRows('offline_technician_messages', rows as any[], (record, row: any) => {
    const body = row.dispatch_notes || '';
    const type = body.toLowerCase().includes('urgent') ? 'urgent' : 'dispatch';
    record._raw.appointment_server_id = row.appointment_id;
    record._raw.message_type = type;
    record._raw.title = 'Dispatch Note';
    record._raw.body = body;
    const stamp = toEpoch(row.updated_at);
    record._raw.created_at_server = stamp;
  });

  const nextCursor = getLatestCursor(rows as any[], cursor);
  if (nextCursor) await setCursor(ENTITY_TECH_MESSAGES, nextCursor);

  const activeIds = new Set<string>(rows.map((row: any) => String(row.id)));
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
