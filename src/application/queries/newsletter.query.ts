/**
 * Newsletter Sequence Queries — Read operations for newsletter sequences and templates.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NewsletterSequenceRow {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  start_date: string;
}

export interface NewsletterTemplateRow {
  id?: string;
  month_number: number;
  subject: string;
  preview_text: string;
  content: string;
  holiday_theme: string;
  seasonal_theme: string;
  is_active: boolean;
}

export async function fetchNewsletterSequences(userId: string): Promise<NewsletterSequenceRow[]> {
  const { data, error } = await supabase
    .from("newsletter_sequences")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchNewsletterTemplates(sequenceId: string): Promise<NewsletterTemplateRow[]> {
  const { data, error } = await supabase
    .from("newsletter_templates")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("month_number");
  if (error) throw error;
  return data || [];
}

export async function fetchSubscriberCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return count || 0;
}
