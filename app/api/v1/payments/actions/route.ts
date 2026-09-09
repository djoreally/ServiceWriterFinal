import Stripe from "stripe";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchPaymentLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { markStripeInvoicePaidOutOfBand, syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = object(value);
  return text(record.id);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "USD"): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { style: "currency", currency })
    : String(value ?? "");
}

async function resolveRefundTarget(stripe: Stripe, stripeAccountId: string, providerPaymentId: string) {
  if (providerPaymentId.startsWith("pi_")) {
    return { payment_intent: providerPaymentId } as const;
  }
  if (providerPaymentId.startsWith("ch_")) {
    return { charge: providerPaymentId } as const;
  }
  if (!providerPaymentId.startsWith("in_")) {
    throw new Error("Stripe payment reference is not refundable.");
  }

  const invoicePayments = await (stripe as any).invoicePayments.list({
    invoice: providerPaymentId,
    status: "paid",
    limit: 10,
  }, {
    stripeAccount: stripeAccountId,
  });

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
    const { supabase } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist"],
      request,
    );

    if (body.action === "send_manual_invoice") {
      const [{ data: invoice, error: invoiceError }, { data: workspace, error: workspaceError }] = await Promise.all([
        supabase
          .from("invoices")
          .select("id,workspace_id,invoice_number,subtotal,tax_total,total,currency_code,due_at,metadata,invoice_lines(description,quantity,unit_price,line_total,sort_order),customers(first_name,last_name,email)")
          .eq("workspace_id", body.workspace_id)
          .eq("id", body.invoice_id)
          .single(),
        supabase
          .from("workspaces")
          .select("name")
          .eq("id", body.workspace_id)
          .single(),
      ]);
      if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
      if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace not found");

      const invoiceMetadata = object(invoice.metadata);
      const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
      const recipient = body.recipient_email
        ?? text(invoiceMetadata.contact_email)
        ?? customer?.email
        ?? null;
      if (!recipient) {
        return json({ error: { code: "customer_email_required", message: "Recipient email is required to send this invoice." } }, { status: 422 });
      }

      const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")
        || text(invoiceMetadata.contact_name)
        || "Customer";
      const currency = invoice.currency_code || "USD";
      const subject = body.subject?.trim()
        || `Invoice ${invoice.invoice_number} from ${workspace.name} — ${money(invoice.total, currency)}`;
      const intro = body.message?.trim()
        || `Hi ${customerName},\n\nPlease find your invoice ${invoice.invoice_number} below. Let us know if you have any questions.\n\nThanks,\n${workspace.name}`;
      const lines = [...(invoice.invoice_lines ?? [])].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      const lineText = lines.length
        ? lines.map((line) => `${line.description} — ${line.quantity} × ${money(line.unit_price, currency)} = ${money(line.line_total ?? Number(line.quantity) * Number(line.unit_price), currency)}`).join("\n")
        : "No line items";
      const plainText = `${intro}\n\nInvoice ${invoice.invoice_number}\n${lineText}\n\nSubtotal: ${money(invoice.subtotal, currency)}\nTax: ${money(invoice.tax_total, currency)}\nTotal: ${money(invoice.total, currency)}${invoice.due_at ? `\nDue: ${new Date(invoice.due_at).toLocaleDateString("en-US")}` : ""}`;
      const rowsHtml = lines.length
        ? lines.map((line) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(line.description)}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(line.quantity)}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(money(line.unit_price, currency))}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(money(line.line_total ?? Number(line.quantity) * Number(line.unit_price), currency))}</td></tr>`).join("")
        : `<tr><td colspan="4" style="padding:12px 8px">No line items</td></tr>`;
      const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="padding:24px;border-bottom:1px solid #e5e7eb"><div style="font-size:13px;color:#6b7280">${escapeHtml(workspace.name)}</div><h1 style="margin:6px 0 0;font-size:24px">Invoice ${escapeHtml(invoice.invoice_number)}</h1></div><div style="padding:24px"><div style="white-space:pre-line;line-height:1.6;margin-bottom:24px">${escapeHtml(intro).replaceAll("\n", "<br>")}</div><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="padding:10px 8px;text-align:left;border-bottom:2px solid #111827">Item</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Qty</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Rate</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table><div style="margin-top:20px;margin-left:auto;max-width:280px"><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Subtotal</span><strong>${escapeHtml(money(invoice.subtotal, currency))}</strong></div><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Tax</span><strong>${escapeHtml(money(invoice.tax_total, currency))}</strong></div><div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827;font-size:18px"><span>Total</span><strong>${escapeHtml(money(invoice.total, currency))}</strong></div>${invoice.due_at ? `<div style="text-align:right;color:#6b7280;font-size:13px">Due ${escapeHtml(new Date(invoice.due_at).toLocaleDateString("en-US"))}</div>` : ""}</div></div></div></div></body></html>`;

      const idempotencyKey = `manual-invoice:${invoice.id}:${Date.now()}:${crypto.randomUUID()}`;
      const requestPayload = {
        workspaceId: body.workspace_id,
        recipient: { email: recipient },
        purpose: "transactional" as const,
        templateKey: "manual_invoice",
        subject,
        body: plainText,
        html,
        fromName: workspace.name,
        idempotencyKey,
        metadata: { invoiceId: invoice.id },
      };

      let sent;
      try {
        sent = await new ResendEmailAdapter().send(requestPayload);
      } catch (primaryError) {
        if (!process.env.ENGINEMAILER_API_KEY?.trim()) throw primaryError;
        sent = await new EnginemailerEmailAdapter().send(requestPayload);
      }

      const sentAt = new Date().toISOString();
      const { error: logError } = await supabase.from("message_logs").insert({
        workspace_id: body.workspace_id,
        customer_id: null,
        channel: "email",
        purpose: "transactional",
        provider: sent.providerName,
        idempotency_key: idempotencyKey,
        recipient_email: recipient.toLowerCase(),
        template_key: "manual_invoice",
        subject,
        body_redacted: plainText.slice(0, 240),
        status: sent.status,
        provider_message_id: sent.providerMessageId,
        sent_at: sent.acceptedAt || sentAt,
        consent_checked_at: sentAt,
        suppression_checked_at: sentAt,
        metadata: { invoiceId: invoice.id, source: "invoice_send_dialog" },
      });
      if (logError) console.error("[manual-invoice] email sent but message log write failed", logError);

      return json({ data: { recipient, provider: sent.providerName, provider_message_id: sent.providerMessageId } });
    }

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

      const metadata = object(current.metadata);
      const operational = object(settings.operational_settings);
      const stripeAccountId = text(metadata.stripe_account_id) ?? text(operational.stripe_account_id);
      const providerPaymentId = text(current.provider_payment_id) ?? text(metadata.stripe_invoice_id);
      if (!stripeAccountId) throw new Error("Connected Stripe account is missing for this workspace.");
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

      const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
      const refundTarget = await resolveRefundTarget(stripe, stripeAccountId, providerPaymentId);
      const nextRefundCents = existingRefundCents + requestedRefundCents;
      const refund = await stripe.refunds.create({
        ...refundTarget,
        amount: requestedRefundCents,
        reason: "requested_by_customer",
        metadata: {
          servicewriter_payment_id: current.id,
          workspace_id: body.workspace_id,
          servicewriter_reason: body.reason ?? "",
        },
      }, {
        stripeAccount: stripeAccountId,
        idempotencyKey: `sw-refund-${current.id}-${nextRefundCents}`,
      });

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
            stripe_account_id: stripeAccountId,
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
