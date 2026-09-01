/** Newsletter Sequence Queries — workspace-scoped reads. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface NewsletterSequenceRow { id: string; name: string; description: string; is_active: boolean; start_date: string; }
export interface NewsletterTemplateRow { id?: string; month_number: number; subject: string; preview_text: string; content: string; holiday_theme: string; seasonal_theme: string; is_active: boolean; }

export async function fetchNewsletterSequences(_userId: string): Promise<NewsletterSequenceRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await db.from("newsletter_sequences").select("*").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNewsletterTemplates(sequenceId: string): Promise<NewsletterTemplateRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await db.from("newsletter_templates").select("*").eq("workspace_id", context.workspaceId).eq("sequence_id", sequenceId).order("month_number");
  if (error) throw error;
  return data ?? [];
}

export async function fetchSubscriberCount(_userId: string): Promise<number> {
  const context = await resolveCurrentWorkspace();
  if (!context) return 0;
  const { count, error } = await db.from("newsletter_subscribers").select("*", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}
