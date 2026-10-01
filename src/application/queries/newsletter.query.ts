/** Newsletter Sequence Queries — workspace-scoped reads. */
import { apiClient } from "@/lib/api-client";

export interface NewsletterSequenceRow { id: string; name: string; description: string; is_active: boolean; start_date: string; }
export interface NewsletterTemplateRow { id?: string; month_number: number; subject: string; preview_text: string; content: string; holiday_theme: string; seasonal_theme: string; is_active: boolean; }

export async function fetchNewsletterSequences(_userId: string): Promise<NewsletterSequenceRow[]> {
  const { data } = await apiClient.get<{ data: NewsletterSequenceRow[] }>("/v1/newsletter/sequences");
  return data ?? [];
}

export async function fetchNewsletterTemplates(sequenceId: string): Promise<NewsletterTemplateRow[]> {
  const { data } = await apiClient.get<{ data: NewsletterTemplateRow[] }>("/v1/newsletter/templates", {
    query: { sequence_id: sequenceId },
  });
  return data ?? [];
}

export async function fetchSubscriberCount(_userId: string): Promise<number> {
  const { data } = await apiClient.get<{ data: { count: number } }>("/v1/newsletter/subscriber-count");
  return data.count ?? 0;
}
