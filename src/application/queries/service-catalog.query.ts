/** Service Catalog Query — canonical workspace adapter. */
import { productionSupabase } from '@/integrations/supabase/client';
import { getOfflineDatabase } from '@/offline/database';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface CatalogItem {
  id: string; name: string; description: string | null; category: string | null; category_id: string | null; default_price: number;
  labor_rate: number | null; estimated_duration: number | null; skill_level: string | null; parts_required: string | null; notes: string | null;
  is_active: boolean; is_upsell: boolean; requires_tire_quantity: boolean; service_vertical: "general" | "detailing" | "tires";
  pricing_mode: "flat" | "labor_parts" | "detailing_assessment" | "tire_inventory" | "quote_required";
  service_intent: "replacement" | "rotation" | "repair" | "balance" | "tpms" | "alignment" | "wheel_service" | null;
  requires_fitment_lookup: boolean; requires_inventory_selection: boolean; allows_manual_fitment: boolean; configuration_schema_version: number;
  created_at: string; template_id: string | null; sort_order: number;
}
export interface ServiceCategory { id: string; name: string; }
type CatalogBehavior = Pick<CatalogItem, "requires_tire_quantity" | "service_vertical" | "pricing_mode" | "service_intent" | "requires_fitment_lookup" | "requires_inventory_selection" | "allows_manual_fitment" | "configuration_schema_version">;
const isPricingMode = (value: unknown): value is CatalogItem["pricing_mode"] => ["flat", "labor_parts", "detailing_assessment", "tire_inventory", "quote_required"].includes(value as string);
const isServiceIntent = (value: unknown): value is NonNullable<CatalogItem["service_intent"]> => ["replacement", "rotation", "repair", "balance", "tpms", "alignment", "wheel_service"].includes(value as string);
function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizeCatalogBehavior(row: Record<string, unknown>): CatalogBehavior {
  const vertical = row.service_vertical === "tires" || row.service_vertical === "detailing" ? row.service_vertical : "general";
  return {
    requires_tire_quantity: Boolean(row.requires_tire_quantity), service_vertical: vertical,
    pricing_mode: isPricingMode(row.pricing_mode) ? row.pricing_mode : (vertical === "detailing" ? "detailing_assessment" : vertical === "tires" && row.requires_tire_quantity ? "tire_inventory" : "flat"),
    service_intent: isServiceIntent(row.service_intent) ? row.service_intent : (vertical === "tires" ? "replacement" : null),
    requires_fitment_lookup: Boolean(row.requires_fitment_lookup ?? vertical === "tires"), requires_inventory_selection: Boolean(row.requires_inventory_selection ?? row.requires_tire_quantity),
    allows_manual_fitment: Boolean(row.allows_manual_fitment ?? vertical === "tires"), configuration_schema_version: Number(row.configuration_schema_version || 1),
  };
}
function mapCatalogRow(row: Record<string, any>): CatalogItem {
  const metadata = metadataObject(row.metadata); const category = typeof row.category === "string" ? row.category : null;
  const categoryId = typeof metadata.category_id === "string" && metadata.category_id ? metadata.category_id : (category || "service").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return {
    id: String(row.id), name: String(row.name || "Service"), description: row.description ?? null, category, category_id: categoryId || null,
    default_price: Number(row.labor_price ?? 0), labor_rate: metadata.labor_rate == null ? null : Number(metadata.labor_rate),
    estimated_duration: row.estimated_minutes == null ? null : Number(row.estimated_minutes), skill_level: typeof metadata.skill_level === "string" ? metadata.skill_level : null,
    parts_required: typeof metadata.parts_required === "string" ? metadata.parts_required : null, notes: typeof metadata.notes === "string" ? metadata.notes : null,
    is_active: row.is_active !== false, is_upsell: metadata.is_upsell === true, created_at: String(row.created_at || new Date().toISOString()),
    template_id: typeof metadata.template_id === "string" ? metadata.template_id : null, sort_order: Number(metadata.sort_order ?? 0), ...normalizeCatalogBehavior(metadata),
  };
}
async function fetchCatalogItemsFromOffline(): Promise<CatalogItem[]> {
  const database = getOfflineDatabase(); if (!database) return [];
  const rows = await database.get('offline_service_catalog').query().fetch();
  return rows.map((row: { _raw: Record<string, unknown> }) => ({
    id: String(row._raw.server_id || ""), name: String(row._raw.name || "Service"), description: null,
    category: typeof row._raw.category === "string" ? row._raw.category : null, category_id: null,
    default_price: Number(row._raw.default_price || 0), labor_rate: null, estimated_duration: null, skill_level: null, parts_required: null, notes: null,
    is_active: Boolean(row._raw.is_active), is_upsell: false, created_at: new Date(String(row._raw.updated_at_local || new Date().toISOString())).toISOString(),
    template_id: null, sort_order: Number(row._raw.sort_order || 0), ...normalizeCatalogBehavior(row._raw),
  })).filter((row) => !!row.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const { data: { user } } = await getCurrentAuthUser(); if (!user) return [];
  const context = await resolveCurrentWorkspace(); if (!context) return [];
  const { data, error } = await db.from('service_catalog').select('id,workspace_id,name,description,category,estimated_minutes,labor_price,is_active,created_at,metadata').eq('workspace_id', context.workspaceId).order('name');
  if (error) { if (await isOfflineEligibleForCurrentUser()) return fetchCatalogItemsFromOffline(); throw error; }
  return (data ?? []).map((row: any) => mapCatalogRow(row)).sort((a: CatalogItem, b: CatalogItem) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const context = await resolveCurrentWorkspace(); if (!context) return [];
  const { data, error } = await db.from('service_catalog').select('category').eq('workspace_id', context.workspaceId); if (error) throw error;
  const names = [...new Set((data ?? []).map((row: any) => row.category).filter((value: unknown): value is string => typeof value === "string" && Boolean(value)))].sort();
  return names.map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), name }));
}
