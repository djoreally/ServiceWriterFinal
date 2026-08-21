/**
 * Service Library — the shared, pre-seeded template catalog every shop can
 * adopt services from. Reference data (public read), never tenant-scoped.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ServiceTemplate {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  defaultPrice: number;
  laborRate: number | null;
  durationMinutes: number | null;
  skillLevel: string | null;
  notes: string | null;
  serviceVertical: "general" | "detailing" | "tires";
  pricingMode: "flat" | "labor_parts" | "detailing_assessment" | "tire_inventory" | "quote_required";
  serviceIntent: string | null;
  requiresTireQuantity: boolean;
  requiresFitmentLookup: boolean;
  requiresInventorySelection: boolean;
  allowsManualFitment: boolean;
  isUpsell: boolean;
  sortOrder: number;
}

export interface TemplateCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

const client = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => { order: (column: string, opts?: { ascending?: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
      order: (column: string, opts?: { ascending?: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
  };
};

function mapTemplate(row: Record<string, unknown>): ServiceTemplate {
  const vertical = row.service_vertical === "detailing" || row.service_vertical === "tires" ? row.service_vertical : "general";
  return {
    id: String(row.id),
    name: String(row.name),
    categoryId: (row.category_id as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    defaultPrice: Number(row.default_price ?? 0),
    laborRate: row.labor_rate === null || row.labor_rate === undefined ? null : Number(row.labor_rate),
    durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    skillLevel: (row.skill_level as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    serviceVertical: vertical,
    pricingMode: (row.pricing_mode as ServiceTemplate["pricingMode"]) ?? "flat",
    serviceIntent: (row.service_intent as string | null) ?? null,
    requiresTireQuantity: Boolean(row.requires_tire_quantity),
    requiresFitmentLookup: Boolean(row.requires_fitment_lookup),
    requiresInventorySelection: Boolean(row.requires_inventory_selection),
    allowsManualFitment: Boolean(row.allows_manual_fitment),
    isUpsell: Boolean(row.is_upsell),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

/** Every active template in the shared library. */
export async function fetchServiceTemplates(): Promise<ServiceTemplate[]> {
  const { data, error } = await client.from("service_templates").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map(mapTemplate).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Categories with their hierarchy, used to group the library. */
export async function fetchTemplateCategories(): Promise<TemplateCategory[]> {
  const { data, error } = await client.from("service_categories").select("id, name, parent_id, sort_order").order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    parentId: (row.parent_id as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}
