/**
 * Playbook Seeding Command — Populates a workspace's service playbooks from system templates.
 * Similar pattern to populate_user_service_catalog.
 */

import { apiClient } from "@/lib/api-client";

/**
 * Seed playbooks for a workspace from the global service_playbook_templates table.
 * Matches templates to the workspace's catalog items by category.
 * Skips playbooks the workspace already has for a given catalog item.
 */
export async function seedPlaybooksFromTemplates(workspaceId: string): Promise<number> {
  const { data } = await apiClient.post<{ data: number }>("/v1/platform/playbooks/seed", {
    workspace_id: workspaceId,
  });
  return Number(data ?? 0);
}
