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
}): Promise<{ id: string; amount: number; subtotal: number | null; tax_amount: number | null; currency: string; customer_name: string | null }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating a payment.");
  const { data } = await nextApi.payments.create({ workspace_id, appointment_id: params.appointmentId, amount: params.amountCents, subtotal: params.subtotalCents, tax_amount: params.taxCents, tax_rate: params.taxRate, status: "pending", payment_type: "pay_at_service", customer_email: params.customerEmail ?? null, customer_name: params.customerName, processor_fee_amount: 0, data_origin: "manual" });
  return data as { id: string; amount: number; subtotal: number | null; tax_amount: number | null; currency: string; customer_name: string | null };
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
