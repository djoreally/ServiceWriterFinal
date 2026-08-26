import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import type { LifecycleVariables } from "@/server/messaging/lifecycle-templates";

export type QuoteLifecycleRecord = {
  id: string;
  workspace_id: string;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  quote_number?: string | number | null;
  total?: number | string | null;
  expires_at?: string | null;
  status?: string | null;
  currency_code?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentLifecycleRecord = {
  id: string;
  workspace_id: string;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | number | null;
  amount?: number | string | null;
  currency_code?: string | null;
  status?: string | null;
  paid_at?: string | null;
  provider_payment_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function stringValue(value: unknown, fallback: string): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function firstName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean)[0] || "Customer";
}

function amount(value: unknown, currency = "USD"): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return stringValue(value, "See details");
  return numeric.toLocaleString("en-US", { style: "currency", currency });
}

function variablesForQuote(quote: QuoteLifecycleRecord, workspaceName: string, workspaceTimezone: string, actionUrl: string): LifecycleVariables {
  const name = stringValue(quote.customer_name, "Customer");
  const metadata = quote.metadata ?? {};
  return {
    "business.name": workspaceName,
    "business.timezone": workspaceTimezone,
    "customer.first_name": firstName(name),
    "customer.full_name": name,
    "quote.number": stringValue(quote.quote_number, quote.id.slice(0, 8).toUpperCase()),
    "quote.total": amount(quote.total, quote.currency_code || "USD"),
    "quote.expires_at": stringValue(quote.expires_at, "See quote details"),
    "quote.status": stringValue(quote.status, "updated"),
    "quote.description": stringValue(metadata.description, "Proposed service work"),
    "email.primary_action_url": actionUrl,
  };
}

function variablesForPayment(payment: PaymentLifecycleRecord, workspaceName: string, workspaceTimezone: string, actionUrl: string): LifecycleVariables {
  const name = stringValue(payment.customer_name, "Customer");
  return {
    "business.name": workspaceName,
    "business.timezone": workspaceTimezone,
    "customer.first_name": firstName(name),
    "customer.full_name": name,
    "invoice.number": stringValue(payment.invoice_number, payment.invoice_id || "Invoice"),
    "invoice.balance": amount(payment.amount, payment.currency_code || "USD"),
    "payment.amount": amount(payment.amount, payment.currency_code || "USD"),
    "payment.receipt_number": stringValue(payment.provider_payment_id, payment.id.slice(0, 8).toUpperCase()),
    "payment.date": stringValue(payment.paid_at, "Today"),
    "email.primary_action_url": actionUrl,
  };
}

export async function dispatchQuoteLifecycle(input: {
  eventKey: string;
  eventId: string;
  quote: QuoteLifecycleRecord;
  workspaceName: string;
  workspaceTimezone: string;
  actionUrl: string;
}): Promise<void> {
  if (!input.quote.customer_email) return;
  await dispatchLifecycleEvent({
    templateKey: input.eventKey,
    eventId: input.eventId,
    entityType: "quote",
    entityId: input.quote.id,
    workspaceId: input.quote.workspace_id,
    customerId: input.quote.customer_id,
    recipientEmail: input.quote.customer_email,
    recipientRole: "customer",
    variables: variablesForQuote(input.quote, input.workspaceName, input.workspaceTimezone, input.actionUrl),
    metadata: { quoteId: input.quote.id },
  });
}

export async function dispatchPaymentLifecycle(input: {
  eventKey: string;
  eventId: string;
  payment: PaymentLifecycleRecord;
  workspaceName: string;
  workspaceTimezone: string;
  actionUrl: string;
}): Promise<void> {
  if (!input.payment.customer_email) return;
  await dispatchLifecycleEvent({
    templateKey: input.eventKey,
    eventId: input.eventId,
    entityType: "payment",
    entityId: input.payment.id,
    workspaceId: input.payment.workspace_id,
    customerId: input.payment.customer_id,
    recipientEmail: input.payment.customer_email,
    recipientRole: "customer",
    variables: variablesForPayment(input.payment, input.workspaceName, input.workspaceTimezone, input.actionUrl),
    metadata: { paymentId: input.payment.id, invoiceId: input.payment.invoice_id || "" },
  });
}

export { LIFECYCLE_EVENT_KEYS };
