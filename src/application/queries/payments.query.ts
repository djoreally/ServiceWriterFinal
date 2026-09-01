import { productionSupabase, supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

const productionDb = productionSupabase as any;

export interface TaxBreakdownItem {
  jurisdiction: string;
  rate: number;
  amount: number;
  tax_type: string;
}

/**
 * PaymentRecord is the legacy Payments-screen contract and is intentionally
 * expressed in integer cents. The canonical `payments.amount` column is stored
 * in dollars, so the adapter below performs the unit conversion exactly once.
 */
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dollarsToIntegerCents(value: unknown): number {
  const dollars = Number(value ?? 0);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

function metadataCents(
  metadata: Record<string, unknown>,
  centsKey: string,
  dollarsKey: string,
): number | null {
  const cents = metadata[centsKey];
  if (cents != null && Number.isFinite(Number(cents))) return Math.round(Number(cents));
  const dollars = metadata[dollarsKey];
  if (dollars != null && Number.isFinite(Number(dollars))) return dollarsToIntegerCents(dollars);
  return null;
}

function metadataBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

interface PaymentCustomer {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface PaymentApiRow {
  id: string;
  amount: number | string | null;
  currency_code: string | null;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  created_at: string;
  metadata: unknown;
  invoice_id?: string | null;
  customer_id?: string | null;
  customers?: PaymentCustomer | PaymentCustomer[] | null;
}

function relatedCustomer(value: PaymentApiRow["customers"]): PaymentCustomer | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function customerName(customer: PaymentCustomer | null | undefined): string | null {
  if (!customer) return null;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

function mapPayment(payment: PaymentApiRow): PaymentRecord {
  const metadata = object(payment.metadata);
  const customer = relatedCustomer(payment.customers);
  const amountCents = dollarsToIntegerCents(payment.amount);
  const subtotalCents = metadataCents(metadata, "subtotal_cents", "subtotal");
  const taxAmountCents = metadataCents(metadata, "tax_amount_cents", "tax_amount")
    ?? metadataCents(metadata, "tax_cents", "tax_amount");
  const refundedAmountCents = payment.status === "refunded"
    ? amountCents
    : metadataCents(metadata, "refund_cents", "refunded_amount") ?? 0;

  return {
    id: payment.id,
    amount: amountCents,
    subtotal: subtotalCents,
    tax_amount: taxAmountCents,
    tax_rate: metadata.tax_rate != null ? Number(metadata.tax_rate) : null,
    tax_breakdown: Array.isArray(metadata.tax_breakdown) ? metadata.tax_breakdown as TaxBreakdownItem[] : null,
    currency: payment.currency_code || "USD",
    status: payment.status,
    payment_type: String(metadata.payment_type ?? metadata.payment_method ?? payment.provider ?? "other"),
    customer_name: customerName(customer) ?? (metadata.customer_name == null ? null : String(metadata.customer_name)),
    customer_email: customer?.email ?? (metadata.customer_email == null ? null : String(metadata.customer_email)),
    stripe_payment_intent_id: payment.provider === "stripe" ? payment.provider_payment_id ?? null : null,
    created_at: payment.created_at,
    metadata: payment.metadata ?? {},
    refund_amount: refundedAmountCents,
    invoice_sent_at: metadata.invoice_sent_at == null ? null : String(metadata.invoice_sent_at),
    invoice_id: payment.invoice_id ?? null,
    customer_id: payment.customer_id ?? null,
    appointments: null,
  };
}

/**
 * Load the complete ledger in bounded database pages so KPI totals/export never
 * silently become "first 25 rows only" as the account grows.
 */
export async function fetchPaymentRecords(): Promise<PaymentRecord[]> {
  const id = workspaceId();
  const pageSize = 250;
  const rows: PaymentApiRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await (supabase.from("payments") as any)
      .select("id,amount,currency_code,status,provider,provider_payment_id,created_at,metadata,invoice_id,customer_id,customers(first_name,last_name,email)")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as PaymentApiRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows.map(mapPayment);
}

/** Read the persisted Connect state for the selected workspace. */
export async function fetchStripeAccountStatus(): Promise<StripeAccountStatus | null> {
  const id = workspaceId();
  const { data, error } = await productionDb
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", id)
    .maybeSingle();
  if (error) throw error;

  const operational = object(data?.operational_settings);
  const accountId = operational.stripe_account_id;
  const connected = typeof accountId === "string" && accountId.trim().length > 0;

  return {
    connected,
    chargesEnabled: metadataBoolean(operational.stripe_charges_enabled),
    payoutsEnabled: metadataBoolean(operational.stripe_payouts_enabled),
    detailsSubmitted: metadataBoolean(operational.stripe_onboarding_complete),
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
    .select("id,workspace_id,customer_id,provider,provider_payment_id,amount,currency_code,status,created_by,metadata,customers(first_name,last_name,email),workspaces(name)")
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
