import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, json, toError } from "@/server/api";
import { createSupabaseAdminClient, createSupabaseAnonServerClient } from "@/lib/supabase";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";
import { finalizePublicBookingFinancials } from "@/server/payments/finalize-public-booking-financials";

export const publicBookingRouter = new Hono();

const nullableText = z.string().trim().max(1000).nullable().optional();
const nullableNumber = z.number().finite().nullable().optional();

const vehicleSchema = z.object({
  client_id: z.string().trim().min(1).max(160),
  year: z.union([z.string(), z.number()]).transform(String),
  make: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(160),
  license_plate: nullableText,
  vin: nullableText,
  mileage: z.union([z.string(), z.number()]).nullable().optional().transform((value) => value == null ? null : String(value)),
  oil_type: nullableText,
  oil_capacity: nullableText,
  image_url: nullableText,
  engine: nullableText,
});

const serviceSchema = z.object({
  client_vehicle_id: z.string().trim().min(1).max(160),
  service_catalog_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(250),
  price: z.number().finite().nonnegative(),
  quantity: z.number().finite().positive().max(20),
  is_prepaid: z.boolean(),
});

const commitSchema = z.object({
  booking_slug: z.string().trim().min(1).max(160),
  idempotency_key: z.string().trim().min(1).max(128),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  duration_minutes: z.number().int().min(1).max(1440),
  title: z.string().max(500),
  description: z.string().max(5000),
  notes: z.string().max(5000).nullable(),
  client_estimated_cost: z.number().finite().nonnegative(),
  client_tax_amount: z.number().finite().nonnegative(),
  client_tax_rate: z.number().finite().nonnegative().max(100),
  currency: z.string().trim().length(3),
  payment_choice: z.enum(["pay_later", "pay_now"]),
  coupon_code: z.string().trim().max(128).nullable().optional(),
  reward_instance_id: z.string().uuid().nullable().optional(),
  guest: z.object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(10).max(64),
  }),
  location: z.object({
    address: z.string().trim().min(1).max(1000),
    line1: z.string().trim().min(1).max(500),
    line2: z.string().trim().max(500).nullable(),
    city: z.string().trim().max(160),
    state: z.string().trim().max(160),
    postal_code: z.string().trim().max(32),
    country: z.string().trim().length(2).default("US"),
    lat: nullableNumber,
    lng: nullableNumber,
  }),
  vehicles: z.array(vehicleSchema).min(1).max(10),
  services: z.array(serviceSchema).min(1).max(25),
  configuration: z.record(z.string(), z.unknown()),
});

type CommitBody = z.infer<typeof commitSchema>;
type CommitResult = {
  workspace_id: string;
  business_user_id: string;
  appointment_id: string;
  payment_id: string;
  payment_choice: "pay_later" | "pay_now";
  customer_id?: string;
  vehicle_ids?: Record<string, string>;
  item_count?: number;
  financial_state?: string;
  idempotent?: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function createStripeCheckout(
  request: Request,
  body: CommitBody,
  committed: CommitResult,
): Promise<{ url: string; session_id: string; card_fee_cents: number }> {
  const admin = createSupabaseAdminClient();
  const [{ data: payment, error: paymentError }, { data: settings, error: settingsError }] = await Promise.all([
    admin
      .from("payments")
      .select("id,workspace_id,status,amount,currency_code,metadata")
      .eq("workspace_id", committed.workspace_id)
      .eq("id", committed.payment_id)
      .single(),
    admin
      .from("workspace_settings")
      .select("payment_provider,operational_settings")
      .eq("workspace_id", committed.workspace_id)
      .single(),
  ]);
  if (paymentError) throw paymentError;
  if (settingsError) throw settingsError;
  if (payment.status !== "pending") throw new Error("BOOKING_PAYMENT_NOT_PENDING");
  if (settings.payment_provider !== "stripe") throw new Error("BOOKING_PAYMENT_PROVIDER_NOT_STRIPE");

  const paymentMetadata = record(payment.metadata);
  if (paymentMetadata.financial_state !== "canonical") throw new Error("BOOKING_FINANCIALS_NOT_FINALIZED");
  const financialSnapshot = record(paymentMetadata.financial_snapshot);
  const cardFeeCents = Math.max(0, Math.round(finiteNumber(financialSnapshot.surchargeCents)));

  const execution = resolveStripeWorkspaceExecution(settings.operational_settings);
  const currency = String(payment.currency_code || body.currency || "USD").toLowerCase();
  const totalCents = Math.round(finiteNumber(payment.amount) * 100);
  if (totalCents < 1) throw new Error("BOOKING_PAYMENT_AMOUNT_INVALID");

  const metadata = {
    workspace_id: committed.workspace_id,
    appointment_id: committed.appointment_id,
    payment_id: committed.payment_id,
    booking_idempotency_key: body.idempotency_key,
    service_writer_booking: "true",
  };
  const origin = new URL(request.url).origin;

  const session = await execution.stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: body.guest.email,
    line_items: [{
      price_data: {
        currency,
        product_data: { name: "Service appointment" },
        unit_amount: totalCents,
      },
      quantity: 1,
    }],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/book/${encodeURIComponent(body.booking_slug)}?payment=cancelled&appointment_id=${encodeURIComponent(committed.appointment_id)}`,
  }, execution.requestOptions(`public-booking:${committed.payment_id}:${totalCents}`));
  if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");

  const { error: updateError } = await admin
    .from("payments")
    .update({
      provider: "stripe",
      metadata: {
        ...paymentMetadata,
        payment_type: "pay_now",
        stripe_account_id: execution.accountId,
        stripe_checkout_session_id: session.id,
        card_fee_cents: cardFeeCents,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", committed.workspace_id)
    .eq("id", committed.payment_id)
    .eq("status", "pending");
  if (updateError) throw updateError;

  return { url: session.url, session_id: session.id, card_fee_cents: cardFeeCents };
}

function financialFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/coupon/i.test(message)) {
    return "Your appointment is confirmed, but the selected discount could not be finalized. The appointment remains unpaid so the business can review it safely.";
  }
  if (/reward/i.test(message)) {
    return "Your appointment is confirmed, but the selected reward could not be finalized. The appointment remains unpaid so the business can review it safely.";
  }
  return "Your appointment is confirmed, but pricing could not be finalized. The appointment remains unpaid and needs review before payment.";
}

publicBookingRouter.post("/v1/public-bookings/commit", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return json({ error: { code: "invalid_input", message: "Invalid JSON body" } }, { status: 400 });
  }

  const body = commitSchema.parse(raw);
  const supabase = createSupabaseAnonServerClient() as any;
  const { data, error } = await supabase.rpc("public_booking_commit_v1", { p_payload: body });
  if (error) return errorResponse(toError(error));

  const committed = data as CommitResult | null;
  if (!committed?.appointment_id || !committed.payment_id || !committed.workspace_id) {
    return json({ error: { code: "booking_commit_invalid", message: "Booking commit returned an incomplete result" } }, { status: 500 });
  }

  let financialSnapshot: Record<string, unknown> | null = null;
  let finalizedPaymentStatus: "pending" | "succeeded" = "pending";
  try {
    const finalized = await finalizePublicBookingFinancials({
      bookingSlug: body.booking_slug,
      appointmentId: committed.appointment_id,
      paymentId: committed.payment_id,
      businessUserId: committed.business_user_id,
      customerEmail: body.guest.email,
      paymentChoice: body.payment_choice,
      couponCode: body.coupon_code ?? null,
      rewardInstanceId: body.reward_instance_id ?? null,
    });
    financialSnapshot = finalized.snapshot as unknown as Record<string, unknown>;
    finalizedPaymentStatus = finalized.paymentStatus;
  } catch (financialError) {
    console.error("[public-booking] booking committed but financial finalization failed", {
      appointmentId: committed.appointment_id,
      paymentId: committed.payment_id,
      error: financialError instanceof Error ? financialError.message : String(financialError),
    });
    return json({
      data: {
        ...committed,
        financial_state: "failed",
        financial_error: financialFailureMessage(financialError),
        financial_snapshot: null,
        checkout_url: null,
        payment_status: "pending",
      },
      error: null,
    });
  }

  if (body.payment_choice === "pay_later" || finalizedPaymentStatus === "succeeded") {
    return json({
      data: {
        ...committed,
        financial_state: "canonical",
        financial_snapshot: financialSnapshot,
        checkout_url: null,
        payment_status: finalizedPaymentStatus,
      },
      error: null,
    });
  }

  try {
    const checkout = await createStripeCheckout(c.req.raw, body, committed);
    return json({
      data: {
        ...committed,
        financial_state: "canonical",
        financial_snapshot: financialSnapshot,
        checkout_url: checkout.url,
        checkout_session_id: checkout.session_id,
        card_fee_cents: checkout.card_fee_cents,
        payment_status: "pending",
      },
      error: null,
    });
  } catch (checkoutError) {
    console.error("[public-booking] booking finalized but checkout creation failed", {
      appointmentId: committed.appointment_id,
      paymentId: committed.payment_id,
      error: checkoutError instanceof Error ? checkoutError.message : String(checkoutError),
    });
    return json({
      data: {
        ...committed,
        financial_state: "canonical",
        financial_snapshot: financialSnapshot,
        checkout_url: null,
        payment_status: "pending",
        checkout_error: "Online payment could not be started. Your appointment is confirmed and remains unpaid.",
      },
      error: null,
    });
  }
});
