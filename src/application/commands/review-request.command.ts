import { supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { success:false, error:"Select a workspace before sending a review request." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { success:false, error:"Not authenticated" };

  const response = await fetch("/api/v1/reviews/actions", {
    method:"POST",
    credentials:"include",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${session.access_token}` },
    body:JSON.stringify({ workspace_id:workspaceId, service_record_id:input.serviceRecordId }),
  });
  const body = await response.json().catch(() => ({})) as { data?:{ status?:string; event_id?:string }; error?:{ message?:string } };
  if (!response.ok) return { success:false, error:body.error?.message ?? "Failed to send review request." };
  const status = body.data?.status ?? "unknown";
  if (status === "suppressed" || status === "canceled" || status === "failed") {
    return { success:false, error:"Review request was not sent because the customer's current messaging preferences do not allow it." };
  }
  return { success:true, reviewRequestId:body.data?.event_id };
}
