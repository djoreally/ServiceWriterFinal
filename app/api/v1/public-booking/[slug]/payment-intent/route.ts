import { ApiError, errorResponse, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  assertWorkspacePaymentsEnabled,
  findAppointmentInvoice,
  invoiceBalanceDue,
  loadGuestAppointment,
  loadWorkspaceStripeExecution,
  resolvePublicBookingWorkspace,
} from "@/server/payments/public-booking-payment";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const bodySchema = z.object({
  appointment_id: z.string().uuid(),
  email: z.string().trim().email().max(320),
});

const CLOSED_PAYMENT_STATUSES = ["succeeded", "refunded", "partially_refunded", "void"];
const REUSABLE_INTENT_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * What the browser needs to mount Stripe Elements for this intent.
 * Publishable keys and Connect account ids are public by design (they
 * ship in client bundles and checkout URLs); they are returned only to
 * the email-bound guest, at payment time — never in the public page
 * payload. Direct-mode workspaces keep their publishable key in their
 * own Stripe dashboard (it is not stored server-side), so both fields
 * are null there and the client must say so honestly instead of
 * mounting a broken form.
 */
function clientStripeConfig(execution: { mode: string; accountId: string }): {
  stripe_account_id: string | null;
  publishable_key: string | null;
} {
  if (execution.mode !== "connect") {
    return { stripe_account_id: null, publishable_key: null };
  }
  return {
    stripe_account_id: execution.accountId,
    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
  };
}

/**
 * Public pay-now, step 1: create (or reuse) a Stripe PaymentIntent for a
 * public booking's outstanding balance.
 *
 * The caller is bound to the booking by the guest email stored on the
 * appointment (same binding as the confirmation route). The amount is
 * never taken from the request — it is the invoice balance due, computed
 * server-side. The charge runs on the workspace's own Stripe account via
 * the shared execution layer (Stripe Connect, or the workspace's direct
 * keys when the workspace is configured for direct mode). Completion is
 * settled by the sibling confirm route, which verifies the intent with
 * Stripe server-side; webhooks reconcile independently.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const slug = slugSchema.parse((await context.params).slug);
    const body = bodySchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    const workspace = await resolvePublicBookingWorkspace(admin, slug);
    const appointment = await loadGuestAppointment(
      admin,
      workspace.id,
      body.appointment_id,
      body.email,
    );
    if (String(appointment.status).toLowerCase() === "cancelled") {
      throw new ApiError(409, "This booking was cancelled.", "booking_cancelled");
    }
    await assertWorkspacePaymentsEnabled(admin, workspace.id);

    const invoice = await findAppointmentInvoice(admin, workspace.id, appointment.id);
    if (!invoice) {
      throw new ApiError(
        404,
        "No billable invoice exists for this booking yet.",
        "payment_invoice_not_found",
      );
    }
    const balanceDue = invoiceBalanceDue(invoice);
    if (balanceDue < 0.005) {
      throw new ApiError(409, "This booking has no balance due.", "payment_nothing_due");
    }

    const execution = await loadWorkspaceStripeExecution(admin, workspace.id);
    const currency = workspace.currencyCode.toLowerCase();

    // Reuse the booking's open payment row when one exists so retries and
    // double-clicks converge on a single intent.
    const { data: openPayments, error: openError } = await admin
      .from("payments")
      .select("id,status,amount,provider,provider_payment_id,metadata")
      .eq("workspace_id", workspace.id)
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true });
    if (openError) throw openError;
    let payment = (openPayments ?? []).find(
      (row) => !CLOSED_PAYMENT_STATUSES.includes(String(row.status)),
    ) as Record<string, unknown> | undefined;

    if (payment?.provider_payment_id) {
      const existing = await execution.stripe.paymentIntents.retrieve(
        String(payment.provider_payment_id),
        {},
        execution.requestOptions(),
      );
      if (existing.status === "succeeded") {
        throw new ApiError(409, "This booking is already paid.", "payment_already_paid");
      }
      if (REUSABLE_INTENT_STATUSES.includes(existing.status) && existing.client_secret) {
        return json({
          data: {
            payment_id: payment.id,
            client_secret: existing.client_secret,
            amount: Number(payment.amount ?? balanceDue),
            currency,
            mode: execution.mode,
            ...clientStripeConfig(execution),
            reused: true,
          },
        });
      }
      // Canceled or otherwise dead intent: fall through and create a fresh
      // one against the same payment row.
    }

    if (!payment) {
      const { data: inserted, error: insertError } = await admin
        .from("payments")
        .insert({
          workspace_id: workspace.id,
          invoice_id: invoice.id,
          customer_id: appointment.customer_id,
          provider: "stripe",
          provider_payment_id: null,
          status: "pending",
          amount: balanceDue,
          currency_code: workspace.currencyCode,
          paid_at: null,
          created_by: null,
          metadata: { source: "public_booking_paynow", appointment_id: appointment.id },
        })
        .select("id,status,amount,provider,provider_payment_id,metadata")
        .single();
      if (insertError) throw insertError;
      payment = inserted as Record<string, unknown>;
    }

    const intent = await execution.stripe.paymentIntents.create(
      {
        amount: Math.round(balanceDue * 100),
        currency,
        automatic_payment_methods: { enabled: true },
        description: invoice.invoice_number
          ? `${workspace.name} — invoice ${invoice.invoice_number}`
          : `${workspace.name} — booking payment`,
        metadata: {
          workspace_id: workspace.id,
          appointment_id: appointment.id,
          invoice_id: invoice.id,
          payment_id: String(payment.id),
          source: "public_booking_paynow",
        },
      },
      execution.requestOptions(`public-paynow-${String(payment.id)}`),
    );

    const { error: updateError } = await admin
      .from("payments")
      .update({
        provider: "stripe",
        provider_payment_id: intent.id,
        amount: balanceDue,
        metadata: {
          ...object(payment.metadata),
          source: "public_booking_paynow",
          appointment_id: appointment.id,
          stripe_payment_intent: intent.id,
        },
      })
      .eq("workspace_id", workspace.id)
      .eq("id", String(payment.id));
    if (updateError) throw updateError;

    return json({
      data: {
        payment_id: payment.id,
        client_secret: intent.client_secret,
        amount: balanceDue,
        currency,
        mode: execution.mode,
        ...clientStripeConfig(execution),
        reused: false,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
