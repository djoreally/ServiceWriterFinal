import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, json, toError } from "@/server/api";
import { createSupabaseAdminClient, createSupabaseAnonServerClient } from "@/lib/supabase";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

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
  estimated_cost: z.number().finite().nonnegative(),
  tax_amount: z.number().finite().nonnegative(),
  tax_rate: z.number().finite().nonnegative().max(100),
  currency: z.string().trim().length(3),
  payment_choice: z.enum(["pay_later", "pay_now"]),
  guest: z.object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(10).max(64),
  }),
  location: z.object({
    address: z.string().trim().min(1).max(1000),
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
  idempotent?: boolean;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number {
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
      .select("id,workspace_id,customer_id,status,amount,currency_code,metadata")
      .eq("workspace_id", committed.workspace_id)
      .eq("id", committed.payment_id)
      .single(),
    admin
      .from("workspace_settings")
      .select("payment_provider,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,operational_settings")
      .eq("workspace_id", committed.workspace_id)
      .single(),
  ]);
  if (paymentError) throw paymentError;
  if (settingsError) throw settingsError;
  if (payment.status !== "pending") throw new Error("BOOKING_PAYMENT_NOT_PENDING");
  if (settings.payment_provider !== "stripe") throw new Error("BOOKING_PAYMENT_PROVIDER_NOT_STRIPE");

  const execution = resolveStripeWorkspaceExecution(settings.operational_settings);
  const currency = String(payment.currency_code || body.currency || "USD").toLowerCase();
  const baseCents = Math.round(asNumber(payment.amount) * 100);
  if (baseCents < 1) throw new Error("BOOKING_PAYMENT_AMOUNT_INVALID");

  let cardFeeCents = 0;
  if (settings.surcharge_enabled) {
    const value = Math.max(asNumber(settings.surcharge_value), 0);
    cardFeeCents = settings.surcharge_type === "fixed"
      ? Math.round(value * 100)
      : Math.round(baseCents * (value / 100));
  }

  const metadata = {
    workspace_id: committed.workspace_id,
    appointment_id: committed.appointment_id,
    payment_id: committed.payment_id,
    booking_idempotency_key: body.idempotency_key,
    service_writer_booking: "true",
  };
  const origin = new URL(request.url).origin;
  const lineItems = [
    {
      price_data: {
        currency,
        product_data: { name: "Service appointment" },
        unit_amount: baseCents,
      },
      quantity: 1,
    },
    ...(cardFeeCents > 0 ? [{
      price_data: {
        currency,
        product_data: { name: settings.surcharge_description || "Card Processing Fee" },
        unit_amount: cardFeeCents,
      },
      quantity: 1,
    }] : []),
  ];

  const session = await execution.stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: body.guest.email,
    line_items: lineItems,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/book/${encodeURIComponent(body.booking_slug)}?payment=cancelled&appointment_id=${encodeURIComponent(committed.appointment_id)}`,
  }, execution.requestOptions(`public-booking:${committed.payment_id}`));
  if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");

  const existingMetadata = object(payment.metadata);
  const { error: updateError } = await admin
    .from("payments")
    .update({
      provider: "stripe",
      metadata: {
        ...existingMetadata,
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

/**
 * The only browser-facing public booking write boundary.
 *
 * The database RPC commits every durable booking fact atomically. For pay-now,
 * Checkout is created only after that commit and points back to the existing
 * payment row. A provider failure cannot create a partial booking or duplicate
 * appointment; the committed booking simply remains unpaid.
 */
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

  if (body.payment_choice === "pay_later") {
    return json({ data: { ...committed, checkout_url: null, payment_status: "pending" }, error: null });
  }

  try {
    const checkout = await createStripeCheckout(c.req.raw, body, committed);
    return json({
      data: {
        ...committed,
        checkout_url: checkout.url,
        checkout_session_id: checkout.session_id,
        card_fee_cents: checkout.card_fee_cents,
        payment_status: "pending",
      },
      error: null,
    });
  } catch (checkoutError) {
    console.error("[public-booking] booking committed but checkout creation failed", {
      appointmentId: committed.appointment_id,
      paymentId: committed.payment_id,
      error: checkoutError instanceof Error ? checkoutError.message : String(checkoutError),
    });
    return json({
      data: {
        ...committed,
        checkout_url: null,
        payment_status: "pending",
        checkout_error: "Online payment could not be started. Your appointment is confirmed and remains unpaid.",
      },
      error: null,
    });
  }
});
