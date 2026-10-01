import { apiClient, ApiClientError } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
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
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { success:false, error:"Select a workspace before sending a review request." };
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { success:false, error:"Not authenticated" };

  let body: { data?: { status?: string; event_id?: string } };
  try {
    const res = await apiClient.post<{ data?: { status?: string; event_id?: string } }>("/v1/reviews/actions", {
      workspace_id: workspaceId,
      service_record_id: input.serviceRecordId,
    });
    body = res;
  } catch (error) {
    const message = error instanceof ApiClientError
      ? error.message || "Failed to send review request."
      : "Failed to send review request.";
    return { success:false, error: message };
  }
  const status = body.data?.status ?? "unknown";
  if (status === "suppressed" || status === "canceled" || status === "failed") {
    return { success:false, error:"Review request was not sent because the customer's current messaging preferences do not allow it." };
  }
  return { success:true, reviewRequestId:body.data?.event_id };
}
