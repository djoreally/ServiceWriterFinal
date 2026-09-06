import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function reconcileInvoiceEvent(event: Stripe.Event, invoice: Stripe.Invoice) {
  const paymentId = invoice.metadata?.payment_id;
  const workspaceId = invoice.metadata?.workspace_id;
  if (!paymentId || !workspaceId) {
    return { received: true, ignored: "missing_invoice_metadata" };
  }

  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("payments")
    .select("id,workspace_id,status,provider,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return { received: true, ignored: "payment_not_found" };

  const metadata = object(current.metadata);
  const paid = event.type === "invoice.paid" || event.type === "invoice.payment_succeeded";
  const failed = event.type === "invoice.payment_failed";
  if (!paid && !failed) return { received: true, ignored: "invoice_event_not_actionable" };

  const amountDollars = Number(((invoice.amount_paid ?? 0) / 100).toFixed(2));
  const paidAtUnix = invoice.status_transitions?.paid_at ?? event.created;
  const recordedManually = metadata.recorded_manually === true;

  const update: Record<string, unknown> = {
    status: paid ? "succeeded" : "failed",
    ...(recordedManually ? {} : { provider: "stripe" }),
    ...(paid && amountDollars > 0 ? { amount: amountDollars } : {}),
    ...(recordedManually ? {} : { provider_payment_id: invoice.id }),
    paid_at: paid ? new Date(paidAtUnix * 1000).toISOString() : null,
    metadata: {
      ...metadata,
      stripe_invoice_id: invoice.id,
      stripe_event_id: event.id,
      stripe_invoice_status: invoice.status,
      stripe_hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      stripe_reconciled_at: new Date(event.created * 1000).toISOString(),
    },
  };

  const query = admin
    .from("payments")
    .update(update)
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId);
  const { error: updateError } = failed
    ? await query.in("status", ["pending", "failed"])
    : await query;
  if (updateError) throw updateError;

  return { received: true };
}

async function reconcileCheckoutEvent(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.payment_id;
  const workspaceId = session.metadata?.workspace_id;
  if (!paymentId || !workspaceId) {
    return { received: true, ignored: "missing_payment_metadata" };
  }

  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("payments")
    .select("id,workspace_id,status,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return { received: true, ignored: "payment_not_found" };

  const metadata = object(current.metadata);
  const failed = event.type === "checkout.session.async_payment_failed";
  const providerPaymentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.id;
  const amountDollars = session.amount_total == null
    ? undefined
    : Number((session.amount_total / 100).toFixed(2));

  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: failed ? "failed" : "succeeded",
      provider: "stripe",
      provider_payment_id: providerPaymentId,
      ...(amountDollars === undefined ? {} : { amount: amountDollars }),
      paid_at: failed ? null : new Date(event.created * 1000).toISOString(),
      metadata: {
        ...metadata,
        checkout_session_id: session.id,
        stripe_event_id: event.id,
        stripe_payment_status: session.payment_status,
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId);
  if (updateError) throw updateError;

  return { received: true };
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });

  try {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
    const event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      required("STRIPE_WEBHOOK_SECRET"),
    );

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      return Response.json(await reconcileInvoiceEvent(event, event.data.object as Stripe.Invoice));
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      return Response.json(await reconcileCheckoutEvent(event, event.data.object as Stripe.Checkout.Session));
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] reconciliation failed", error);
    return new Response("Webhook error", { status: 400 });
  }
}
