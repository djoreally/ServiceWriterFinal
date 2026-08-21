/**
 * Service Playbooks Commands — CRUD for checklist templates tied to catalog items.
 *
 * Steps format: [{ name: string, requires_photo?: boolean, description?: string }]
 */

import { supabase } from "@/integrations/supabase/client";

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
    user_id: userId,
    service_catalog_id: payload.serviceCatalogId ?? null,
    name: payload.name,
    description: payload.description ?? null,
    steps: JSON.parse(JSON.stringify(payload.steps)),
    is_active: payload.isActive ?? true,
  };

  const { data, error } = await supabase
    .from("service_playbooks")
    .insert(row)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create playbook: ${error.message}`);
  return data.id;
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

  const { error } = await supabase
    .from("service_playbooks")
    .update(updates as never)
    .eq("id", playbookId);

  if (error) throw new Error(`Failed to update playbook: ${error.message}`);
}

/** Delete a playbook. */
export async function deletePlaybook(playbookId: string) {
  const { error } = await supabase
    .from("service_playbooks")
    .delete()
    .eq("id", playbookId);

  if (error) throw new Error(`Failed to delete playbook: ${error.message}`);
}

/** Toggle playbook active state. */
export async function togglePlaybookActive(playbookId: string, isActive: boolean) {
  const { error } = await supabase
    .from("service_playbooks")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", playbookId);

  if (error) throw new Error(`Failed to toggle playbook: ${error.message}`);
}

/** Fetch all playbooks for a user (query co-located here for simplicity). */
export async function fetchPlaybooks(userId: string) {
  return supabase
    .from("service_playbooks")
    .select("*, service_catalog(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}
