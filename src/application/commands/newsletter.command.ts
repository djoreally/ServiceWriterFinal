/**
 * Newsletter Commands — Write operations for newsletter sequences and templates.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NewsletterTemplateRow } from "@/application/queries/newsletter.query";

export async function createNewsletterSequence(
  userId: string,
  name: string,
  description: string,
  defaultTemplates: Array<Omit<NewsletterTemplateRow, "id">>
): Promise<string> {
  const { data: sequence, error: seqError } = await supabase
    .from("newsletter_sequences")
    .insert({
      user_id: userId,
      name,
      description,
      is_active: true,
      start_date: new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (seqError) throw seqError;

  const templatesWithSequence = defaultTemplates.map((template) => ({
    ...template,
    user_id: userId,
    sequence_id: sequence.id,
  }));

  const { error: templateError } = await supabase
    .from("newsletter_templates")
    .insert(templatesWithSequence);
  if (templateError) throw templateError;

  return sequence.id;
}

export async function toggleNewsletterTemplateActive(templateId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("newsletter_templates")
    .update({ is_active: isActive })
    .eq("id", templateId);
  if (error) throw error;
}

export async function saveNewsletterTemplate(templateId: string, updates: {
  subject: string;
  preview_text: string;
  content: string;
  holiday_theme: string;
  seasonal_theme: string;
}): Promise<void> {
  const { error } = await supabase
    .from("newsletter_templates")
    .update(updates)
    .eq("id", templateId);
  if (error) throw error;
}
