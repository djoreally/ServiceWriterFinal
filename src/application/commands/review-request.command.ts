/** Review Request Command — canonical workspace-backed branding. */
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
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

export async function sendReviewRequest(input: SendReviewRequestInput): Promise<SendReviewRequestResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("review_requests")
    .select("id, status")
    .eq("service_id", input.serviceRecordId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { success: false, error: "A review request has already been sent for this service." };

  const context = await resolveCurrentWorkspace();
  if (!context) return { success: false, error: "Workspace not found." };

  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("email, google_review_url, yelp_review_url, booking_slug").eq("workspace_id", context.workspaceId).maybeSingle(),
  ]);
  if (workspaceError || settingsError || !workspace || !settings) return { success: false, error: "Business settings not found." };
  if (!settings.google_review_url && !settings.yelp_review_url) {
    return { success: false, error: "No review URLs configured. Please add your Google or Yelp review link in Marketing Settings." };
  }

  const { data: reviewRequest, error: insertError } = await supabase
    .from("review_requests")
    .insert({ user_id: user.id, customer_id: input.customerId, service_id: input.serviceRecordId, recipient_email: input.customerEmail, recipient_name: input.customerName, status: "pending", platform: settings.google_review_url ? "google" : "yelp" })
    .select("id")
    .single();
  if (insertError) return { success: false, error: "Failed to create review request record." };

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
        appointment_id: input.appointmentId,
        service_description: input.serviceName,
        business_name: workspace.name || "Our Shop",
        business_email: settings.email || undefined,
        google_review_url: settings.google_review_url || undefined,
        yelp_review_url: settings.yelp_review_url || undefined,
        booking_slug: settings.booking_slug || undefined,
      },
    })
    .select("id")
    .single();

  if (queueError) {
    await supabase.from("review_requests").update({ status: "failed", error_message: "Failed to queue review request email." }).eq("id", reviewRequest.id);
    return { success: false, error: "Failed to queue review request email." };
  }

  await supabase.from("review_requests").update({ email_queue_id: queueRecord.id, error_message: null }).eq("id", reviewRequest.id);
  return { success: true, reviewRequestId: reviewRequest.id };
}
