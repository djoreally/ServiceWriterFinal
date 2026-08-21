/**
 * Offline Payment Command — Processes queued offline payments
 */

import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
export async function processOfflinePayment(payment: {
  amount: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  appointment_id: string | null;
  payment_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}) {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before processing an offline payment.");
  await nextApi.payments.create({ workspace_id, amount: payment.amount, currency: payment.currency, customer_name: payment.customer_name, customer_email: payment.customer_email, appointment_id: payment.appointment_id, payment_type: payment.payment_type, status: "pending", metadata: { ...payment.metadata, queued_at: payment.created_at, processed_at: new Date().toISOString(), offline_queue: true } });
}
