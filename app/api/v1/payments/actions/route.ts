import Stripe from "stripe";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchPaymentLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);

    if (body.action === "manual_payment") {
      if (body.waive_fees || body.waive_tax || body.waive_remaining) {
        return json({ error: { code: "adjustment_required", message: "Fee, tax, and remaining-balance waivers require the adjustment workflow and cannot be embedded in a payment receipt." } }, { status: 409 });
      }

      const { data: current, error: currentError } = await supabase
        .from("payments")
        .select("id,invoice_id,customer_id,status,metadata")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .single();
      if (currentError || !current) throw currentError ?? new Error("Payment not found");
      if (current.status === "succeeded") {
        return json({ data: { success: true, payment_id: current.id, already_recorded: true } });
      }
      if (current.status === "refunded" || current.status === "partially_refunded") {
        return json({ error: { code: "invalid_payment_state", message: "A refunded payment cannot be re-recorded as a manual payment." } }, { status: 409 });
      }

      // ManualPaymentDialog is the one legacy boundary that submits integer cents.
      // Canonical payments.amount is always stored in dollars.
      const amountDollars = Number((body.amount / 100).toFixed(2));
      if (amountDollars <= 0) {
        return json({ error: { code: "invalid_amount", message: "Payment amount must be greater than zero." } }, { status: 400 });
      }

      const metadata = object(current.metadata);
      const { data, error } = await (supabase.from("payments") as any)
        .update({
          amount: amountDollars,
          status: "succeeded",
          provider: "other",
          paid_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            payment_method: body.payment_method,
            notes: body.notes ?? null,
            recorded_manually: true,
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .select()
        .single();
      if (error) throw error;

      return json({ data: { success: true, payment_id: data.id, amount: data.amount, status: data.status } });
    }

    if (body.action === "payment_link" || body.action === "send_invoice") {
      const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
        .select("id,workspace_id,invoice_id,customer_id,status,amount,currency_code,metadata,customers(first_name,last_name,email),invoices(invoice_number,total,status)")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.payment_id)
        .single();
      if (paymentError || !payment) throw paymentError ?? new Error("Payment not found");
      if (payment.status === "succeeded") {
        return json({ error: { code: "already_paid", message: "This balance has already been paid." } }, { status: 409 });
      }
      if (!payment.invoice_id) {
        return json({ error: { code: "invoice_required", message: "A payment link requires a canonical invoice." } }, { status: 409 });
      }

      const { data: settings, error: settingsError } = await supabase
        .from("workspace_settings")
        .select("operational_settings")
        .eq("workspace_id", body.workspace_id)
        .single();
      if (settingsError) throw settingsError;
      const operational = object(settings?.operational_settings);
      const stripeAccountId = typeof operational.stripe_account_id === "string"
        ? operational.stripe_account_id.trim()
        : "";
      if (!stripeAccountId || operational.stripe_charges_enabled !== true) {
        return json({ error: { code: "stripe_not_ready", message: "Stripe must be connected with charges enabled before sending a payment link." } }, { status: 409 });
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

      const amountDollars = Number(payment.amount);
      const amountCents = Math.round(amountDollars * 100);
      if (!Number.isFinite(amountDollars) || amountCents <= 0) {
        return json({ error: { code: "invalid_amount", message: "Payment balance must be greater than zero." } }, { status: 409 });
      }

      const paymentMetadata = object(payment.metadata);
      const origin = new URL(request.url).origin;
      const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customerEmail,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: String(payment.currency_code || "USD").toLowerCase(),
            unit_amount: amountCents,
            product_data: {
              name: body.action === "payment_link" && body.description
                ? body.description
                : `Invoice #${payment.invoices?.invoice_number ?? payment.invoice_id}`,
            },
          },
        }],
        metadata: {
          payment_id: payment.id,
          workspace_id: body.workspace_id,
          invoice_id: payment.invoice_id,
          appointment_id: String(paymentMetadata.appointment_id ?? ""),
        },
        success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/payments`,
      }, { stripeAccount: stripeAccountId });

      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      const sentAt = new Date().toISOString();
      const { data: updated, error: updateError } = await (supabase.from("payments") as any)
        .update({
          provider: "stripe",
          provider_payment_id: session.id,
          metadata: {
            ...paymentMetadata,
            payment_url: session.url,
            checkout_session_id: session.id,
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
        eventId: `${payment.id}:requested:${session.id}`,
        payment: {
          ...updated,
          customer_email: customerEmail,
          customer_name: customerName,
          invoice_number: payment.invoices?.invoice_number ?? null,
        },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: session.url,
      });

      return json({ data: { url: session.url, email_sent: true, payment_id: payment.id, invoice_id: payment.invoice_id } });
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
