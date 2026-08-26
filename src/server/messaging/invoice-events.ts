import { dispatchInvoiceLifecycle, type InvoiceLifecycleRecord } from "@/server/messaging/quote-payment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

export function invoiceLifecycleKeyForStatus(status: string | null | undefined) {
  switch (status) {
    case "issued": return LIFECYCLE_EVENT_KEYS.paymentRequested;
    case "partially_paid": return "invoice_and_payment_sequence.partial_payment_received";
    case "paid": return LIFECYCLE_EVENT_KEYS.paymentReceived;
    case "past_due": return "invoice_and_payment_sequence.invoice_overdue";
    default: return null;
  }
}

export async function dispatchInvoiceTransition(input: {
  invoice: InvoiceLifecycleRecord;
  previousStatus?: string | null;
  eventId: string;
  workspaceName: string;
  workspaceTimezone: string;
  actionUrl: string;
  forceKey?: string;
}) {
  const key = input.forceKey ?? (input.invoice.status && input.invoice.status !== input.previousStatus
    ? invoiceLifecycleKeyForStatus(input.invoice.status)
    : null);
  if (!key || !input.invoice.customer_email) return;
  await dispatchInvoiceLifecycle({
    eventKey: key,
    eventId: input.eventId,
    invoice: input.invoice,
    workspaceName: input.workspaceName,
    workspaceTimezone: input.workspaceTimezone,
    actionUrl: input.actionUrl,
  });
}
