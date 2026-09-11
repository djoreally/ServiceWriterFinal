import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  directWebhookSecret,
  resolveStripeWorkspaceExecution,
  stripePaymentMode,
} from "@/server/payments/stripe-workspace-execution";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function loadWorkspaceStripe(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data: settings, error } = await admin
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  if (stripePaymentMode(settings.operational_settings) !== "direct") {
    throw new Error("Workspace is not configured for direct Stripe mode");
  }
  const secret = await directWebhookSecret(workspaceId, settings.operational_settings);
  if (!secret) throw new Error("Direct Stripe webhook secret is not configured");
  return {
    admin,
    secret,
    execution: await resolveStripeWorkspaceExecution(workspaceId, settings.operational_settings),
  };
}

async function beginEvent(admin: ReturnType<typeof createSupabaseAdminClient>, workspaceId: string, event: Stripe.Event) {
  const { error } = await admin.from("webhook_events").insert({
    workspace_id: workspaceId,
    provider: "stripe",
    external_event_id: event.id,
    event_type: event.type,
    signature_verified: true,
    status: "processing",
    payload: JSON.parse(JSON.stringify(event)),
  });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw error;
}

async function finishEvent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string,
) {
  const { error } = await admin
    .from("webhook_events")
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("provider", "stripe")
    .eq("external_event_id", eventId);
  if (error) throw error;
}

async function reconcileInvoice(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
) {
  const paymentId = invoice.metadata?.payment_id;
  if (!paymentId || invoice.metadata?.workspace_id !== workspaceId) return false;

  const { data: current, error: currentError } = await admin
    .from("payments")
    .select("id,status,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return false;

  const paid = event.type === "invoice.paid" || event.type === "invoice.payment_succeeded";
  const failed = event.type === "invoice.payment_failed";
  if (!paid && !failed) return false;

  const metadata = object(current.metadata);
  const amount = Number(((invoice.amount_paid ?? 0) / 100).toFixed(2));
  const paidAtUnix = invoice.status_transitions?.paid_at ?? event.created;
  const { error } = await admin
    .from("payments")
    .update({
      status: paid ? "succeeded" : "failed",
      provider: "stripe",
      ...(paid && amount > 0 ? { amount } : {}),
      provider_payment_id: invoice.id,
      paid_at: paid ? new Date(paidAtUnix * 1000).toISOString() : null,
      metadata: {
        ...metadata,
        stripe_invoice_id: invoice.id,
        stripe_event_id: event.id,
        stripe_invoice_status: invoice.status,
        stripe_hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        stripe_payment_mode: "direct",
        stripe_reconciled_at: new Date(event.created * 1000).toISOString(),
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId);
  if (error) throw error;
  return true;
}

async function reconcileCheckout(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const paymentId = session.metadata?.payment_id;
  if (!paymentId || session.metadata?.workspace_id !== workspaceId) return false;
  const failed = event.type === "checkout.session.async_payment_failed";
  const providerPaymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const amount = session.amount_total == null ? undefined : Number((session.amount_total / 100).toFixed(2));

  const { data: current, error: currentError } = await admin
    .from("payments")
    .select("id,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return false;

  const { error } = await admin
    .from("payments")
    .update({
      status: failed ? "failed" : "succeeded",
      provider: "stripe",
      provider_payment_id: providerPaymentId,
      ...(amount === undefined ? {} : { amount }),
      paid_at: failed ? null : new Date(event.created * 1000).toISOString(),
      metadata: {
        ...object(current.metadata),
        checkout_session_id: session.id,
        stripe_event_id: event.id,
        stripe_payment_status: session.payment_status,
        stripe_payment_mode: "direct",
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId);
  if (error) throw error;
  return true;
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event | null = null;
  const { admin, secret, execution } = await loadWorkspaceStripe(workspaceId);
  try {
    event = execution.stripe.webhooks.constructEvent(await request.text(), signature, secret);
    const inserted = await beginEvent(admin, workspaceId, event);
    if (!inserted) return Response.json({ received: true, duplicate: true });

    let handled = false;
    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      handled = await reconcileInvoice(admin, workspaceId, event, event.data.object as Stripe.Invoice);
    } else if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      handled = await reconcileCheckout(admin, workspaceId, event, event.data.object as Stripe.Checkout.Session);
    }

    await finishEvent(admin, event.id, handled ? "processed" : "ignored");
    return Response.json({ received: true, handled });
  } catch (error) {
    console.error("[stripe-direct-webhook] reconciliation failed", error);
    if (event) {
      try {
        await finishEvent(admin, event.id, "failed", error instanceof Error ? error.message : "Unknown error");
      } catch (ledgerError) {
        console.error("[stripe-direct-webhook] ledger update failed", ledgerError);
      }
    }
    return new Response("Webhook error", { status: 400 });
  }
}
