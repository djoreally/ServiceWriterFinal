/**
 * Inspections Commands - Write operations for inspection templates and items.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TemplatePayload {
  name: string;
  description: string | null;
  category: string;
}

export interface ItemPayload {
  name: string;
  description: string | null;
  category: string;
  is_required: boolean;
}

export async function createInspectionTemplate(payload: TemplatePayload): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");

  await apiClient.post("/v1/inspections/templates", payload);
}

export async function updateInspectionTemplate(
  id: string,
  payload: TemplatePayload
): Promise<void> {
  await apiClient.patch(`/v1/inspections/templates/${encodeURIComponent(id)}`, payload);
}

export async function deleteInspectionTemplate(id: string): Promise<void> {
  await apiClient.delete(`/v1/inspections/templates/${encodeURIComponent(id)}`);
}

export async function toggleInspectionTemplateActive(
  id: string,
  currentlyActive: boolean
): Promise<void> {
  await apiClient.patch(`/v1/inspections/templates/${encodeURIComponent(id)}`, {
    is_active: !currentlyActive,
  });
}

export async function addInspectionItem(
  templateId: string,
  payload: ItemPayload,
  sortOrder: number
): Promise<void> {
  await apiClient.post(`/v1/inspections/templates/${encodeURIComponent(templateId)}/items`, {
    ...payload,
    sort_order: sortOrder,
  });
}

export async function deleteInspectionItem(id: string): Promise<void> {
  await apiClient.delete(`/v1/inspections/items/${encodeURIComponent(id)}`);
}
