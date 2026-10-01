/**
 * Marketing Commands - Write operations for testimonials and reviews.
 */

import { apiClient } from "@/lib/api-client";

export async function updateTestimonialStatus(
  id: string,
  status: "approved" | "rejected"
): Promise<void> {
  await apiClient.patch(`/v1/crm/marketing/testimonials/${id}`, { status });
}

export async function toggleTestimonialFeatured(
  id: string,
  currentlyFeatured: boolean
): Promise<void> {
  await apiClient.patch(`/v1/crm/marketing/testimonials/${id}/featured`, {
    featured: !currentlyFeatured,
  });
}

// ── Additional marketing commands ──────────────────────
export interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
}

export async function sendMarketingEmail(body: SendEmailBody): Promise<void> {
  await apiClient.post("/v1/crm/marketing/email/send", body);
}

export async function markAbandonedBookingRecoverySent(id: string) {
  const { data } = await apiClient.post<{ data: unknown }>(
    `/v1/crm/marketing/abandoned-bookings/${id}/recovery-sent`,
    {},
  );
  return { data, error: null };
}

export interface NewsletterSubscribeArgs {
  workspaceUserId: string;
  email: string;
  name?: string;
  source: string;
  segment?: string;
  utm?: Record<string, string>;
}

export interface NewsletterCampaignSummary {
  id: string;
  subject: string;
  segment: string;
  send_at: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  finished_at: string | null;
}

interface InvokeOkResult {
  ok?: boolean;
  error?: string;
}

export interface NewsletterSubscribeResult extends InvokeOkResult {
  subscriberId?: string;
  unsubscribeToken?: string;
}

export async function subscribeToNewsletter(args: NewsletterSubscribeArgs) {
  const { data } = await apiClient.post<{ data: NewsletterSubscribeResult | null }>(
    "/v1/crm/marketing/newsletter/subscribe",
    {
      workspaceUserId: args.workspaceUserId,
      email: args.email,
      name: args.name,
      source: args.source,
      segment: args.segment ?? "general",
      utm: args.utm ?? {},
    },
  );
  return { data, error: null as { message: string } | null };
}

export async function listScheduledNewsletterCampaigns() {
  const { data } = await apiClient.get<{ data: { campaigns?: NewsletterCampaignSummary[] } | null }>(
    "/v1/crm/marketing/newsletter/campaigns",
  );
  return { data, error: null as { message: string } | null };
}

export async function scheduleNewsletterCampaign(body: {
  subject: string;
  previewText: string | null;
  html: string;
  segment: string;
  sendAt: string;
}) {
  const { data } = await apiClient.post<{ data: InvokeOkResult | null }>(
    "/v1/crm/marketing/newsletter/campaigns",
    body,
  );
  return { data, error: null as { message: string } | null };
}

export async function cancelScheduledNewsletterCampaign(id: string) {
  const { data } = await apiClient.delete<{ data: unknown }>(`/v1/crm/marketing/newsletter/campaigns/${id}`);
  return { data, error: null as { message: string } | null };
}
