/**
 * Fleet Approval Commands
 * Handles approval/rejection of fleet work order approval requests.
 */

import { apiClient } from "@/lib/api-client";

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
  await apiClient.post(`/v1/fleet/approvals/${payload.approvalId}/respond`, { payload });
}
