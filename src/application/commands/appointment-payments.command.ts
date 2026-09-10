/**
 * Appointment Payments Commands — closeout payment operations.
 *
 * Canonical API/database amounts are dollars. This legacy UI command accepts
 * and returns integer cents so the conversion happens exactly once at the API
 * boundary instead of leaking mixed units through components.
 */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

/** Create or reuse the canonical pending receivable for an appointment. */
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
  const amountDollars = Math.round(params.amountCents) / 100;
  const { data } = await nextApi.payments.create({
    workspace_id,
    amount: amountDollars,
    currency_code: "USD",
    status: "pending",
    metadata: {
      appointment_id: params.appointmentId,
      payment_type: "pay_at_service",
      subtotal_cents: params.subtotalCents,
      tax_amount_cents: params.taxCents,
      tax_rate: params.taxRate,
      customer_email: params.customerEmail ?? null,
      customer_name: params.customerName,
      source: "appointment_detail",
    },
  });
  const payment = data as { id: string; amount: number | string; currency_code: string; status: string };
  return {
    ...payment,
    amount: Math.round(Number(payment.amount || 0) * 100),
  };
}

/** Send a Stripe-hosted payment link for the canonical pending receivable. */
export async function sendAppointmentPaymentLink(params: {
  paymentId: string;
  customerEmail: string | null;
  customerName: string | null;
}): Promise<{ url: string; emailSent: boolean }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending a payment link.");
  const { data } = await nextApi.payments.action({
    action: "payment_link",
    workspace_id,
    payment_id: params.paymentId,
    customer_email: params.customerEmail ?? undefined,
    customer_name: params.customerName ?? undefined,
  });
  const result = data as { url?: string; email_sent?: boolean };
  return { url: result.url ?? "", emailSent: !!result.email_sent };
}
