/**
 * Service Catalog Commands - Write operations for the service catalog
 *
 * Replaces direct supabase.from() calls in ServiceCatalog.tsx
 */

import { supabase } from '@/integrations/supabase/client';
import { enqueueServiceCatalogEdit, processOfflineOutbox } from '@/offline/outbox';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';
import { requireWorkspaceOwnerUserId } from '@/application/tenant-workspace';

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

/**
 * Try to queue a catalog mutation offline.
 * Returns true only when the mutation was actually persisted to the outbox.
 * When the offline layer is unavailable (adapter disabled, SSR, not eligible) this
 * returns false so callers fail over to a direct backend write instead of silently
 * dropping the change — which previously made toggles look frozen.
 */
async function tryQueueOffline(
  payload: Parameters<typeof enqueueServiceCatalogEdit>[0]
): Promise<boolean> {
  if (!(await isOfflineEligibleForCurrentUser())) return false;

  const queued = await enqueueServiceCatalogEdit(payload);
  if (!queued) return false;

  await processOfflineOutbox();
  return true;
}

/** Create a new catalog item */
export async function createCatalogItem(payload: CatalogItemWritePayload): Promise<void> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  if (await tryQueueOffline({ action: 'create', data: { ...payload, user_id: ownerUserId } })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').insert([{ ...payload, user_id: ownerUserId }]);
  if (error) throw error;
}

/** Update an existing catalog item */
export async function updateCatalogItem(
  id: string,
  payload: Partial<CatalogItemWritePayload>
): Promise<void> {
  if (await tryQueueOffline({ action: 'update', itemId: id, data: payload })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').update(payload).eq('id', id);
  if (error) throw error;
}

/** Delete a catalog item */
export async function deleteCatalogItem(id: string): Promise<void> {
  if (await tryQueueOffline({ action: 'delete', itemId: id })) {
    return;
  }

  const { error } = await supabase.from('service_catalog').delete().eq('id', id);
  if (error) throw error;
}

/** Toggle active status of a catalog item */
export async function toggleCatalogItemActive(id: string, currentActive: boolean): Promise<void> {
  await updateCatalogItem(id, { is_active: !currentActive });
}

/**
 * Swap sort_order between two catalog items.
 * If both rows share the same sort_order (legacy data), assign distinct values
 * so the swap actually changes display order.
 * Updates run sequentially for deterministic ordering.
 */
export async function swapCatalogSortOrder(
  idA: string,
  sortOrderA: number,
  idB: string,
  sortOrderB: number
): Promise<void> {
  let nextA = sortOrderB;
  const nextB = sortOrderA;
  if (nextA === nextB) {
    // Both rows had identical sort_order — break the tie so order visibly changes.
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
}
