/** Copy selected starter-library services into the active workspace catalog. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { invalidateCatalogItems } from "@/application/queries/service-catalog.query";
import type { ServiceTemplate } from "@/application/queries/service-templates.query";

export interface TemplateAdoption {
  template: ServiceTemplate;
  price?: number;
}

export async function adoptServiceTemplates(adoptions: TemplateAdoption[]): Promise<number> {
  if (adoptions.length === 0) return 0;
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  const rows = adoptions.map(({ template, price }) => ({
    workspace_id: context.workspaceId,
    name: template.name,
    description: template.description,
    category: template.categoryId === "fleet_mobile" ? "Fleet / Mobile-Specific" : template.categoryId === "tire" ? "Tire" : template.categoryId === "detailing" ? "Detailing" : "Automotive",
    estimated_minutes: template.durationMinutes,
    labor_price: Number.isFinite(price as number) ? Number(price) : template.defaultPrice,
    is_active: true,
    metadata: {
      template_id: template.id,
      category_id: template.categoryId,
      suggested_price: template.suggestedPrice,
      duration_label: template.durationLabel,
      labor_rate: template.laborRate,
      skill_level: template.skillLevel,
      notes: template.notes,
      is_upsell: template.isUpsell,
      service_vertical: template.serviceVertical,
      pricing_mode: template.pricingMode,
      service_intent: template.serviceIntent,
      requires_tire_quantity: template.requiresTireQuantity,
      requires_fitment_lookup: template.requiresFitmentLookup,
      requires_inventory_selection: template.requiresInventorySelection,
      allows_manual_fitment: template.allowsManualFitment,
      configuration_schema_version: 1,
      sort_order: template.sortOrder,
    },
  }));

  const { error } = await (productionSupabase as any).from("service_catalog").insert(rows);
  if (error) throw error;
  invalidateCatalogItems(context.workspaceId);
  return rows.length;
}
