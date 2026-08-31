import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export interface TaxBreakdownItem {
  jurisdiction: string;
  rate: number;
  amount: number;
  tax_type: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  subtotal: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  tax_breakdown: TaxBreakdownItem[] | null;
  currency: string;
  status: string;
  payment_type: string;
  customer_name: string | null;
  customer_email: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  metadata: unknown;
  refund_amount: number | null;
  invoice_sent_at: string | null;
  invoice_id?: string | null;
  customer_id?: string | null;
  appointments?: {
    title: string;
    scheduled_date: string;
    tax_amount: number | null;
    status?: string | null;
  } | null;
}

export interface StripeAccountStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface PaymentSuccessBookingDetails {
  businessName: string;
  customerName: string;
  customerEmail: string;
  scheduledDate: string;
  scheduledTime: string;
  serviceName: string;
  amount: number;
  currency: string;
  vehicleInfo?: string;
  confirmationNumber: string;
  status: "pending" | "succeeded" | "failed";
  userId?: string;
  appointmentId?: string;
  provider?: string;
}

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before viewing payments.");
  return id;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

interface PaymentCustomer {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface PaymentApiRow {
  id: string;
  amount: number | null;
  currency_code: string | null;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  created_at: string;
  metadata: unknown;
  invoice_id?: string | null;
  customer_id?: string | null;
  customers?: PaymentCustomer | null;
}

function customerName(customer: PaymentCustomer | null | undefined): string | null {
  if (!customer) return null;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Canonical payments are stored in dollars. No cents conversion belongs here. */
export async function fetchPaymentRecords(): Promise<PaymentRecord[]> {
  const response = await nextApi.payments.list(workspaceId());
  return ((response.data ?? []) as unknown as PaymentApiRow[]).map((payment) => {
    const metadata = object(payment.metadata);
    const refundedAmount = payment.status === "refunded"
      ? Number(payment.amount ?? 0)
      : Number(metadata.refunded_amount ?? 0);

    return {
      id: payment.id,
      amount: Number(payment.amount ?? 0),
      subtotal: metadata.subtotal != null ? Number(metadata.subtotal) : null,
      tax_amount: metadata.tax_amount != null ? Number(metadata.tax_amount) : null,
      tax_rate: metadata.tax_rate != null ? Number(metadata.tax_rate) : null,
      tax_breakdown: Array.isArray(metadata.tax_breakdown) ? metadata.tax_breakdown as TaxBreakdownItem[] : null,
      currency: payment.currency_code || "USD",
      status: payment.status,
      payment_type: String(metadata.payment_method ?? payment.provider ?? "other"),
      customer_name: customerName(payment.customers) ?? (metadata.customer_name == null ? null : String(metadata.customer_name)),
      customer_email: payment.customers?.email ?? (metadata.customer_email == null ? null : String(metadata.customer_email)),
      stripe_payment_intent_id: payment.provider === "stripe" ? payment.provider_payment_id ?? null : null,
      created_at: payment.created_at,
      metadata: payment.metadata ?? {},
      refund_amount: refundedAmount,
      invoice_sent_at: metadata.invoice_sent_at == null ? null : String(metadata.invoice_sent_at),
      invoice_id: payment.invoice_id ?? null,
      customer_id: payment.customer_id ?? null,
      appointments: null,
    };
  });
}

/** Final currently has no Stripe provider runtime configured. */
export async function fetchStripeAccountStatus(): Promise<StripeAccountStatus | null> {
  return {
    connected: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
  };
}

/**
 * Read a recorded payment success from the canonical ledger. Public Stripe
 * session verification is intentionally not attempted until a provider exists.
 */
export async function fetchPaymentSuccessBookingDetails(
  sessionId: string,
): Promise<PaymentSuccessBookingDetails | null> {
  const matchColumn = sessionId.startsWith("cs_") ? "provider_payment_id" : "id";
  const { data: paymentRecord, error } = await (supabase.from("payments") as any)
    .select("id,workspace_id,customer_id,provider_payment_id,amount,currency_code,status,created_by,metadata,customers(first_name,last_name,email),workspaces(name)")
    .eq(matchColumn, sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!paymentRecord) return null;

  const metadata = object(paymentRecord.metadata);
  const customer = paymentRecord.customers;
  const name = customerName(customer) ?? String(metadata.customer_name ?? "Customer");

  return {
    businessName: paymentRecord.workspaces?.name || "Auto Service",
    customerName: name,
    customerEmail: customer?.email ?? String(metadata.customer_email ?? ""),
    scheduledDate: String(metadata.scheduled_date ?? metadata.scheduledDate ?? ""),
    scheduledTime: String(metadata.scheduled_time ?? metadata.scheduledTime ?? ""),
    serviceName: String(metadata.service_name ?? metadata.serviceName ?? "Auto Service"),
    amount: Number(paymentRecord.amount ?? 0),
    currency: paymentRecord.currency_code || "USD",
    vehicleInfo: metadata.vehicle_info == null && metadata.vehicleInfo == null
      ? undefined
      : String(metadata.vehicle_info ?? metadata.vehicleInfo),
    confirmationNumber: paymentRecord.id.slice(-8).toUpperCase(),
    status: paymentRecord.status as "pending" | "succeeded" | "failed",
    userId: paymentRecord.created_by ?? undefined,
    appointmentId: metadata.appointment_id == null ? undefined : String(metadata.appointment_id),
    provider: paymentRecord.provider ?? "stripe",
  };
}
