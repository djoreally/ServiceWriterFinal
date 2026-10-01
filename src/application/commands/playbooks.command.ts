/**
 * Service Playbooks Commands — CRUD for checklist templates tied to catalog items.
 *
 * Steps format: [{ name: string, requires_photo?: boolean, description?: string }]
 */

import { apiClient } from "@/lib/api-client";

// ============= Types =============

export interface PlaybookStep {
  name: string;
  requires_photo?: boolean;
  description?: string;
}

export interface PlaybookPayload {
  serviceCatalogId?: string | null;
  name: string;
  description?: string | null;
  steps: PlaybookStep[];
  isActive?: boolean;
}

// ============= Commands =============

/** Create a new service playbook. */
export async function createPlaybook(userId: string, payload: PlaybookPayload) {
  const row = {
    service_catalog_id: payload.serviceCatalogId ?? null,
    name: payload.name,
    description: payload.description ?? null,
    steps: JSON.parse(JSON.stringify(payload.steps)),
    is_active: payload.isActive ?? true,
  };

  const { data } = await apiClient.post<{ data: string }>("/v1/platform/playbooks", {
    user_id: userId,
    row,
  });
  return data;
}

/** Update an existing playbook. */
export async function updatePlaybook(
  playbookId: string,
  payload: Partial<PlaybookPayload>
) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.steps !== undefined) updates.steps = payload.steps;
  if (payload.isActive !== undefined) updates.is_active = payload.isActive;
  if (payload.serviceCatalogId !== undefined)
    updates.service_catalog_id = payload.serviceCatalogId;

  await apiClient.patch(`/v1/platform/playbooks/${encodeURIComponent(playbookId)}`, {
    updates,
  });
}

/** Delete a playbook. */
export async function deletePlaybook(playbookId: string) {
  await apiClient.delete(`/v1/platform/playbooks/${encodeURIComponent(playbookId)}`);
}

/** Toggle playbook active state. */
export async function togglePlaybookActive(playbookId: string, isActive: boolean) {
  await apiClient.patch(`/v1/platform/playbooks/${encodeURIComponent(playbookId)}`, {
    updates: { is_active: isActive, updated_at: new Date().toISOString() },
  });
}

/** Fetch all playbooks for a user (query co-located here for simplicity). */
export async function fetchPlaybooks(userId: string) {
  const { data, error } = await apiClient.get<{ data: unknown[]; error: unknown }>(
    "/v1/platform/playbooks",
    { query: { user_id: userId } },
  );
  return { data, error };
}
