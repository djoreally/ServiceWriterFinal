/**
 * Adopting library templates into a shop's own service catalog.
 *
 * The template carries its own behavior (vertical, pricing mode, tire intent,
 * fitment/inventory flags) so the adopted row is fully wired the moment it
 * lands — the tire and detailing pricing screens pick it up with no extra step.
 */
import { supabase } from "@/integrations/supabase/client";
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";
import type { ServiceTemplate } from "@/application/queries/service-templates.query";

export interface TemplateAdoption {
  template: ServiceTemplate;
  /** Price the shop set in the library dialog; falls back to the suggested price. */
  price?: number;
}

export async function adoptServiceTemplates(adoptions: TemplateAdoption[]): Promise<number> {
  if (adoptions.length === 0) return 0;
  const ownerUserId = await requireWorkspaceOwnerUserId();

  const rows = adoptions.map(({ template, price }) => ({
    user_id: ownerUserId,
    template_id: template.id,
    name: template.name,
    description: template.description,
    category: template.categoryId,
    category_id: template.categoryId,
    default_price: Number.isFinite(price as number) ? Number(price) : template.defaultPrice,
    labor_rate: template.laborRate,
    estimated_duration: template.durationMinutes,
    skill_level: template.skillLevel,
    notes: template.notes,
    is_active: true,
    is_upsell: template.isUpsell,
    service_vertical: template.serviceVertical,
    pricing_mode: template.pricingMode,
    service_intent: template.serviceIntent,
    requires_tire_quantity: template.requiresTireQuantity,
    requires_fitment_lookup: template.requiresFitmentLookup,
    requires_inventory_selection: template.requiresInventorySelection,
    allows_manual_fitment: template.allowsManualFitment,
    sort_order: template.sortOrder,
  }));

  const { error } = await (supabase as unknown as {
    from: (table: string) => { insert: (values: unknown[]) => Promise<{ error: unknown }> };
  }).from("service_catalog").insert(rows);

  if (error) throw error;
  return rows.length;
}
