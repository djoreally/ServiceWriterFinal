import { ApiError, errorResponse, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  assertWorkspacePaymentsEnabled,
  findAppointmentInvoice,
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
  payment_intent_id: z.string().trim().min(1).max(255),
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Public pay-now, step 2: settle a booking payment after the client
 * confirms the card with Stripe.
 *
 * Nothing here trusts the client: the intent is re-read from Stripe with
 * the workspace's execution, its metadata must point back at this exact
 * payment row, and the received amount must equal the recorded amount
 * before anything is marked paid. On success the payment row is marked
 * succeeded and the invoice rollup (amount_paid, status) is recomputed
 * from the invoice's succeeded payments — the same settled state the
 * owner-side manual payment flow produces. Safe to call repeatedly.
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
    await assertWorkspacePaymentsEnabled(admin, workspace.id);

    const invoice = await findAppointmentInvoice(admin, workspace.id, appointment.id);
    if (!invoice) {
      throw new ApiError(
        404,
        "No billable invoice exists for this booking yet.",
        "payment_invoice_not_found",
      );
    }

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id,status,amount,provider_payment_id,metadata")
      .eq("workspace_id", workspace.id)
      .eq("invoice_id", invoice.id)
      .eq("provider_payment_id", body.payment_intent_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      throw new ApiError(404, "Payment not found for this booking.", "payment_not_found");
    }

    if (payment.status === "succeeded") {
      return json({
        data: { success: true, settled: true, already_recorded: true, payment_id: payment.id },
      });
    }

    const execution = await loadWorkspaceStripeExecution(admin, workspace.id);
    const intent = await execution.stripe.paymentIntents.retrieve(
      body.payment_intent_id,
      {},
      execution.requestOptions(),
    );

    if (
      intent.metadata?.workspace_id !== workspace.id ||
      intent.metadata?.payment_id !== String(payment.id) ||
      intent.metadata?.appointment_id !== appointment.id
    ) {
      throw new ApiError(
        409,
        "This payment does not belong to this booking.",
        "payment_binding_mismatch",
      );
    }

    if (intent.status !== "succeeded") {
      return json({
        data: { success: false, settled: false, status: intent.status, payment_id: payment.id },
      });
    }

    const expectedCents = Math.round(Number(payment.amount ?? 0) * 100);
    if (intent.amount_received !== expectedCents) {
      throw new ApiError(
        409,
        "The paid amount does not match the booking balance.",
        "payment_amount_mismatch",
      );
    }

    const paidAt = new Date().toISOString();
    const { error: settleError } = await admin
      .from("payments")
      .update({
        status: "succeeded",
        provider: "stripe",
        paid_at: paidAt,
        metadata: {
          ...object(payment.metadata),
          source: "public_booking_paynow",
          appointment_id: appointment.id,
          stripe_payment_intent: intent.id,
          stripe_charge: intent.latest_charge ? String(intent.latest_charge) : null,
          settled_via: "public_confirm",
        },
      })
      .eq("workspace_id", workspace.id)
      .eq("id", String(payment.id));
    if (settleError) throw settleError;

    // Recompute the invoice rollup from its succeeded payments so the
    // invoice lands in the same state the owner-side flows produce.
    const { data: succeededPayments, error: rollupError } = await admin
      .from("payments")
      .select("amount")
      .eq("workspace_id", workspace.id)
      .eq("invoice_id", invoice.id)
      .eq("status", "succeeded");
    if (rollupError) throw rollupError;
    const amountPaid = Number(
      (succeededPayments ?? [])
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
        .toFixed(2),
    );
    if (invoice.status !== "void") {
      const { error: invoiceError } = await admin
        .from("invoices")
        .update({
          amount_paid: amountPaid,
          status: amountPaid >= invoice.total - 0.005 ? "paid" : "partially_paid",
        })
        .eq("workspace_id", workspace.id)
        .eq("id", invoice.id);
      if (invoiceError) throw invoiceError;
    }

    return json({
      data: {
        success: true,
        settled: true,
        already_recorded: false,
        payment_id: payment.id,
        amount_paid: amountPaid,
        invoice_status:
          invoice.status === "void"
            ? invoice.status
            : amountPaid >= invoice.total - 0.005
              ? "paid"
              : "partially_paid",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
