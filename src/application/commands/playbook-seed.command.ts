/**
 * Playbook Seeding Command — Populates a user's service playbooks from system templates.
 * Similar pattern to populate_user_service_catalog.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Seed playbooks for a user from the global service_playbook_templates table.
 * Matches templates to the user's catalog items by category.
 * Skips playbooks the user already has for a given catalog item.
 */
export async function seedPlaybooksFromTemplates(userId: string): Promise<number> {
  // 1. Fetch global templates
  const { data: templates } = await supabase
    .from("service_playbook_templates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!templates?.length) return 0;

  // 2. Fetch user's catalog items (to match by category)
  const { data: catalogItems } = await supabase
    .from("service_catalog")
    .select("id, name, category")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!catalogItems?.length) return 0;

  // 3. Fetch existing playbooks to avoid duplicates
  const { data: existing } = await supabase
    .from("service_playbooks")
    .select("name, service_catalog_id")
    .eq("user_id", userId);

  const existingSet = new Set(
    (existing ?? []).map((p) => `${p.name}::${p.service_catalog_id}`)
  );

  // 4. Category mapping: template category → catalog items
  const categoryMap: Record<string, string> = {
    oil_service: "oil",
    tire_service: "tire",
    battery_service: "battery",
    brake_service: "brake",
    inspection: "inspection",
  };

  let inserted = 0;
  const toInsert: Array<{
    user_id: string;
    service_catalog_id: string | null;
    name: string;
    description: string | null;
    steps: Json;
    is_active: boolean;
  }> = [];

  for (const template of templates) {
    const keyword = categoryMap[template.service_category] ?? template.service_category;

    // Find matching catalog items by category or name keyword
    const matches = catalogItems.filter(
      (c) =>
        c.category?.toLowerCase().includes(keyword) ||
        c.name?.toLowerCase().includes(keyword)
    );

    if (matches.length === 0) {
      // Create unlinked playbook
      const key = `${template.name}::null`;
      if (!existingSet.has(key)) {
        toInsert.push({
          user_id: userId,
          service_catalog_id: null,
          name: template.name,
          description: template.description,
          steps: template.steps as Json,
          is_active: true,
        });
        existingSet.add(key);
      }
    } else {
      // Create one playbook per matching catalog item
      for (const match of matches) {
        const key = `${template.name}::${match.id}`;
        if (!existingSet.has(key)) {
          toInsert.push({
            user_id: userId,
            service_catalog_id: match.id,
            name: template.name,
            description: template.description,
            steps: template.steps as Json,
            is_active: true,
          });
          existingSet.add(key);
        }
      }
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("service_playbooks").insert(toInsert);
    if (error) throw new Error(`Failed to seed playbooks: ${error.message}`);
    inserted = toInsert.length;
  }

  return inserted;
}
