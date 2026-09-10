import { errorResponse, json, requireWorkspaceMember, requireWorkspacePaymentsAddon } from "@/server/api";
import { dispatchPaymentLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
import { markStripeInvoicePaidOutOfBand, syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
import { resolveStripeWorkspaceExecution, type StripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refund"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), amount: z.number().positive(), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal("send_invoice"), workspace_id: z.string().uuid(), payment_id: z.string().uuid() }),
  z.object({ action: z.literal("send_manual_invoice"), workspace_id: z.string().uuid(), invoice_id: z.string().uuid(), recipient_email: z.string().email().optional(), subject: z.string().max(200).optional(), message: z.string().max(10000).optional() }),
  z.object({ action: z.literal("payment_link"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), customer_email: z.string().email().optional(), customer_name: z.string().max(200).optional(), description: z.string().max(500).optional() }),
  z.object({ action: z.literal("manual_payment"), workspace_id: z.string().uuid(), payment_id: z.string().uuid(), amount: z.number().positive(), payment_method: z.string().max(40), notes: z.string().max(1000).optional(), waive_fees: z.boolean().optional(), waive_tax: z.boolean().optional(), waive_remaining: z.boolean().optional() }),
  z.object({ action: z.literal("verify_booking"), workspace_id: z.string().uuid(), session_id: z.string().min(1).max(200) }),
]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  return text(object(value).id);
}

async function resolveRefundTarget(execution: StripeWorkspaceExecution, providerPaymentId: string) {
  if (providerPaymentId.startsWith("pi_")) return { payment_intent: providerPaymentId } as const;
  if (providerPaymentId.startsWith("ch_")) return { charge: providerPaymentId } as const;
  if (!providerPaymentId.startsWith("in_")) {
    throw new Error("Stripe payment reference is not refundable.");
  }

  const invoicePayments = await (execution.stripe as any).invoicePayments.list({
    invoice: providerPaymentId,
    status: "paid",
    limit: 10,
  }, execution.requestOptions());

  for (const invoicePayment of invoicePayments.data ?? []) {
    const payment = object(invoicePayment.payment);
    const paymentIntentId = stripeObjectId(payment.payment_intent);
    if (paymentIntentId?.startsWith("pi_")) return { payment_intent: paymentIntentId } as const;
    const chargeId = stripeObjectId(payment.charge);
    if (chargeId?.startsWith("ch_")) return { charge: chargeId } as const;
  }

  throw new Error("No refundable Stripe payment was found for this invoice.");
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const roles = ["owner", "admin", "manager", "service_advisor", "receptionist"];

    if (body.action === "send_manual_invoice") {
      await requireWorkspaceMember(body.workspace_id, roles, request);
      return json({
        error: {
          code: "invoice_domain_required",
          message: "Manual invoice delivery has moved to /api/v1/invoices/{id}/send.",
        },
      }, { status: 410 });
    }

    const { supabase } = await requireWorkspacePaymentsAddon(body.workspace_id, roles, request);

    if (body.action === "refund") {
      const [{ data: current, error: currentError }, { data: settings, error: settingsError }] = await Promise.all([
        supabase
          .from("payments")
          .select("id,invoice_id,status,amount,provider,provider_payment_id,metadata")
          .eq("workspace_id", body.workspace_id)
          .eq("id", body.payment_id)
          .single(),
        supabase
          .from("workspace_settings")
          .select("payment_provider,operational_settings")
          .eq("workspace_id", body.workspace_id)
          .single(),
      ]);
      if (currentError || !current) throw currentError ?? new Error("Payment not found");
      if (settingsError || !settings) throw settingsError ?? new Error("Workspace payment settings not found");
      if (current.status !== "succeeded" && current.status !== "partially_refunded") {
        return json({ error: { code: "invalid_payment_state", message: "Only succeeded or partially refunded payments can be refunded." } }, { status: 409 });
      }
      if (current.provider !== "stripe") {
        return json({ error: { code: "stripe_payment_required", message: "Only Stripe payments can be refunded through this provider action." } }, { status: 409 });
      }
      if (settings.payment_provider !== "stripe") {
        return json({ error: { code: "active_provider_not_stripe", message: "Stripe is not the active payment provider for this workspace." } }, { status: 409 });
      }

      const metadata = object(current.metadata);
      const operational = object(settings.operational_settings);
      const execution = resolveStripeWorkspaceExecution(operational);
      const recordedAccountId = text(metadata.stripe_account_id);
      if (recordedAccountId && recordedAccountId !== execution.accountId) {
        return json({ error: { code: "stripe_account_mismatch", message: "This payment belongs to a different Stripe account context." } }, { status: 409 });
      }

      const providerPaymentId = text(current.provider_payment_id) ?? text(metadata.stripe_invoice_id);
      if (!providerPaymentId) throw new Error("Stripe payment reference is missing from this payment.");

      const paymentAmountCents = Math.round(Number(current.amount ?? 0) * 100);
      const existingRefundCents = Math.round(Number(metadata.refunded_amount ?? 0) * 100);
      const requestedRefundCents = Math.round(body.amount);
      const remainingCents = paymentAmountCents - existingRefundCents;
      if (requestedRefundCents <= 0) {
        return json({ error: { code: "invalid_refund_amount", message: "Refund amount must be greater than zero." } }, { status: 400 });
      }
      if (requestedRefundCents > remainingCents) {
        return json({ error: { code: "refund_exceeds_remaining", message: "Refund amount exceeds the remaining refundable balance." } }, { status: 409 });
      }

      const refundTarget = await resolveRefundTarget(execution, providerPaymentId);
      const nextRefundCents = existingRefundCents + requestedRefundCents;
      const refund = await execution.stripe.refunds.create({
        ...refundTarget,
        amount: requestedRefundCents,
        reason: "requested_by_customer",
        metadata: {
          servicewriter_payment_id: current.id,
          workspace_id: body.workspace_id,
          servicewriter_reason: body.reason ?? "",
        },
      }, execution.requestOptions(`sw-refund-${current.id}-${nextRefundCents}`));

      const fullyRefunded = nextRefundCents >= paymentAmountCents;
      const refundedDollars = Number((nextRefundCents / 100).toFixed(2));
      const { data: updated, error: updateError } = await (supabase.from("payments") as any)
        .update({
          status: fullyRefunded ? "refunded" : "partially_refunded",
          metadata: {
            ...metadata,
            refunded_amount: refundedDollars,
            last_refund_amount: Number((requestedRefundCents / 100).toFixed(2)),
            last_refund_id: refund.id,
            last_refund_reason: body.reason ?? null,
            last_refunded_at: new Date().toISOString(),
            stripe_account_id: execution.accountId,
            stripe_payment_mode: execution.mode,
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("id", current.id)
        .select("id,status,metadata")
        .single();
      if (updateError) throw updateError;

      return json({
        data: {
          success: true,
          refund_id: refund.id,
          amount_refunded: requestedRefundCents,
          total_refunded: nextRefundCents,
          status: updated.status,
          payment_mode: execution.mode,
        },
      });
    }

    if (body.action === "manual_payment") {
      if (body.waive_fees || body.waive_tax || body.waive_remaining) {
        return json({ error: { code: "adjustment_required", message: "Fee, tax, and remaining-balance waivers require the adjustment workflow and cannot be embedded in a payment receipt." } }, { status: 409 });
      }

      const { data: current, error: currentError } = await supabase
        .from("payments")
        .select("id,invoice_id,customer_id,status,amount,metadata")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .single();
      if (currentError || !current) throw currentError ?? new Error("Payment not found");
      if (current.status === "refunded" || current.status === "partially_refunded") {
        return json({ error: { code: "invalid_payment_state", message: "A refunded payment cannot be re-recorded as a manual payment." } }, { status: 409 });
      }

      const amountDollars = Number((body.amount / 100).toFixed(2));
      if (amountDollars <= 0) {
        return json({ error: { code: "invalid_amount", message: "Payment amount must be greater than zero." } }, { status: 400 });
      }
      if (Math.abs(amountDollars - Number(current.amount || 0)) > 0.009) {
        return json({ error: { code: "amount_mismatch", message: "In-person closeout must settle the finalized balance exactly." } }, { status: 409 });
      }

      const metadata = object(current.metadata);
      if (current.status === "succeeded") {
        return json({ data: { success: true, payment_id: current.id, already_recorded: true, stripe_sync: metadata.stripe_out_of_band_sync_status ?? "unknown" } });
      }

      let stripeSync: Record<string, unknown> = { status: "skipped" };
      try {
        stripeSync = await markStripeInvoicePaidOutOfBand({
          supabase,
          workspaceId: body.workspace_id,
          invoiceId: current.invoice_id,
        });
      } catch (stripeError) {
        stripeSync = {
          status: "failed",
          error: stripeError instanceof Error ? stripeError.message : "Stripe out-of-band reconciliation failed",
        };
      }

      const paidAt = new Date().toISOString();
      const { data, error } = await (supabase.from("payments") as any)
        .update({
          amount: amountDollars,
          status: "succeeded",
          provider: "other",
          paid_at: paidAt,
          metadata: {
            ...metadata,
            payment_method: body.payment_method,
            notes: body.notes ?? null,
            recorded_manually: true,
            received_in_person: true,
            stripe_out_of_band_sync_status: stripeSync.status,
            ...(stripeSync.status === "failed" ? { stripe_out_of_band_sync_error: stripeSync.error } : {}),
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .select()
        .single();
      if (error) throw error;

      return json({ data: { success: true, payment_id: data.id, amount: data.amount, status: data.status, stripe_sync: stripeSync } });
    }

    if (body.action === "payment_link" || body.action === "send_invoice") {
      const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
        .select("id,workspace_id,invoice_id,customer_id,status,amount,currency_code,metadata,customers(first_name,last_name,email),invoices(invoice_number,total,status,metadata)")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .single();
      if (paymentError || !payment) throw paymentError ?? new Error("Payment not found");
      if (payment.status === "succeeded") {
        return json({ error: { code: "already_paid", message: "This balance has already been paid." } }, { status: 409 });
      }
      if (!payment.invoice_id) {
        return json({ error: { code: "invoice_required", message: "A payment request requires a canonical invoice." } }, { status: 409 });
      }

      const paymentMetadata = object(payment.metadata);
      const sync = await syncCanonicalInvoiceToStripe({
        supabase,
        workspaceId: body.workspace_id,
        appointmentId: typeof paymentMetadata.appointment_id === "string" ? paymentMetadata.appointment_id : null,
        invoiceId: payment.invoice_id,
        paymentId: payment.id,
      });
      if (sync.provider !== "stripe") {
        return json({ error: { code: "active_provider_not_stripe", message: `The active payment provider is ${sync.provider}; Stripe was not invoked.` } }, { status: 409 });
      }
      if (!sync.hostedInvoiceUrl) {
        return json({ error: { code: "stripe_invoice_url_missing", message: "Stripe invoice was synchronized but did not return a hosted invoice URL." } }, { status: 502 });
      }

      const customer = Array.isArray(payment.customers) ? payment.customers[0] : payment.customers;
      const suppliedEmail = body.action === "payment_link" ? body.customer_email : undefined;
      const customerEmail = suppliedEmail || customer?.email || null;
      if (!customerEmail) {
        return json({ error: { code: "customer_email_required", message: "Customer email is required to send a payment request." } }, { status: 422 });
      }
      const customerName = body.action === "payment_link" && body.customer_name
        ? body.customer_name
        : [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";

      const sentAt = new Date().toISOString();
      const { data: updated, error: updateError } = await (supabase.from("payments") as any)
        .update({
          provider: "stripe",
          metadata: {
            ...paymentMetadata,
            payment_url: sync.hostedInvoiceUrl,
            stripe_invoice_id: sync.stripeInvoiceId,
            stripe_customer_id: sync.stripeCustomerId,
            invoice_sent_at: sentAt,
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("id", payment.id)
        .select()
        .single();
      if (updateError) throw updateError;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name,timezone")
        .eq("id", body.workspace_id)
        .single();
      await dispatchPaymentLifecycle({
        eventKey: LIFECYCLE_EVENT_KEYS.paymentRequested,
        eventId: `${payment.id}:requested:${sync.stripeInvoiceId ?? payment.invoice_id}`,
        payment: {
          ...updated,
          customer_email: customerEmail,
          customer_name: customerName,
          invoice_number: payment.invoices?.invoice_number ?? null,
        },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: sync.hostedInvoiceUrl,
      });

      return json({
        data: {
          url: sync.hostedInvoiceUrl,
          email_sent: true,
          payment_id: payment.id,
          invoice_id: payment.invoice_id,
          stripe_invoice_id: sync.stripeInvoiceId,
          stripe_customer_id: sync.stripeCustomerId,
        },
      });
    }

    return json({
      error: {
        code: "action_not_implemented",
        message: `${body.action} is not available from this closeout endpoint.`,
      },
    }, { status: 501 });
  } catch (error) {
    return errorResponse(error);
  }
}
