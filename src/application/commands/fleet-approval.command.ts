/**
 * Fleet Approval Commands
 * Handles approval/rejection of fleet work order approval requests.
 */

import { supabase } from "@/integrations/supabase/client";

export interface FleetApprovalResponse {
  approvalId: string;
  decision: "approved" | "rejected";
  responseNotes?: string;
}

/**
 * Respond to a fleet approval request (approve or reject),
 * then log the activity on the associated work order.
 */
export async function respondToFleetApproval(
  payload: FleetApprovalResponse & { workOrderId: string; userId: string; estimatedCost: number | null; title: string }
): Promise<void> {
  const { error } = await (supabase as any)
    .from("fleet_approvals")
    .update({
      status: payload.decision,
      responded_by: "provider",
      response_notes: payload.responseNotes || null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", payload.approvalId);

  if (error) throw new Error("Failed to submit response");

  // Log activity
  await (supabase as any).from("fleet_activity_logs").insert({
    fleet_work_order_id: payload.workOrderId,
    user_id: payload.userId,
    action: payload.decision === "approved" ? "approval_granted" : "approval_rejected",
    actor_role: "provider",
    details: {
      message: payload.responseNotes || `${payload.decision === "approved" ? "Approved" : "Rejected"}: ${payload.title}`,
      amount: payload.estimatedCost,
    },
  });
}
