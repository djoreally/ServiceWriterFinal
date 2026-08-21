/**
 * Inspections Commands - Write operations for inspection templates and items.
 */

import { supabase } from "@/integrations/supabase/client";

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

  const { error } = await supabase.from("inspection_templates").insert({
    user_id: user.id,
    ...payload,
  });
  if (error) throw error;
}

export async function updateInspectionTemplate(
  id: string,
  payload: TemplatePayload
): Promise<void> {
  const { error } = await supabase
    .from("inspection_templates")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteInspectionTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from("inspection_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function toggleInspectionTemplateActive(
  id: string,
  currentlyActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from("inspection_templates")
    .update({ is_active: !currentlyActive })
    .eq("id", id);
  if (error) throw error;
}

export async function addInspectionItem(
  templateId: string,
  payload: ItemPayload,
  sortOrder: number
): Promise<void> {
  const { error } = await supabase.from("inspection_items").insert({
    template_id: templateId,
    sort_order: sortOrder,
    ...payload,
  });
  if (error) throw error;
}

export async function deleteInspectionItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("inspection_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
