import { dispatchLifecycleEvent } from "@/server/messaging/lifecycle-events";
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

export type InvoiceLifecycleRecord = {
  id: string;
  workspace_id: string;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  invoice_number?: string | number | null;
  total?: number | string | null;
  due_at?: string | null;
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

type WorkspaceContact = { email?: string | null; phone?: string | null };

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

function businessVariables(workspaceName: string, workspaceTimezone: string, contact?: WorkspaceContact): LifecycleVariables {
  return {
    "business.name": workspaceName,
    "business.timezone": workspaceTimezone,
    "business.email": contact?.email || undefined,
    "business.phone": contact?.phone || undefined,
  };
}

function variablesForQuote(quote: QuoteLifecycleRecord, workspaceName: string, workspaceTimezone: string, actionUrl: string, contact?: WorkspaceContact): LifecycleVariables {
  const name = stringValue(quote.customer_name, "Customer");
  const metadata = quote.metadata ?? {};
  return {
    ...businessVariables(workspaceName, workspaceTimezone, contact),
    "customer.first_name": firstName(name),
    "customer.full_name": name,
    "customer.email": stringValue(quote.customer_email, "Not provided"),
    "quote.number": stringValue(quote.quote_number, quote.id.slice(0, 8).toUpperCase()),
    "quote.total": amount(quote.total, quote.currency_code || "USD"),
    "quote.expires_at": stringValue(quote.expires_at, "See quote details"),
    "quote.status": stringValue(quote.status, "updated"),
    "quote.description": stringValue(metadata.description, "Proposed service work"),
    "quote.version": stringValue(metadata.version, "Current"),
    "appointment.service": stringValue(metadata.appointment_service ?? metadata.service ?? metadata.description, "Approved service"),
    "appointment.date": stringValue(metadata.appointment_date ?? metadata.scheduled_date, "To be scheduled"),
    "appointment.time": stringValue(metadata.appointment_time ?? metadata.scheduled_time, "To be scheduled"),
    "email.primary_action_url": actionUrl,
  };
}

function variablesForInvoice(invoice: InvoiceLifecycleRecord, workspaceName: string, workspaceTimezone: string, actionUrl: string, contact?: WorkspaceContact): LifecycleVariables {
  const name = stringValue(invoice.customer_name, "Customer");
  const metadata = invoice.metadata ?? {};
  const currency = invoice.currency_code || "USD";
  return {
    ...businessVariables(workspaceName, workspaceTimezone, contact),
    "customer.first_name": firstName(name),
    "customer.full_name": name,
    "customer.email": stringValue(invoice.customer_email, "Not provided"),
    "invoice.number": stringValue(invoice.invoice_number, invoice.id.slice(0, 8).toUpperCase()),
    "invoice.total": amount(invoice.total, currency),
    "invoice.balance": amount(metadata.balance ?? invoice.total, currency),
    "invoice.due_at": stringValue(invoice.due_at, "See invoice details"),
    "invoice.status": stringValue(invoice.status, "updated"),
    "payment.amount": amount(metadata.payment_amount ?? metadata.amount ?? invoice.total, currency),
    "email.primary_action_url": actionUrl,
  };
}

function variablesForPayment(payment: PaymentLifecycleRecord, workspaceName: string, workspaceTimezone: string, actionUrl: string, contact?: WorkspaceContact): LifecycleVariables {
  const name = stringValue(payment.customer_name, "Customer");
  const metadata = payment.metadata ?? {};
  const currency = payment.currency_code || "USD";
  return {
    ...businessVariables(workspaceName, workspaceTimezone, contact),
    "customer.first_name": firstName(name),
    "customer.full_name": name,
    "customer.email": stringValue(payment.customer_email, "Not provided"),
    "invoice.number": stringValue(payment.invoice_number, payment.invoice_id || "Invoice"),
    "invoice.balance": amount(metadata.invoice_balance ?? payment.amount, currency),
    "payment.amount": amount(payment.amount, currency),
    "payment.receipt_number": stringValue(payment.provider_payment_id, payment.id.slice(0, 8).toUpperCase()),
    "payment.date": stringValue(payment.paid_at, "Today"),
    "refund.amount": amount(metadata.refund_amount ?? payment.amount, currency),
    "refund.reference": stringValue(metadata.refund_reference ?? payment.provider_payment_id, payment.id.slice(0, 8).toUpperCase()),
    "email.primary_action_url": actionUrl,
  };
}

export async function dispatchQuoteLifecycle(input: {
  eventKey: string;
  eventId: string;
  quote: QuoteLifecycleRecord;
  workspaceName: string;
  workspaceTimezone: string;
  workspaceContact?: WorkspaceContact;
  actionUrl: string;
  recipientEmail?: string | null;
  recipientRole?: "customer" | "staff" | "shop_owner";
}): Promise<void> {
  const recipientEmail = input.recipientEmail ?? input.quote.customer_email;
  if (!recipientEmail) return;
  await dispatchLifecycleEvent({
    templateKey: input.eventKey,
    eventId: input.eventId,
    entityType: "quote",
    entityId: input.quote.id,
    workspaceId: input.quote.workspace_id,
    customerId: input.quote.customer_id,
    recipientEmail,
    recipientRole: input.recipientRole ?? "customer",
    variables: variablesForQuote(input.quote, input.workspaceName, input.workspaceTimezone, input.actionUrl, input.workspaceContact),
    metadata: { quoteId: input.quote.id },
  });
}

export async function dispatchInvoiceLifecycle(input: {
  eventKey: string;
  eventId: string;
  invoice: InvoiceLifecycleRecord;
  workspaceName: string;
  workspaceTimezone: string;
  workspaceContact?: WorkspaceContact;
  actionUrl: string;
}): Promise<void> {
  if (!input.invoice.customer_email) return;
  await dispatchLifecycleEvent({
    templateKey: input.eventKey,
    eventId: input.eventId,
    entityType: "invoice",
    entityId: input.invoice.id,
    workspaceId: input.invoice.workspace_id,
    customerId: input.invoice.customer_id,
    recipientEmail: input.invoice.customer_email,
    recipientRole: "customer",
    variables: variablesForInvoice(input.invoice, input.workspaceName, input.workspaceTimezone, input.actionUrl, input.workspaceContact),
    metadata: { invoiceId: input.invoice.id },
  });
}

export async function dispatchPaymentLifecycle(input: {
  eventKey: string;
  eventId: string;
  payment: PaymentLifecycleRecord;
  workspaceName: string;
  workspaceTimezone: string;
  workspaceContact?: WorkspaceContact;
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
    variables: variablesForPayment(input.payment, input.workspaceName, input.workspaceTimezone, input.actionUrl, input.workspaceContact),
    metadata: { paymentId: input.payment.id, invoiceId: input.payment.invoice_id || "" },
  });
}

export { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
