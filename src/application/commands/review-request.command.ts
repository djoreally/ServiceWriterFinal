/**
 * Review Request Command
 * 
 * Sends a manual review request email to the customer for a completed appointment.
 * Records the request in the review_requests table for tracking.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
interface SendReviewRequestInput {
  appointmentId: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  serviceRecordId: string;
  serviceName: string;
}

interface SendReviewRequestResult {
  success: boolean;
  error?: string;
  reviewRequestId?: string;
}

export async function sendReviewRequest(
  input: SendReviewRequestInput
): Promise<SendReviewRequestResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Check if a review request was already sent for this service record
  const { data: existing } = await supabase
    .from("review_requests")
    .select("id, status")
    .eq("service_id", input.serviceRecordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "A review request has already been sent for this service." };
  }

  // Fetch business profile for review URLs and branding
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name, email, google_review_url, yelp_review_url, booking_slug")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { success: false, error: "Business profile not found." };
  }

  if (!profile.google_review_url && !profile.yelp_review_url) {
    return { success: false, error: "No review URLs configured. Please add your Google or Yelp review link in Marketing Settings." };
  }

  // Insert the review_requests record
  const { data: reviewRequest, error: insertError } = await supabase
    .from("review_requests")
    .insert({
      user_id: user.id,
      customer_id: input.customerId,
      service_id: input.serviceRecordId,
      recipient_email: input.customerEmail,
      recipient_name: input.customerName,
      status: "pending",
      platform: profile.google_review_url ? "google" : "yelp",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[ReviewRequest] Insert error:", insertError);
    return { success: false, error: "Failed to create review request record." };
  }

  const { data: queueRecord, error: queueError } = await supabase
    .from("email_queue")
    .insert({
      user_id: user.id,
      customer_id: input.customerId,
      service_id: input.serviceRecordId,
      review_request_id: reviewRequest.id,
      email_type: "review_request",
      recipient_email: input.customerEmail,
      recipient_name: input.customerName,
      scheduled_for: new Date().toISOString(),
      status: "pending",
      source: "manual_review_request",
      metadata: {
        service_description: input.serviceName,
        business_name: profile.business_name || "Our Shop",
        business_email: profile.email || undefined,
        google_review_url: profile.google_review_url || undefined,
        yelp_review_url: profile.yelp_review_url || undefined,
        booking_slug: profile.booking_slug || undefined,
      },
    })
    .select("id")
    .single();

  if (queueError) {
    console.error("[ReviewRequest] Queue insert error:", queueError);
    await supabase
      .from("review_requests")
      .update({ status: "failed", error_message: "Failed to queue review request email." })
      .eq("id", reviewRequest.id);
    return { success: false, error: "Failed to queue review request email." };
  }

  await supabase
    .from("review_requests")
    .update({ email_queue_id: queueRecord.id, error_message: null })
    .eq("id", reviewRequest.id);

  return { success: true, reviewRequestId: reviewRequest.id };
}
