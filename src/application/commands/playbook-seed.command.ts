/**
 * Playbook Seeding Command — Populates a user's service playbooks from system templates.
 * Similar pattern to populate_user_service_catalog.
 */

import { apiClient } from "@/lib/api-client";

/**
 * Seed playbooks for a user from the global service_playbook_templates table.
 * Matches templates to the user's catalog items by category.
 * Skips playbooks the user already has for a given catalog item.
 */
export async function seedPlaybooksFromTemplates(userId: string): Promise<number> {
  const { data } = await apiClient.post<{ data: number }>("/v1/platform/playbooks/seed", {
    user_id: userId,
  });
  return Number(data ?? 0);
}
