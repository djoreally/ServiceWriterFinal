import { supabase } from "@/integrations/supabase/client";
import { centsToDollars, toCents } from "@/lib/financialMath";

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
}

/**
 * Fetch all payment records for the current tenant.
 * Applies business rules like excluding pending payments for cancelled appointments.
 */
export async function fetchPaymentRecords(): Promise<PaymentRecord[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `
        id,
        workspace_id,
        invoice_id,
        customer_id,
        provider,
        provider_payment_id,
        status,
        amount,
        currency_code,
        paid_at,
        created_by,
        created_at,
        updated_at
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchPaymentRecords] Error fetching payments", error);
    throw new Error("Failed to load payments");
  }

  const payments = ((data || []) as any[])
    // Exclude pending payments for cancelled appointments — they are not actionable
    .filter(
      (p) =>
        !(
          p.status === "pending" &&
          p.appointments?.status === "cancelled"
        ),
    )
    .map((payment) => ({
      ...payment,
      tax_breakdown:
        (payment.tax_breakdown as unknown as TaxBreakdownItem[] | null) ?? null,
    })) as PaymentRecord[];

  return payments;
}

/**
 * Fetch Stripe Connect account status for the current session.
 */
export async function fetchStripeAccountStatus(): Promise<StripeAccountStatus | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const response = await supabase.functions.invoke("stripe-connect-status", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error(
      "[fetchStripeAccountStatus] Error invoking stripe-connect-status",
      response.error,
    );
    throw new Error("Failed to load Stripe status");
  }

  return (response.data || null) as StripeAccountStatus | null;
}

/**
 * Fetch booking details for the public payment success page.
 * Uses webhook-confirmed payment_records as the source of truth.
 */
export async function fetchPaymentSuccessBookingDetails(
  sessionId: string,
): Promise<PaymentSuccessBookingDetails | null> {
  // Query payment_records for webhook-confirmed payment (or success-redirect verification)
  const paymentRecordQuery = supabase
    .from("payments")
    .select(
      `
        id,
        workspace_id,
        invoice_id,
        customer_id,
        provider,
        provider_payment_id,
        amount,
        currency_code,
        status,
        paid_at,
        created_by,
        created_at
      `,
    );

  const { data: paymentRecord } = sessionId.startsWith("cs_")
    ? await paymentRecordQuery.eq("provider_payment_id", sessionId).maybeSingle()
    : await paymentRecordQuery.eq("id", sessionId).maybeSingle();

  if (!paymentRecord) {
    // Payment record not yet created
    return null;
  }

  // Get business profile
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name")
    .eq("user_id", paymentRecord.created_by ?? "")
    .maybeSingle();

  // Get appointment if linked
  let appointmentDetails:
    | { scheduled_date?: string; scheduled_time?: string; title?: string }
    | undefined;

  const metadata: Record<string, unknown> = {};


  return {
    businessName: profile?.business_name || "Auto Service",
    customerName: "Customer",
    customerEmail: "",
    scheduledDate:
      appointmentDetails?.scheduled_date ||
      (metadata.scheduledDate as string) ||
      "",
    scheduledTime:
      appointmentDetails?.scheduled_time ||
      (metadata.scheduledTime as string) ||
      "",
    serviceName:
      appointmentDetails?.title ||
      (metadata.serviceName as string) ||
      "Auto Service",
    amount: Number(paymentRecord.amount),
    currency: paymentRecord.currency_code || "USD",
    vehicleInfo: metadata.vehicleInfo as string,
    confirmationNumber: paymentRecord.id.slice(-8).toUpperCase(),
    status: paymentRecord.status as "pending" | "succeeded" | "failed",
    userId: paymentRecord.created_by ?? undefined,
  };
}
