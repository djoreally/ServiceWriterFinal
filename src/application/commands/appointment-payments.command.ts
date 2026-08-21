/**
 * Appointment Payments Commands — Write operations for payment records on appointments.
 */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
/** Create a pending payment record for an appointment. */
export async function createAppointmentPaymentRecord(params: {
  appointmentId: string;
  amountCents: number;
  subtotalCents: number;
  taxCents: number | null;
  taxRate: number | null;
  customerEmail?: string | null;
  customerName: string | null;
}): Promise<{ id: string; amount: number; currency_code: string; status: string }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating a payment.");
  const { data } = await nextApi.payments.create({
    workspace_id,
    amount: params.amountCents,
    currency_code: "USD",
    status: "pending",
  });
  return data as { id: string; amount: number; currency_code: string; status: string };
}

/** Send a payment link for a pending payment record. */
export async function sendAppointmentPaymentLink(params: {
  paymentId: string;
  customerEmail: string | null;
  customerName: string | null;
}): Promise<{ url: string; emailSent: boolean }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending a payment link.");
  const { data } = await nextApi.payments.action({ action: "payment_link", workspace_id, payment_id: params.paymentId, amount: 1, customer_email: params.customerEmail ?? "", customer_name: params.customerName ?? undefined });
  const result = data as { url?: string; email_sent?: boolean };
  return { url: result.url ?? "", emailSent: !!result.email_sent };
}
