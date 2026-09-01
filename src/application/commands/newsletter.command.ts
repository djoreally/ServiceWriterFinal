/** Newsletter Commands — workspace-scoped writes. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { NewsletterTemplateRow } from "@/application/queries/newsletter.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
const db = productionSupabase as any;

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

export async function createNewsletterSequence(
  _userId: string,
  name: string,
  description: string,
  defaultTemplates: Array<Omit<NewsletterTemplateRow, "id">>,
): Promise<string> {
  const { userId, workspaceId } = await requireContext();
  const { data: sequence, error: seqError } = await db.from("newsletter_sequences").insert({
    workspace_id: workspaceId,
    user_id: userId,
    name,
    description,
    is_active: true,
    start_date: new Date().toISOString().split("T")[0],
  }).select("id").single();
  if (seqError) throw seqError;

  if (defaultTemplates.length) {
    const { error: templateError } = await db.from("newsletter_templates").insert(defaultTemplates.map((template) => ({
      ...template,
      workspace_id: workspaceId,
      user_id: userId,
      sequence_id: sequence.id,
    })));
    if (templateError) throw templateError;
  }
  return sequence.id;
}

export async function toggleNewsletterTemplateActive(templateId: string, isActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("newsletter_templates").update({ is_active: isActive }).eq("workspace_id", workspaceId).eq("id", templateId);
  if (error) throw error;
}

export async function saveNewsletterTemplate(templateId: string, updates: {
  subject: string; preview_text: string; content: string; holiday_theme: string; seasonal_theme: string;
}): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("newsletter_templates").update(updates).eq("workspace_id", workspaceId).eq("id", templateId);
  if (error) throw error;
}
