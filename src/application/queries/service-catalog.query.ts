/**
 * Service Catalog Query - Read operations for the service catalog page
 *
 * Replaces direct supabase.from() calls in ServiceCatalog.tsx
 */

import { supabase } from '@/integrations/supabase/client';
import { getOfflineDatabase } from '@/offline/database';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  category_id: string | null;
  default_price: number;
  labor_rate: number | null;
  estimated_duration: number | null;
  skill_level: string | null;
  parts_required: string | null;
  notes: string | null;
  is_active: boolean;
  is_upsell: boolean;
  requires_tire_quantity: boolean;
  service_vertical: "general" | "detailing" | "tires";
  pricing_mode: "flat" | "labor_parts" | "detailing_assessment" | "tire_inventory" | "quote_required";
  service_intent: "replacement" | "rotation" | "repair" | "balance" | "tpms" | "alignment" | "wheel_service" | null;
  requires_fitment_lookup: boolean;
  requires_inventory_selection: boolean;
  allows_manual_fitment: boolean;
  configuration_schema_version: number;
  created_at: string;
  template_id: string | null;
  sort_order: number;
}

export interface ServiceCategory {
  id: string;
  name: string;
}

type CatalogBehavior = Pick<CatalogItem, "requires_tire_quantity" | "service_vertical" | "pricing_mode" | "service_intent" | "requires_fitment_lookup" | "requires_inventory_selection" | "allows_manual_fitment" | "configuration_schema_version">;

const isPricingMode = (value: unknown): value is CatalogItem["pricing_mode"] => ["flat", "labor_parts", "detailing_assessment", "tire_inventory", "quote_required"].includes(value as string);
const isServiceIntent = (value: unknown): value is NonNullable<CatalogItem["service_intent"]> => ["replacement", "rotation", "repair", "balance", "tpms", "alignment", "wheel_service"].includes(value as string);

function normalizeCatalogBehavior(row: Record<string, unknown>): CatalogBehavior {
  const vertical = row.service_vertical === "tires" || row.service_vertical === "detailing" ? row.service_vertical : "general";
  return {
    requires_tire_quantity: Boolean(row.requires_tire_quantity),
    service_vertical: vertical,
    pricing_mode: isPricingMode(row.pricing_mode) ? row.pricing_mode : (vertical === "detailing" ? "detailing_assessment" : vertical === "tires" && row.requires_tire_quantity ? "tire_inventory" : "flat"),
    service_intent: isServiceIntent(row.service_intent) ? row.service_intent : (vertical === "tires" ? "replacement" : null),
    requires_fitment_lookup: Boolean(row.requires_fitment_lookup ?? vertical === "tires"),
    requires_inventory_selection: Boolean(row.requires_inventory_selection ?? row.requires_tire_quantity),
    allows_manual_fitment: Boolean(row.allows_manual_fitment ?? vertical === "tires"),
    configuration_schema_version: Number(row.configuration_schema_version || 1),
  };
}

async function fetchCatalogItemsFromOffline(): Promise<CatalogItem[]> {
  const database = getOfflineDatabase();
  if (!database) return [];

  const rows = await database.get('offline_service_catalog').query().fetch();

  return rows
    .map((row: { _raw: Record<string, unknown> }) => ({
      id: String(row._raw.server_id || ""),
      name: String(row._raw.name || "Service"),
      description: null as string | null,
      category: typeof row._raw.category === "string" ? row._raw.category : null,
      category_id: null as string | null,
      default_price: Number(row._raw.default_price || 0),
      labor_rate: null as number | null,
      estimated_duration: null as number | null,
      skill_level: null as string | null,
      parts_required: null as string | null,
      notes: null as string | null,
      is_active: Boolean(row._raw.is_active),
      is_upsell: false,
      created_at: new Date(String(row._raw.updated_at_local || new Date().toISOString())).toISOString(),
      template_id: null as string | null,
      sort_order: Number(row._raw.sort_order || 0),
      ...normalizeCatalogBehavior(row._raw as Record<string, unknown>),
    }))
    .filter((row) => !!row.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/** Fetch all catalog items for the authenticated user, ordered by sort_order */
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name');

  if (error) {
    if (await isOfflineEligibleForCurrentUser()) {
      return fetchCatalogItemsFromOffline();
    }
    throw error;
  }

  return (data ?? []).map((row) => ({ ...row, ...normalizeCatalogBehavior(row as unknown as Record<string, unknown>) })) as unknown as CatalogItem[];
}

/** Fetch all service categories */
export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('id, name')
    .order('sort_order');

  if (error) throw error;
  return (data ?? []) as ServiceCategory[];
}
