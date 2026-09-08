/** Service Catalog Commands — canonical workspace-scoped writes. */
import { productionSupabase } from '@/integrations/supabase/client';
import { resolveCurrentWorkspace } from '@/application/queries/settings.query';
import { getCurrentAuthUser } from '@/lib/auth/current-user';
import { invalidateCatalogItems } from '@/application/queries/service-catalog.query';

const db = productionSupabase as any;

export interface CatalogItemWritePayload {
  name: string;
  description?: string | null;
  category?: string | null;
  category_id?: string | null;
  default_price?: number;
  labor_rate?: number | null;
  estimated_duration?: number | null;
  skill_level?: string | null;
  parts_required?: string | null;
  notes?: string | null;
  is_active?: boolean;
  is_upsell?: boolean;
  service_vertical?: string;
  pricing_mode?: string;
  service_intent?: string | null;
  requires_fitment_lookup?: boolean;
  requires_inventory_selection?: boolean;
  allows_manual_fitment?: boolean;
  sort_order?: number;
}

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error('No active workspace is available.');
  return { workspaceId: workspace.workspaceId };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataPatch(payload: Partial<CatalogItemWritePayload>, current: Record<string, unknown> = {}) {
  const metadata = { ...current };
  const pairs: Array<[keyof CatalogItemWritePayload, string]> = [
    ['category_id', 'category_id'], ['labor_rate', 'labor_rate'], ['skill_level', 'skill_level'],
    ['parts_required', 'parts_required'], ['notes', 'notes'], ['is_upsell', 'is_upsell'],
    ['service_vertical', 'service_vertical'], ['pricing_mode', 'pricing_mode'], ['service_intent', 'service_intent'],
    ['requires_fitment_lookup', 'requires_fitment_lookup'], ['requires_inventory_selection', 'requires_inventory_selection'],
    ['allows_manual_fitment', 'allows_manual_fitment'], ['sort_order', 'sort_order'],
  ];
  for (const [source, target] of pairs) {
    if (source in payload) metadata[target] = payload[source] ?? null;
  }
  return metadata;
}

function canonicalColumns(payload: Partial<CatalogItemWritePayload>, metadata: Record<string, unknown>) {
  const row: Record<string, unknown> = { metadata };
  if ('name' in payload) row.name = payload.name;
  if ('description' in payload) row.description = payload.description ?? null;
  if ('category' in payload) row.category = payload.category ?? null;
  if ('default_price' in payload) row.labor_price = payload.default_price ?? 0;
  if ('estimated_duration' in payload) row.estimated_minutes = payload.estimated_duration ?? null;
  if ('is_active' in payload) row.is_active = payload.is_active;
  row.updated_at = new Date().toISOString();
  return row;
}

export async function createCatalogItem(payload: CatalogItemWritePayload): Promise<void> {
  const { workspaceId } = await requireContext();
  const metadata = metadataPatch(payload);
  const row = { ...canonicalColumns(payload, metadata), workspace_id: workspaceId };
  const { error } = await db.from('service_catalog').insert(row);
  if (error) throw error;
  invalidateCatalogItems(workspaceId);
}

export async function updateCatalogItem(id: string, payload: Partial<CatalogItemWritePayload>): Promise<void> {
  const { workspaceId } = await requireContext();
  const current = await db.from('service_catalog').select('metadata').eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
  if (current.error) throw current.error;
  const metadata = metadataPatch(payload, object(current.data?.metadata));
  const { error } = await db.from('service_catalog').update(canonicalColumns(payload, metadata)).eq('workspace_id', workspaceId).eq('id', id);
  if (error) throw error;
  invalidateCatalogItems(workspaceId);
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from('service_catalog').delete().eq('workspace_id', workspaceId).eq('id', id);
  if (error) throw error;
  invalidateCatalogItems(workspaceId);
}

export async function toggleCatalogItemActive(id: string, currentActive: boolean): Promise<void> {
  await updateCatalogItem(id, { is_active: !currentActive });
}

export async function swapCatalogSortOrder(idA: string, sortOrderA: number, idB: string, sortOrderB: number): Promise<void> {
  await updateCatalogItem(idA, { sort_order: sortOrderB === sortOrderA ? sortOrderB + 1 : sortOrderB });
  await updateCatalogItem(idB, { sort_order: sortOrderA });
}
