/**
 * Service Catalog Commands - Write operations for the service catalog
 *
 * Replaces direct supabase.from() calls in ServiceCatalog.tsx
 */

import { supabase } from '@/integrations/supabase/client';
import { enqueueServiceCatalogEdit, processOfflineOutbox } from '@/offline/outbox';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';
import { requireWorkspaceOwnerUserId } from '@/application/tenant-workspace';
import { invalidateCatalogItems } from '@/application/queries/service-catalog.query';

export interface CatalogItemWritePayload {
  name: string;
  description?: string | null;
  category?: string | null;
  category_id?: string | null;
  default_price: number;
  labor_rate?: number | null;
  estimated_duration?: number | null;
  skill_level?: string | null;
  parts_required?: string | null;
  notes?: string | null;
  is_active: boolean;
  is_upsell: boolean;
}

async function tryQueueOffline(
  payload: Parameters<typeof enqueueServiceCatalogEdit>[0]
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) return false;

  const queued = await enqueueServiceCatalogEdit(payload);
  if (!queued) return false;

  await processOfflineOutbox();
  invalidateCatalogItems();
  return true;
}

export async function createCatalogItem(payload: CatalogItemWritePayload): Promise<void> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  if (await tryQueueOffline({ action: 'create', data: { ...payload, user_id: ownerUserId } })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').insert([{ ...payload, user_id: ownerUserId }]);
  if (error) throw error;
  invalidateCatalogItems();
}

export async function updateCatalogItem(
  id: string,
  payload: Partial<CatalogItemWritePayload>
): Promise<void> {
  if (await tryQueueOffline({ action: 'update', itemId: id, data: payload })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').update(payload).eq('id', id);
  if (error) throw error;
  invalidateCatalogItems();
}

export async function deleteCatalogItem(id: string): Promise<void> {
  if (await tryQueueOffline({ action: 'delete', itemId: id })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').delete().eq('id', id);
  if (error) throw error;
  invalidateCatalogItems();
}

export async function toggleCatalogItemActive(id: string, currentActive: boolean): Promise<void> {
  await updateCatalogItem(id, { is_active: !currentActive });
}

export async function swapCatalogSortOrder(
  idA: string,
  sortOrderA: number,
  idB: string,
  sortOrderB: number
): Promise<void> {
  let nextA = sortOrderB;
  const nextB = sortOrderA;
  if (nextA === nextB) {
    nextA = nextB + 1;
  }

  const queuedA = await tryQueueOffline({ action: 'update', itemId: idA, data: { sort_order: nextA } });
  const queuedB = queuedA
    ? await tryQueueOffline({ action: 'update', itemId: idB, data: { sort_order: nextB } })
    : false;
  if (queuedA && queuedB) return;

  const res1 = await supabase.from('service_catalog').update({ sort_order: nextA }).eq('id', idA);
  if (res1.error) throw res1.error;
  const res2 = await supabase.from('service_catalog').update({ sort_order: nextB }).eq('id', idB);
  if (res2.error) throw res2.error;
  invalidateCatalogItems();
}
