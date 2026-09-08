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

function eventWorkspaceId(event: Stripe.Event): string | null {
  const data = object(event.data?.object);
  const metadata = object(data.metadata);
  const workspaceId = metadata.workspace_id;
  return typeof workspaceId === "string" && workspaceId.trim() ? workspaceId : null;
}

async function beginWebhookEvent(event: Stripe.Event) {
  const admin = createSupabaseAdminClient();
  const workspaceId = eventWorkspaceId(event);
  const payload = JSON.parse(JSON.stringify(event));

  const { error: insertError } = await admin.from("webhook_events").insert({
    workspace_id: workspaceId,
    provider: "stripe",
    external_event_id: event.id,
    event_type: event.type,
    signature_verified: true,
    status: "processing",
    payload,
  });

  if (!insertError) return { duplicate: false, admin };
  if ((insertError as { code?: string }).code !== "23505") throw insertError;

  const { data: existing, error: existingError } = await admin
    .from("webhook_events")
    .select("status")
    .eq("provider", "stripe")
    .eq("external_event_id", event.id)
    .single();
  if (existingError) throw existingError;

  if (existing.status !== "failed") {
    return { duplicate: true, admin };
  }

  const { error: retryError } = await admin
    .from("webhook_events")
    .update({
      workspace_id: workspaceId,
      event_type: event.type,
      signature_verified: true,
      status: "processing",
      payload,
      error_message: null,
      processed_at: null,
    })
    .eq("provider", "stripe")
    .eq("external_event_id", event.id)
    .eq("status", "failed");
  if (retryError) throw retryError;

  return { duplicate: false, admin };
}

async function finishWebhookEvent(
  event: Stripe.Event,
  status: "processed" | "failed" | "ignored",
  errorMessage?: string,
) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("webhook_events")
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("provider", "stripe")
    .eq("external_event_id", event.id);
  if (error) throw error;
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

  let event: Stripe.Event | null = null;
  try {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      required("STRIPE_WEBHOOK_SECRET"),
    );

    const ingress = await beginWebhookEvent(event);
    if (ingress.duplicate) {
      return Response.json({ received: true, duplicate: true });
    }

    let result: Record<string, unknown> = { received: true };

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      result = await reconcileInvoiceEvent(event, event.data.object as Stripe.Invoice);
    } else if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      result = await reconcileCheckoutEvent(event, event.data.object as Stripe.Checkout.Session);
    } else {
      result = { received: true, ignored: "unsupported_event_type" };
    }

    await finishWebhookEvent(event, result.ignored ? "ignored" : "processed");
    return Response.json(result);
  } catch (error) {
    console.error("[stripe-webhook] reconciliation failed", error);
    if (event) {
      try {
        await finishWebhookEvent(
          event,
          "failed",
          error instanceof Error ? error.message : "Unknown Stripe webhook error",
        );
      } catch (ledgerError) {
        console.error("[stripe-webhook] failed to update webhook ledger", ledgerError);
      }
    }
    return new Response("Webhook error", { status: 400 });
  }
}
