/**
 * Marketing Commands - Write operations for testimonials and reviews.
 */

import { supabase } from "@/integrations/supabase/client";

export async function updateTestimonialStatus(
  id: string,
  status: "approved" | "rejected"
): Promise<void> {
  const { error } = await supabase
    .from("testimonials")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function toggleTestimonialFeatured(
  id: string,
  currentlyFeatured: boolean
): Promise<void> {
  const { error } = await supabase
    .from("testimonials")
    .update({ featured: !currentlyFeatured })
    .eq("id", id);
  if (error) throw error;
}

// ── Additional marketing commands ──────────────────────
export interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
}

export async function sendMarketingEmail(body: SendEmailBody): Promise<void> {
  const { error } = await supabase.functions.invoke("send-email", { body });
  if (error) throw error;
}

export async function markAbandonedBookingRecoverySent(id: string) {
  return supabase
    .from("abandoned_bookings")
    .update({ recovery_sent_at: new Date().toISOString() } as never)
    .eq("id", id);
}

export interface NewsletterSubscribeArgs {
  workspaceUserId: string;
  email: string;
  name?: string;
  source: string;
  segment?: string;
  utm?: Record<string, string>;
}

export async function subscribeToNewsletter(args: NewsletterSubscribeArgs) {
  return supabase.functions.invoke("newsletter-subscribe", {
    body: {
      workspaceUserId: args.workspaceUserId,
      email: args.email,
      name: args.name,
      source: args.source,
      segment: args.segment ?? "general",
      utm: args.utm ?? {},
    },
  });
}

export async function listScheduledNewsletterCampaigns() {
  return supabase.functions.invoke("newsletter-campaign-schedule", { method: "GET" });
}

export async function scheduleNewsletterCampaign(body: {
  subject: string;
  previewText: string | null;
  html: string;
  segment: string;
  sendAt: string;
}) {
  return supabase.functions.invoke("newsletter-campaign-schedule", { body });
}

export async function cancelScheduledNewsletterCampaign(id: string) {
  return supabase.functions.invoke(`newsletter-campaign-schedule?id=${id}`, { method: "DELETE" });
}
