/**
 * MESSAGING domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/webhooks/enginemailer/route.ts (POST)
 * - app/api/v1/webhooks/resend/route.ts (POST)
 * - app/api/v1/webhooks/twilio/route.ts (POST)
 * - app/api/v1/webhooks/twilio/inbound/route.ts (POST)
 * - /v1/shop-agent/agentphone (POST, AgentPhone webhooks; signature-verified)
 * - /v1/shop-agent/sweep (POST, CRON_SECRET auth; deferred text-backs + nudge sweep)
 * - app/api/webhooks/stripe/route.ts (POST)
 * - app/api/webhooks/stripe/direct/[workspaceId]/route.ts (POST)
 * - app/api/v1/email-testing/send/route.ts (POST)
 * - app/api/v1/reviews/actions/route.ts (POST)
 * - app/api/v1/newsletter/preferences/route.ts (GET, POST)
 * - app/api/internal/crm/newsletter/weekly/route.ts (GET)
 *   (Phase 5: newsletter worker lives on the CRM internal lifecycle;
 *   the legacy duplicate Hono worker was removed)
 * - app/api/internal/notifications/push/outbox/route.ts (GET, POST)
 * - app/api/notifications/push/public-key/route.ts (GET)
 * - app/api/internal/lifecycle/outbox/route.ts (GET, POST)
 *
 * New in Phase 2 (no legacy route handler; replaces the client-side
 * direct-Supabase access in src/application/{commands,queries}/*):
 * - /v1/email-settings (GET, PUT), /v1/email-settings/encrypt-password (POST),
 *   /v1/email-settings/test-outgoing (POST), /v1/email-settings/test-incoming (POST)
 * - /v1/email-testing/data (GET), /v1/email-testing/queue (GET),
 *   /v1/email-testing/logs (GET); /v1/email-testing/send (POST) now resolves
 *   the workspace server-side from the auth token (+ selected_workspace_id hint)
 * - /v1/mobile-release-distribution (POST, edge-function proxy)
 * - /v1/newsletter/sequences (GET, POST), /v1/newsletter/templates (GET),
 *   /v1/newsletter/templates/:id (PATCH, PUT),
 *   /v1/newsletter/subscriber-count (GET), /v1/newsletter/unsubscribe (POST, public)
 * - /v1/notifications (GET, POST), /v1/notifications/read-all (PATCH),
 *   /v1/notifications/:id/read (PATCH), /v1/notifications/:id (DELETE),
 *   /v1/notifications/email (POST, send-email edge-function proxy)
 * - /v1/sms/messages (GET), /v1/sms/eligible-recipients (GET),
 *   /v1/sms/timeline (GET), /v1/sms/send (POST, edge-function proxy),
 *   /v1/sms/booking-lifecycle (POST, edge-function proxy)
 * - /v1/sms-credits/balance (GET), /v1/sms-credits/bundles (GET),
 *   /v1/sms-credits/purchases (GET), /v1/sms-credits/checkout (POST, proxy),
 *   /v1/sms-credits/threshold (PUT), /v1/sms-credits/channel-toggles (PUT)
 * - /v1/sms-preferences (GET, PUT)
 * - /v1/voice-agent/settings (GET, PUT), /v1/voice-agent/presence (GET, public),
 *   /v1/voice-agent/booking-tools (POST, public proxy),
 *   /v1/voice-agent/conversation-token (POST, public proxy),
 *   /v1/voice-agent/has (GET, public)
 * - /v1/admin/messaging-health (GET, platform admin),
 *   /v1/admin/webhook-events (GET, platform admin),
 *   /v1/admin/webhook-events/:id/replay (POST), /v1/admin/webhook-events/:id/dismiss (POST)
 * - /v1/internal-inbox/threads (GET), /v1/internal-inbox/threads/direct (POST),
 *   /v1/internal-inbox/threads/:threadId/messages (GET, POST),
 *   /v1/internal-inbox/threads/:threadId/read (POST),
 *   /v1/internal-inbox/dm-candidates (GET), /v1/internal-inbox/messages (GET),
 *   /v1/internal-inbox/me (GET)
 * - /v1/tech-push/subscriptions (POST)
 *
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix.
 *
 * Webhook routes are PUBLIC (no auth) and verify provider signatures against
 * the RAW request body; handlers read `request.text()` exactly as the originals
 * did and pass the raw Request (`c.req.raw`) to the adapters.
 */
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { NextResponse } from "next/server";
// Server-side Hono route: Stripe SDK usage here is backend code, not frontend.
// eslint-disable-next-line no-restricted-imports
import Stripe from "stripe";
import { z } from "zod";
import type { Context } from "hono";
import { ApiError, json, requireWorkspaceMember } from "@/server/api";
import { requireAuth } from "@/server/hono/middleware/auth";
import { createSupabaseAdminClient, createSupabaseRequestClient } from "@/lib/supabase";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";
import { ingestDeliveryWebhook, ingestInboundWebhook } from "@/server/messaging/webhook";
import { sweepDueActions } from "@/server/shop-agent/channels/sweep";
import {
  handleAgentPhoneWebhook,
  resolveAgentPhoneSender,
} from "@/server/shop-agent/channels/agentphone-webhook";
import { ensureDefaultReasoner } from "@/server/shop-agent/channels/sms";
import {
  AGENTPHONE_EVENT_HEADER,
  AGENTPHONE_SIGNATURE_HEADER,
  AGENTPHONE_TIMESTAMP_HEADER,
  AGENTPHONE_WEBHOOK_SECRET_ENV,
  AgentPhoneAdapter,
} from "@/server/shop-agent/agentphone";
import type { ShopAgentSupabase } from "@/server/shop-agent/channels/db";
import { reconcileServiceWriterBillingEvent } from "@/server/billing/stripe-billing-reconciliation";
import {
  directWebhookSecret,
  resolveStripeWorkspaceExecution,
  stripePaymentMode,
} from "@/server/payments/stripe-workspace-execution";
import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { processInAppNotificationPushOutbox } from "@/server/notifications/push-outbox";
import { processLifecycleEventOutbox } from "@/server/messaging/lifecycle-sender";
import { produceCustomerAppointmentReminders } from "@/server/messaging/appointment-reminder-producer";

export const messagingRouter = new Hono();

// ---------------------------------------------------------------------------
// Delivery / inbound provider webhooks (public, signature-verified)
// ---------------------------------------------------------------------------

messagingRouter.post("/v1/webhooks/enginemailer", async (c) => {
  const request = c.req.raw;
  const requestId = request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const rawBody = await request.text();
    const result = await ingestDeliveryWebhook(
      "enginemailer",
      new EnginemailerEmailAdapter(),
      request,
      rawBody,
    );
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack?.split("\\n").slice(0, 4).join("\\n") }
      : {
        name: typeof error,
        message: typeof error === "object" && error !== null
          ? JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1000)
          : String(error),
      };
    console.error("enginemailer_webhook_failed", {
      requestId,
      route: "/api/v1/webhooks/enginemailer",
      provider: "enginemailer",
      ...details,
    });
    return NextResponse.json({ error: "Webhook processing failed", requestId }, { status: 500 });
  }
});

messagingRouter.post("/v1/webhooks/resend", async (c) => {
  const request = c.req.raw;
  const rawBody = await request.text();
  try {
    const result = await ingestDeliveryWebhook("resend", new ResendEmailAdapter(), request, rawBody);
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    console.error("resend_webhook_failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
});

messagingRouter.post("/v1/webhooks/twilio", async (c) => {
  const request = c.req.raw;
  const rawBody = await request.text();
  try {
    const result = await ingestDeliveryWebhook("twilio", new TwilioSmsAdapter(), request, rawBody);
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    console.error("twilio_delivery_webhook_failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
});

messagingRouter.post("/v1/webhooks/twilio/inbound", async (c) => {
  const request = c.req.raw;
  const rawBody = await request.text();
  try {
    const result = await ingestInboundWebhook("twilio", new TwilioSmsAdapter(), request, rawBody);
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    console.error("twilio_inbound_webhook_failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
});

// ---------------------------------------------------------------------------
// Shop Agent Phase 1: AgentPhone webhooks + sweep
// ---------------------------------------------------------------------------

/**
 * AgentPhone webhook endpoint (public, HMAC-signature-verified).
 * Register this URL via the AgentPhone dashboard / setWebhook helper with
 * the shop's agent in WEBHOOK mode:
 *   https://<host>/api/v1/shop-agent/agentphone
 *
 * Voice turns in webhook mode must answer JSON with a `text` field (30s
 * timeout); SMS webhooks only need 200 OK.
 */
messagingRouter.post("/v1/shop-agent/agentphone", async (c) => {
  const request = c.req.raw;
  const rawBody = await request.text();
  const requestId = request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const secret = process.env[AGENTPHONE_WEBHOOK_SECRET_ENV]?.trim();
    if (!secret) {
      console.error("[ShopAgent] agentphone webhook disabled: AGENTPHONE_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
    }
    const signature = request.headers.get(AGENTPHONE_SIGNATURE_HEADER);
    const timestamp = request.headers.get(AGENTPHONE_TIMESTAMP_HEADER);
    if (!AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, signature, timestamp)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
    const headerEvent = request.headers.get(AGENTPHONE_EVENT_HEADER);
    const supabase = createSupabaseAdminClient() as unknown as ShopAgentSupabase;
    const result = await handleAgentPhoneWebhook(
      {
        supabase,
        senderFor: (workspaceId) => resolveAgentPhoneSender(supabase, workspaceId),
        reasoner: ensureDefaultReasoner(),
      },
      JSON.parse(rawBody) as unknown,
      headerEvent,
    );
    return NextResponse.json(result.body);
  } catch (error) {
    console.error("shop_agent_agentphone_webhook_failed", {
      requestId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Webhook processing failed", requestId }, { status: 500 });
  }
});

/**
 * Shop Agent sweep worker: sends deferred text-backs whose quiet hours have
 * passed and one follow-up nudge per silent conversation. Idempotent — safe
 * to run every few minutes. Auth mirrors the internal worker routes below
 * (CRON_SECRET bearer).
 */
messagingRouter.post("/v1/shop-agent/sweep", async (c) => {
  const request = c.req.raw;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[ShopAgent] sweep worker disabled: CRON_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  }
  if (!authorizedWorker(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const supabase = createSupabaseAdminClient() as unknown as ShopAgentSupabase;
    const result = await sweepDueActions(supabase, {
      senderFor: (workspaceId) => resolveAgentPhoneSender(supabase, workspaceId),
    });
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[ShopAgent] sweep failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
});

// ---------------------------------------------------------------------------
// Stripe platform webhook (public, signature-verified)
// ---------------------------------------------------------------------------

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

  if (existing.status !== "failed") return { duplicate: true, admin };

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
  if (!paymentId || !workspaceId) return { received: true, ignored: "missing_invoice_metadata" };

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

  const query = admin.from("payments").update(update).eq("workspace_id", workspaceId).eq("id", paymentId);
  const { error: updateError } = failed ? await query.in("status", ["pending", "failed"]) : await query;
  if (updateError) throw updateError;
  return { received: true };
}

async function reconcileCheckoutEvent(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.payment_id;
  const workspaceId = session.metadata?.workspace_id;
  if (!paymentId || !workspaceId) return { received: true, ignored: "missing_payment_metadata" };

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
  const providerPaymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const amountDollars = session.amount_total == null ? undefined : Number((session.amount_total / 100).toFixed(2));

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

messagingRouter.post("/webhooks/stripe", async (c) => {
  const request = c.req.raw;
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event | null = null;
  try {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
    event = stripe.webhooks.constructEvent(await request.text(), signature, required("STRIPE_WEBHOOK_SECRET"));

    const ingress = await beginWebhookEvent(event);
    if (ingress.duplicate) return Response.json({ received: true, duplicate: true });

    let result: Record<string, unknown> = { received: true };
    const billingHandled = await reconcileServiceWriterBillingEvent(event, stripe);

    if (billingHandled) {
      result = { received: true, billing: true };
    } else if (
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
        await finishWebhookEvent(event, "failed", error instanceof Error ? error.message : "Unknown Stripe webhook error");
      } catch (ledgerError) {
        console.error("[stripe-webhook] failed to update webhook ledger", ledgerError);
      }
    }
    return new Response("Webhook error", { status: 400 });
  }
});

// ---------------------------------------------------------------------------
// Stripe direct (workspace-scoped) webhook (public, signature-verified)
// ---------------------------------------------------------------------------

// `object` is already taken by the platform Stripe webhook helpers above; this
// is the same helper renamed to avoid the collision.
function objectValue(value: unknown): Record<string, unknown> {
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
  const secret = directWebhookSecret(settings.operational_settings);
  if (!secret) throw new Error("Direct Stripe webhook secret is not configured");
  return {
    admin,
    secret,
    execution: resolveStripeWorkspaceExecution(settings.operational_settings),
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

  const metadata = objectValue(current.metadata);
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
        ...objectValue(current.metadata),
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

messagingRouter.post("/webhooks/stripe/direct/:workspaceId", async (c) => {
  const request = c.req.raw;
  const workspaceId = c.req.param("workspaceId");
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
});

// ---------------------------------------------------------------------------
// Email testing (workspace member auth)
// ---------------------------------------------------------------------------

function safeType(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ---------------------------------------------------------------------------
// Review request actions (workspace member auth)
// ---------------------------------------------------------------------------

const reviewActionSchema = z.object({ workspace_id: z.string().uuid(), service_record_id: z.string().uuid() });

messagingRouter.post("/v1/reviews/actions", async (c) => {
  const body = reviewActionSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner","admin","manager","service_advisor","receptionist"], c.req.raw);

  const { data: serviceRecord, error: serviceError } = await supabase
    .from("service_records")
    .select("id,workspace_id,customer_id,appointment_id,status,work_performed")
    .eq("workspace_id", body.workspace_id)
    .eq("id", body.service_record_id)
    .single();
  if (serviceError || !serviceRecord) throw serviceError ?? new ApiError(404,"Service record not found","not_found");
  if (serviceRecord.status !== "completed") throw new ApiError(409,"Review requests are available after service completion.","service_not_completed");
  if (!serviceRecord.customer_id) throw new ApiError(409,"Completed service is not linked to a customer.","customer_required");

  const [{ data: customer, error: customerError }, { data: appointment }, { data: settings }, { data: workspace }] = await Promise.all([
    supabase.from("customers").select("id,email,first_name,last_name").eq("workspace_id",body.workspace_id).eq("id",serviceRecord.customer_id).single(),
    serviceRecord.appointment_id ? supabase.from("appointments").select("id,metadata").eq("workspace_id",body.workspace_id).eq("id",serviceRecord.appointment_id).maybeSingle() : Promise.resolve({ data:null }),
    supabase.from("workspace_settings").select("operational_settings").eq("workspace_id",body.workspace_id).maybeSingle(),
    supabase.from("workspaces").select("name").eq("id",body.workspace_id).single(),
  ]);
  if (customerError || !customer?.email) throw customerError ?? new ApiError(422,"Customer email is required.","customer_email_required");

  const operational = (settings?.operational_settings ?? {}) as Record<string,unknown>;
  const reviewUrl = typeof operational.google_review_url === "string" ? operational.google_review_url.trim() : "";
  if (!reviewUrl) throw new ApiError(409,"Configure a Google review URL before sending review requests.","review_url_missing");
  const ownerUserId = typeof operational.source_owner_user_id === "string" ? operational.source_owner_user_id : "";
  if (!ownerUserId) throw new ApiError(409,"Workspace messaging preferences are not configured.","preferences_owner_missing");

  const appointmentMetadata = (appointment?.metadata ?? {}) as Record<string,unknown>;
  const confirmationCode = typeof appointmentMetadata.confirmation_code === "string" && appointmentMetadata.confirmation_code
    ? appointmentMetadata.confirmation_code
    : (serviceRecord.appointment_id ?? serviceRecord.id).replace(/-/g,"").slice(0,8).toUpperCase();
  const preferences = new URL("https://www.servicewriter.xyz/messaging-preferences");
  preferences.searchParams.set("user_id", ownerUserId);
  preferences.searchParams.set("email", String(customer.email));

  const eventId = `review:${serviceRecord.id}`;
  const result = await dispatchLifecycleEvent({
    templateKey: LIFECYCLE_EVENT_KEYS.reviewRequest,
    eventId,
    entityType: "service_record",
    entityId: serviceRecord.id,
    workspaceId: body.workspace_id,
    recipientEmail: String(customer.email),
    recipientRole: "customer",
    customerId: serviceRecord.customer_id,
    variables: {
      "business.name": workspace?.name ?? "Service Writer",
      "appointment.confirmation_code": confirmationCode,
      "email.primary_action_url": reviewUrl,
      "email.preferences_url": preferences.toString(),
    },
    metadata: { serviceRecordId: serviceRecord.id, appointmentId: serviceRecord.appointment_id ?? "" },
  });

  const admin = createSupabaseAdminClient();
  const { error: activityError } = await admin.from("crm_activities").upsert({
    workspace_id: body.workspace_id,
    customer_id: serviceRecord.customer_id,
    appointment_id: serviceRecord.appointment_id,
    activity_type: "review",
    summary: `Review request ${result.status}`,
    occurred_at: new Date().toISOString(),
    created_by: user.id,
    source_event_id: eventId,
  }, { onConflict: "workspace_id,source_event_id" });
  if (activityError) throw activityError;

  return json({ data: { status: result.status, event_id: eventId } });
});

// ---------------------------------------------------------------------------
// Newsletter preferences (public, token-scoped HTML page)
// ---------------------------------------------------------------------------

const tokenSchema = z.string().uuid();

function page(token: string, active: boolean) {
  const action = active ? "unsubscribe" : "subscribe";
  const button = active ? "Unsubscribe from weekly emails" : "Subscribe again";
  const state = active ? "You are subscribed to weekly email updates." : "You are unsubscribed from weekly email updates.";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head><body style="font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:32px"><main style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:14px"><h1>Email preferences</h1><p>${state}</p><form method="post"><input type="hidden" name="token" value="${token}"><input type="hidden" name="action" value="${action}"><button style="padding:12px 18px;border:0;border-radius:8px;background:#172033;color:white;font-weight:700">${button}</button></form><p style="margin-top:24px;color:#64748b;font-size:13px">Appointment confirmations and required service messages are separate from marketing email preferences.</p></main></body></html>`;
}

messagingRouter.get("/v1/newsletter/preferences", async (c) => {
  const request = c.req.raw;
  const token = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!token.success) return new Response("Invalid preferences link", { status: 400 });
  const admin = createSupabaseAdminClient();
  const result = await admin.from("newsletter_subscribers").select("status").eq("unsubscribe_token", token.data).maybeSingle();
  if (result.error || !result.data) return new Response("Preferences link not found", { status: 404 });
  return new Response(page(token.data, result.data.status === "active"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

messagingRouter.post("/v1/newsletter/preferences", async (c) => {
  const form = await c.req.raw.formData();
  const token = tokenSchema.safeParse(form.get("token"));
  const action = form.get("action") === "subscribe" ? "subscribe" : "unsubscribe";
  if (!token.success) return new Response("Invalid preferences link", { status: 400 });
  const admin = createSupabaseAdminClient();
  const subscriber = await admin.from("newsletter_subscribers").select("id,workspace_id,email,user_id").eq("unsubscribe_token", token.data).maybeSingle();
  if (subscriber.error || !subscriber.data) return new Response("Preferences link not found", { status: 404 });

  const active = action === "subscribe";
  const update = await admin.from("newsletter_subscribers").update({
    status: active ? "active" : "unsubscribed",
    consented_at: active ? new Date().toISOString() : null,
    unsubscribed_at: active ? null : new Date().toISOString(),
    next_send_at: active ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", subscriber.data.id);
  if (update.error) return new Response("Could not update preferences", { status: 500 });

  const latestConsent = await admin.from("messaging_consents").select("id")
    .eq("workspace_id", subscriber.data.workspace_id)
    .eq("channel", "email")
    .eq("purpose", "marketing")
    .eq("contact_email", subscriber.data.email)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const values = {
    workspace_id: subscriber.data.workspace_id,
    contact_email: subscriber.data.email,
    channel: "email",
    purpose: "marketing",
    status: active ? "granted" : "revoked",
    source: "newsletter_preferences",
    legal_basis: "consent",
    consented_at: active ? new Date().toISOString() : null,
    revoked_at: active ? null : new Date().toISOString(),
    evidence: { newsletter_subscriber_id: subscriber.data.id },
  };
  if (latestConsent.data?.id) await admin.from("messaging_consents").update(values).eq("id", latestConsent.data.id);
  else await admin.from("messaging_consents").insert(values);

  return new Response(page(token.data, active), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

// ---------------------------------------------------------------------------
// Internal worker routes (shared-secret / cron authorization)
// ---------------------------------------------------------------------------

// The push and lifecycle outbox workers share the same secret scheme and error
// details helper (identical logic to the originals).
function suppliedWorkerSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-lifecycle-worker-secret");
}

function authorizedWorker(request: Request, secret: string): boolean {
  const supplied = suppliedWorkerSecret(request);
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function safeErrorDetails(error: unknown): { errorCode: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorCode: error.name || "Error",
      errorMessage: error.message.slice(0, 300),
    };
  }
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      errorCode: typeof candidate.code === "string" ? candidate.code.slice(0, 80) : "worker_error",
      errorMessage: typeof candidate.message === "string" ? candidate.message.slice(0, 300) : "Unknown worker error",
    };
  }
  return { errorCode: "worker_error", errorMessage: "Unknown worker error" };
}

async function processPushOutboxRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[Push] outbox worker disabled: CRON_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  }
  if (!authorizedWorker(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({})) as { limit?: number };
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(Number(body.limit), 50)) : 10;
    const result = await processInAppNotificationPushOutbox(limit);
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[Push] outbox worker failed", safeErrorDetails(error));
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}

messagingRouter.post("/internal/notifications/push/outbox", (c) => processPushOutboxRequest(c.req.raw));
messagingRouter.get("/internal/notifications/push/outbox", (c) => processPushOutboxRequest(c.req.raw));

async function processLifecycleOutboxRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[Lifecycle] outbox worker disabled: CRON_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  }
  if (!authorizedWorker(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({})) as { limit?: number };
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(Number(body.limit), 50)) : 10;
    const reminders = await produceCustomerAppointmentReminders();
    const delivery = await processLifecycleEventOutbox(limit);
    return NextResponse.json({ ok: true, delivery, reminders, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[Lifecycle] outbox worker failed", safeErrorDetails(error));
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}

messagingRouter.post("/internal/lifecycle/outbox", (c) => processLifecycleOutboxRequest(c.req.raw));
messagingRouter.get("/internal/lifecycle/outbox", (c) => processLifecycleOutboxRequest(c.req.raw));

// Exported for the domain's cron worker authorization tests (previously these
// imported the GET handlers from the Next.js route files directly).
export { processPushOutboxRequest, processLifecycleOutboxRequest };

// ---------------------------------------------------------------------------
// Push public key (public)
// ---------------------------------------------------------------------------

messagingRouter.get("/notifications/push/public-key", async () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey }, {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
});

// ---------------------------------------------------------------------------
// Phase 2 helpers (messaging domain).
//
// `selected_workspace_id` is a UI preference hint only — it is validated
// against the caller's workspace memberships and never grants access on its
// own (same contract as GET /v1/workspace-context in the platform router).
// ---------------------------------------------------------------------------

type MessagingSupabase = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

async function resolveWorkspaceIdForUser(
  supabase: { from: (table: string) => any },
  userId: string,
  selectedWorkspaceId?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  const active = ((data ?? []) as Array<{
    workspace_id: string;
    is_active: boolean;
    workspaces: { is_active: boolean } | null;
  }>).filter((membership) => membership.is_active && membership.workspaces?.is_active);
  if (selectedWorkspaceId) {
    const selected = active.find((membership) => membership.workspace_id === selectedWorkspaceId);
    if (selected) return selected.workspace_id;
  }
  return active[0]?.workspace_id ?? null;
}

async function resolveWorkspaceOrThrow(
  c: Context,
  selectedWorkspaceId: string | undefined,
  roles?: string[],
): Promise<{ supabase: MessagingSupabase; user: { id: string }; workspaceId: string }> {
  const auth = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(auth.supabase, auth.user.id, selectedWorkspaceId);
  if (!workspaceId) throw new ApiError(400, "No active workspace", "no_workspace");
  const scoped = await requireWorkspaceMember(workspaceId, roles, c.req.raw);
  return { supabase: scoped.supabase as unknown as MessagingSupabase, user: scoped.user, workspaceId };
}

/** Platform-admin gate (admin area dashboards). Verified via user_roles. */
async function requirePlatformAdmin(c: Context) {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(403, "Platform admin access required", "forbidden");
  return { supabase: supabase as unknown as MessagingSupabase, user };
}

function bearerToken(c: Context): string {
  const authorization = c.req.raw.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, "Authentication required", "unauthenticated");
  return token;
}

/**
 * Proxy an authenticated Supabase edge function with the caller's bearer
 * token, preserving the edge function's own user-auth behavior. Used for the
 * messaging edge functions the browser used to invoke directly.
 */
async function invokeUserEdgeFunction(
  c: Context,
  functionName: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  await requireAuth(c);
  const token = bearerToken(c);
  const client = createSupabaseRequestClient(token);
  const { data, error } = await client.functions.invoke(functionName, {
    body: body as Record<string, unknown>,
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  if (error) throw new ApiError(502, error.message || "Service temporarily unavailable", "edge_function_error");
  return data;
}

/** Proxy a public edge function (no caller auth; the function validates its own inputs, e.g. a booking slug). */
async function invokePublicEdgeFunction(functionName: string, body: unknown): Promise<unknown> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.functions.invoke(functionName, {
    body: body as Record<string, unknown>,
  });
  if (error) throw new ApiError(502, error.message || "Service temporarily unavailable", "edge_function_error");
  return data;
}

const selectedWorkspaceSchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Email settings (user-scoped; settings are keyed by the workspace owner)
// ---------------------------------------------------------------------------

async function resolveEmailSettingsOwnerId(supabase: MessagingSupabase, userId: string): Promise<string> {
  const { data: workspaceOwnerId, error: ownerError } = await supabase.rpc("current_workspace_owner_user_id");
  if (ownerError) throw ownerError;
  return (workspaceOwnerId as string | null) || userId;
}

messagingRouter.get("/v1/email-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const ownerId = await resolveEmailSettingsOwnerId(supabase as unknown as MessagingSupabase, user.id);
  const { data, error } = await supabase
    .from("email_settings")
    .select("*")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

const emailSettingsPayloadSchema = z.record(z.string(), z.unknown());

messagingRouter.put("/v1/email-settings", async (c) => {
  const payload = emailSettingsPayloadSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const ownerId = await resolveEmailSettingsOwnerId(supabase as unknown as MessagingSupabase, user.id);

  const { data: existing } = await supabase
    .from("email_settings")
    .select("id")
    .eq("user_id", ownerId)
    .maybeSingle();

  const fullPayload = { ...payload, user_id: ownerId };
  const { data, error } = existing
    ? await supabase.from("email_settings").update(fullPayload).eq("user_id", ownerId).select().maybeSingle()
    : await supabase.from("email_settings").insert(fullPayload).select().maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null, error: null });
});

messagingRouter.post("/v1/email-settings/encrypt-password", async (c) => {
  const { plain_password } = z.object({ plain_password: z.string().min(1).max(500) }).parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.rpc("encrypt_smtp_password", { plain_password });
  if (error) throw error;
  return json({ data: data ?? null, error: null });
});

messagingRouter.post("/v1/email-settings/test-outgoing", async (c) => {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(await c.req.json());
  const data = await invokeUserEdgeFunction(c, "test-email-settings", { user_id });
  return json({ data: data ?? null, error: null });
});

messagingRouter.post("/v1/email-settings/test-incoming", async (c) => {
  const data = await invokeUserEdgeFunction(c, "fleet-email-mailbox", { action: "test" });
  return json({ data: data ?? null, error: null });
});

// ---------------------------------------------------------------------------
// Email testing (workspace member auth; workspace resolved server-side)
// ---------------------------------------------------------------------------

const EMAIL_QUEUE_COLUMNS =
  "id, email_type, recipient_email, recipient_name, status, scheduled_for, sent_at, error_message, created_at, source, retry_count, review_request_id, campaign_id, provider_message_id, last_event, last_event_at";
const EMAIL_LOG_COLUMNS =
  "id, recipient_email, recipient_name, email_type, subject, status, provider, error_message, created_at, source, queue_id, review_request_id, campaign_id, provider_message_id, last_event, last_event_at";

messagingRouter.get("/v1/email-testing/data", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [profileResp, emailSettingsResp, queueResp, logsResp] = await Promise.all([
    supabase.from("business_profiles").select("business_name, email").eq("user_id", user.id).maybeSingle(),
    supabase.from("email_settings").select("id, use_custom_smtp, smtp_host, verified").eq("user_id", user.id).maybeSingle(),
    supabase.from("email_queue").select(EMAIL_QUEUE_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("email_logs").select(EMAIL_LOG_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const firstError = [profileResp, emailSettingsResp, queueResp, logsResp].find((r) => r.error)?.error;
  if (firstError) throw firstError;
  return json({
    userEmail: (user as { email?: string }).email ?? null,
    profile: profileResp.data ?? null,
    emailSettings: emailSettingsResp.data ?? null,
    emailQueue: queueResp.data || [],
    emailLogs: logsResp.data || [],
  });
});

messagingRouter.get("/v1/email-testing/queue", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("email_queue")
    .select(EMAIL_QUEUE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return json({ data: data || [] });
});

messagingRouter.get("/v1/email-testing/logs", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("email_logs")
    .select(EMAIL_LOG_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return json({ data: data || [] });
});

const emailTestSendSchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
  to: z.string().email().max(320),
  type: z.string().trim().max(80).default("transactional_test"),
  customerName: z.string().trim().max(160).optional(),
  businessName: z.string().trim().max(160).optional(),
  businessEmail: z.string().email().max(320).optional(),
  serviceName: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(120).optional(),
  scheduledTime: z.string().trim().max(80).optional(),
  totalAmount: z.string().trim().max(80).optional(),
  vehicleInfo: z.string().trim().max(200).optional(),
});

// Refactored in Phase 2: the workspace is resolved server-side from the auth
// token (plus the selected_workspace_id UI hint) instead of being trusted
// from the request body for authorization.
messagingRouter.post("/v1/email-testing/send", async (c) => {
  const body = emailTestSendSchema.parse(await c.req.json());
  const { workspaceId } = await resolveWorkspaceOrThrow(
    c,
    body.selected_workspace_id,
    ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
  );

  const type = safeType(body.type);
  const subject = `ServiceWriter transactional test — ${type}`;
  const lines = [
    `This is a controlled transactional email test from ${body.businessName ?? "ServiceWriter"}.`,
    body.customerName ? `Customer: ${body.customerName}` : null,
    body.serviceName ? `Service: ${body.serviceName}` : null,
    body.vehicleInfo ? `Vehicle: ${body.vehicleInfo}` : null,
    body.scheduledDate || body.scheduledTime
      ? `Schedule: ${[body.scheduledDate, body.scheduledTime].filter(Boolean).join(" ")}`
      : null,
    body.totalAmount ? `Amount: ${body.totalAmount}` : null,
    "Provider: Resend",
  ].filter(Boolean) as string[];

  const bodyText = lines.join("\n");
  const html = `<p>${lines.map(escapeHtml).join("</p><p>")}</p>`;
  const adapter = new ResendEmailAdapter();
  const delivery = await adapter.send({
    workspaceId,
    recipient: { email: body.to.trim().toLowerCase() },
    purpose: "transactional",
    templateKey: `email_testing.${type}`,
    subject,
    body: bodyText,
    html,
    fromName: body.businessName ?? "ServiceWriter",
    replyTo: body.businessEmail,
    idempotencyKey: `email-test:${workspaceId}:${crypto.randomUUID()}`,
    metadata: { source: "email_testing" },
  });

  return json({
    success: true,
    provider: delivery.providerName,
    status: delivery.status,
    providerMessageId: delivery.providerMessageId,
    acceptedAt: delivery.acceptedAt,
  });
});

// ---------------------------------------------------------------------------
// Newsletter sequences / templates / subscribers (workspace-scoped)
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/newsletter/sequences", async (c) => {
  const { selected_workspace_id } = selectedWorkspaceSchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, selected_workspace_id);
  const { data, error } = await supabase
    .from("newsletter_sequences")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.get("/v1/newsletter/templates", async (c) => {
  const params = z
    .object({ sequence_id: z.string().uuid(), selected_workspace_id: z.string().uuid().optional() })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, params.selected_workspace_id);
  const { data, error } = await supabase
    .from("newsletter_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("sequence_id", params.sequence_id)
    .order("month_number");
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.get("/v1/newsletter/subscriber-count", async (c) => {
  const { selected_workspace_id } = selectedWorkspaceSchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, selected_workspace_id);
  const { count, error } = await supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (error) throw error;
  return json({ data: { count: count ?? 0 } });
});

const newsletterSequenceSchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  defaultTemplates: z
    .array(
      z.object({
        month_number: z.number().int(),
        subject: z.string(),
        preview_text: z.string(),
        content: z.string(),
        holiday_theme: z.string(),
        seasonal_theme: z.string(),
        is_active: z.boolean(),
      }),
    )
    .default([]),
});

messagingRouter.post("/v1/newsletter/sequences", async (c) => {
  const body = newsletterSequenceSchema.parse(await c.req.json());
  const { supabase, user, workspaceId } = await resolveWorkspaceOrThrow(c, body.selected_workspace_id);
  const { data: sequence, error: seqError } = await supabase
    .from("newsletter_sequences")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      name: body.name,
      description: body.description,
      is_active: true,
      start_date: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();
  if (seqError) throw seqError;

  if (body.defaultTemplates.length) {
    const { error: templateError } = await supabase.from("newsletter_templates").insert(
      body.defaultTemplates.map((template) => ({
        ...template,
        workspace_id: workspaceId,
        user_id: user.id,
        sequence_id: sequence.id,
      })),
    );
    if (templateError) throw templateError;
  }
  return json({ data: { id: sequence.id } }, { status: 201 });
});

messagingRouter.patch("/v1/newsletter/templates/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = z
    .object({ selected_workspace_id: z.string().uuid().optional(), is_active: z.boolean() })
    .parse(await c.req.json());
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, body.selected_workspace_id);
  const { error } = await supabase
    .from("newsletter_templates")
    .update({ is_active: body.is_active })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ ok: true });
});

messagingRouter.put("/v1/newsletter/templates/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = z
    .object({
      selected_workspace_id: z.string().uuid().optional(),
      subject: z.string(),
      preview_text: z.string(),
      content: z.string(),
      holiday_theme: z.string(),
      seasonal_theme: z.string(),
    })
    .parse(await c.req.json());
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, body.selected_workspace_id);
  const { error } = await supabase
    .from("newsletter_templates")
    .update({
      subject: body.subject,
      preview_text: body.preview_text,
      content: body.content,
      holiday_theme: body.holiday_theme,
      seasonal_theme: body.seasonal_theme,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ ok: true });
});

/**
 * Public one-click unsubscribe (used by the /unsubscribe page). Mirrors the
 * unsubscribe branch of POST /v1/newsletter/preferences.
 */
messagingRouter.post("/v1/newsletter/unsubscribe", async (c) => {
  const { token } = z.object({ token: z.string().uuid() }).parse(await c.req.json());
  const admin = createSupabaseAdminClient();
  const subscriber = await admin
    .from("newsletter_subscribers")
    .select("id,workspace_id,email,user_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (subscriber.error || !subscriber.data) throw new ApiError(404, "Unsubscribe link not found", "not_found");

  const { error: updateError } = await admin
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      next_send_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriber.data.id);
  if (updateError) throw updateError;

  const latestConsent = await admin
    .from("messaging_consents")
    .select("id")
    .eq("workspace_id", subscriber.data.workspace_id)
    .eq("channel", "email")
    .eq("purpose", "marketing")
    .eq("contact_email", subscriber.data.email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const values = {
    workspace_id: subscriber.data.workspace_id,
    contact_email: subscriber.data.email,
    channel: "email",
    purpose: "marketing",
    status: "revoked",
    source: "newsletter_unsubscribe",
    legal_basis: "consent",
    consented_at: null,
    revoked_at: new Date().toISOString(),
    evidence: { newsletter_subscriber_id: subscriber.data.id },
  };
  if (latestConsent.data?.id) await admin.from("messaging_consents").update(values).eq("id", latestConsent.data.id);
  else await admin.from("messaging_consents").insert(values);

  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// In-app notifications (user-scoped)
// ---------------------------------------------------------------------------

const notificationCreateSchema = z.object({
  type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  workspace_id: z.string().uuid().nullable().optional(),
  dedupe_key: z.string().trim().min(1).max(200).optional(),
  source_event_id: z.string().trim().max(200).nullable().optional(),
});

messagingRouter.post("/v1/notifications", async (c) => {
  const body = notificationCreateSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase.from("in_app_notifications").upsert(
    {
      user_id: user.id,
      workspace_id: body.workspace_id ?? null,
      type: body.type,
      title: body.title,
      message: body.message,
      metadata: (body.metadata ?? {}) as Record<string, unknown>,
      dedupe_key: body.dedupe_key ?? `manual:${body.type}:${crypto.randomUUID()}`,
      source_event_id: body.source_event_id ?? null,
    },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw error;
  return json({ created: true }, { status: 201 });
});

messagingRouter.get("/v1/notifications", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("in_app_notifications")
    .select("*")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// Registered before the parameterized sibling so "read-all" is not treated as :id.
messagingRouter.patch("/v1/notifications/read-all", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("in_app_notifications")
    .update({ read: true, read_at: readAt })
    .eq("user_id", user.id)
    .eq("read", false);
  if (error) throw error;
  return json({ ok: true });
});

messagingRouter.patch("/v1/notifications/:id/read", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase
    .from("in_app_notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ ok: true });
});

messagingRouter.delete("/v1/notifications/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase
    .from("in_app_notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ ok: true });
});

const notificationEmailSchema = z.object({
  to: z.string().email().max(320),
  customerName: z.string().trim().max(160).optional(),
  type: z.string().trim().max(80),
  businessName: z.string().trim().max(160).optional(),
  businessEmail: z.string().email().max(320).optional(),
  serviceName: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(120).optional(),
  scheduledTime: z.string().trim().max(80).optional(),
  estimatedDuration: z.number().int().nonnegative().optional(),
  vehicleInfo: z.string().trim().max(200).optional(),
  totalAmount: z.string().trim().max(80).optional(),
  customerEmail: z.string().email().max(320).optional(),
  serviceDescription: z.string().trim().max(200).optional(),
  documentNumber: z.string().trim().max(80).optional(),
  paymentDate: z.string().trim().max(120).optional(),
});

// Replaces the client-side sendEmail fallback in
// src/application/notifications/notification.service.ts, which invoked the
// send-email edge function directly from the browser. The edge function still
// owns template rendering; this is a thin authenticated proxy with the
// caller's bearer token so the function keeps its own user-auth behavior.
messagingRouter.post("/v1/notifications/email", async (c) => {
  const body = notificationEmailSchema.parse(await c.req.json());
  const data = await invokeUserEdgeFunction(c, "send-email", body);
  return json({ data: data ?? null, error: null });
});

// ---------------------------------------------------------------------------
// SMS history / recipients / timeline (workspace-scoped)
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/sms/messages", async (c) => {
  const { selected_workspace_id } = selectedWorkspaceSchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const { supabase, user, workspaceId } = await resolveWorkspaceOrThrow(c, selected_workspace_id);
  const { data, error } = await supabase
    .from("sms_logs")
    .select("id, direction, recipient_hash, status, correlation_id, message_body, created_at, error_message")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [], workspaceId });
});

const ELIGIBLE_APPOINTMENT_STATUSES = ["pending", "confirmed", "in_progress", "scheduled", "no_show"];

messagingRouter.get("/v1/sms/eligible-recipients", async (c) => {
  const { selected_workspace_id } = selectedWorkspaceSchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const { supabase, workspaceId } = await resolveWorkspaceOrThrow(c, selected_workspace_id);
  const { data, error } = await supabase
    .from("appointments")
    .select("id, status, scheduled_date, scheduled_time, customer:customers(name, phone)")
    .eq("workspace_id", workspaceId)
    .in("status", ELIGIBLE_APPOINTMENT_STATUSES)
    .not("customer.phone", "is", null)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

const SMS_TIMELINE_COLUMNS =
  "id, created_at, direction, status, message_type, message_body, to_number_last4, error_message";

messagingRouter.get("/v1/sms/timeline", async (c) => {
  const params = z
    .object({
      appointment_id: z.string().uuid(),
      customer_phone: z.string().max(40).optional(),
      scheduled_date: z.string().max(20).optional(),
      selected_workspace_id: z.string().uuid().optional(),
    })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  // Workspace membership is verified; row access is enforced by RLS on the
  // scoped client, mirroring the original direct-from-browser queries.
  const { supabase } = await resolveWorkspaceOrThrow(c, params.selected_workspace_id);

  const { data, error } = await supabase
    .from("sms_logs")
    .select(SMS_TIMELINE_COLUMNS)
    .eq("appointment_id", params.appointment_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (data && data.length > 0) return json({ data });

  const last4 = params.customer_phone?.replace(/\D/g, "").slice(-4);
  if (!last4) return json({ data: [] });

  let fallback = supabase
    .from("sms_logs")
    .select(SMS_TIMELINE_COLUMNS)
    .eq("to_number_last4", last4)
    .order("created_at", { ascending: false })
    .limit(25);
  if (params.scheduled_date) {
    const start = new Date(`${params.scheduled_date}T00:00:00`);
    start.setDate(start.getDate() - 2);
    const end = new Date(`${params.scheduled_date}T00:00:00`);
    end.setDate(end.getDate() + 7);
    fallback = fallback.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
  }
  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) throw fallbackError;
  return json({ data: fallbackData ?? [] });
});

// ---------------------------------------------------------------------------
// SMS sending (edge-function proxies — caller auth preserved)
// ---------------------------------------------------------------------------

const smsSendSchema = z.object({
  to: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(2000),
  appointmentId: z.string().max(200).nullable().optional(),
  customerId: z.string().max(200).nullable().optional(),
  messageClass: z.enum(["transactional", "marketing"]).default("transactional"),
  messageType: z.string().trim().max(80).default("manual"),
});

messagingRouter.post("/v1/sms/send", async (c) => {
  const body = smsSendSchema.parse(await c.req.json());
  const data = await invokeUserEdgeFunction(c, "send-sms", {
    to: body.to,
    message: body.message,
    appointmentId: body.appointmentId ?? null,
    customerId: body.customerId ?? null,
    messageClass: body.messageClass,
    messageType: body.messageType,
  });
  return json({ data: data ?? null, error: null });
});

const bookingLifecycleSchema = z.object({
  appointmentId: z.string().uuid(),
  type: z.enum(["reschedule", "cancellation", "confirmation"]),
});

messagingRouter.post("/v1/sms/booking-lifecycle", async (c) => {
  const body = bookingLifecycleSchema.parse(await c.req.json());
  const signature = c.req.raw.headers.get("x-hmac-signature");
  await invokeUserEdgeFunction(
    c,
    "send-booking-confirmation-sms",
    { appointmentId: body.appointmentId, type: body.type },
    signature ? { "x-hmac-signature": signature } : {},
  );
  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// SMS credits (user-scoped)
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/sms-credits/balance", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase.rpc("sms_credit_balance_v1", { p_user_id: user.id });
  if (error) throw error;

  const { data: businessProfile } = await supabase
    .from("business_profiles")
    .select("sms_low_balance_threshold, sms_transactional_enabled, sms_marketing_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return json({
    data: {
      ...((data ?? {}) as Record<string, unknown>),
      ...(businessProfile
        ? {
            low_balance_threshold: businessProfile.sms_low_balance_threshold,
            transactional_enabled: businessProfile.sms_transactional_enabled,
            marketing_enabled: businessProfile.sms_marketing_enabled,
          }
        : {}),
    },
  });
});

messagingRouter.get("/v1/sms-credits/bundles", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase
    .from("message_bundles")
    .select("bundle_key, name, credit_units, price_cents, renewal_period")
    .eq("channel", "sms")
    .eq("is_active", true)
    .not("bundle_key", "is", null)
    .order("price_cents", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.get("/v1/sms-credits/purchases", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("sms_credit_purchases")
    .select("id, bundle_key, units, kind, amount_cents, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.post("/v1/sms-credits/checkout", async (c) => {
  const { bundleKey } = z.object({ bundleKey: z.string().min(1).max(60) }).parse(await c.req.json());
  const data = await invokeUserEdgeFunction(c, "create-messaging-addon-checkout", { bundleKey });
  return json({ data: data ?? null, error: null });
});

messagingRouter.put("/v1/sms-credits/threshold", async (c) => {
  const { threshold } = z.object({ threshold: z.number().finite() }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const clamped = Math.max(0, Math.round(threshold));
  const { error } = await supabase
    .from("business_profiles")
    .update({ sms_low_balance_threshold: clamped })
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ ok: true });
});

messagingRouter.put("/v1/sms-credits/channel-toggles", async (c) => {
  const body = z
    .object({ transactional: z.boolean().optional(), marketing: z.boolean().optional() })
    .parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const update: Record<string, boolean> = {};
  if (body.transactional !== undefined) update.sms_transactional_enabled = body.transactional;
  if (body.marketing !== undefined) update.sms_marketing_enabled = body.marketing;
  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("business_profiles").update(update).eq("user_id", user.id);
    if (error) throw error;
  }
  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// SMS preferences (user-scoped)
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/sms-preferences", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("sms_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

const smsPreferencesSchema = z.object({
  confirmation_enabled: z.boolean(),
  reschedule_enabled: z.boolean(),
  cancellation_enabled: z.boolean(),
  reminder_enabled: z.boolean(),
  reminder_hours_before: z.number().int(),
  template_confirmation: z.string().nullable(),
  template_reschedule: z.string().nullable(),
  template_cancellation: z.string().nullable(),
  template_reminder: z.string().nullable(),
});

messagingRouter.put("/v1/sms-preferences", async (c) => {
  const body = smsPreferencesSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase
    .from("sms_preferences")
    .upsert({ ...body, user_id: user.id }, { onConflict: "user_id" });
  if (error) throw error;
  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// Voice agent (user-scoped settings; public presence + public proxies)
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/voice-agent/settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("business_profiles")
    .select("elevenlabs_agent_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: { agentId: data?.elevenlabs_agent_id ?? null } });
});

messagingRouter.put("/v1/voice-agent/settings", async (c) => {
  const body = z.object({ enabled: z.boolean(), agentId: z.string().max(200) }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const nextValue = body.enabled ? body.agentId || null : null;
  const { error } = await supabase
    .from("business_profiles")
    .update({ elevenlabs_agent_id: nextValue })
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ ok: true });
});

const voicePresenceSchema = z.object({
  workspaceId: z.string().uuid(),
  agentSlug: z.string().trim().min(1).max(120),
});

messagingRouter.get("/v1/voice-agent/presence", async (c) => {
  const params = voicePresenceSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_agent_presence_snapshot_v1", {
    p_workspace_id: params.workspaceId,
    p_agent_slug: params.agentSlug,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

const voiceBookingToolSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  tool: z.enum([
    "get_services",
    "check_availability",
    "book_appointment",
    "create_service_request",
    "get_shop_info",
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
});

messagingRouter.post("/v1/voice-agent/booking-tools", async (c) => {
  const body = voiceBookingToolSchema.parse(await c.req.json());
  const data = await invokePublicEdgeFunction("elevenlabs-booking-tools", body);
  return json({ data: data ?? null, error: null });
});

messagingRouter.post("/v1/voice-agent/conversation-token", async (c) => {
  const body = z.object({ slug: z.string().trim().min(1).max(160) }).parse(await c.req.json());
  const data = await invokePublicEdgeFunction("elevenlabs-voice-token", body);
  return json({ data: data ?? null, error: null });
});

/** Public: does this booking slug have a voice agent configured? */
messagingRouter.get("/v1/voice-agent/has", async (c) => {
  const { slug } = z
    .object({ slug: z.string().trim().min(1).max(160) })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("public_has_voice_agent", { booking_slug_param: slug });
  if (error) throw error;
  return json({ data: Boolean(data) });
});

// ---------------------------------------------------------------------------
// Mobile release distribution (edge-function proxy — caller auth preserved)
// ---------------------------------------------------------------------------

const mobileReleaseActionSchema = z
  .object({
    action: z.enum(["list_releases", "record_install", "publish_release", "revoke_release"]),
  })
  .catchall(z.unknown());

messagingRouter.post("/v1/mobile-release-distribution", async (c) => {
  const body = mobileReleaseActionSchema.parse(await c.req.json());
  const data = await invokeUserEdgeFunction(c, "mobile-release-distribution", body);
  return json({ data: data ?? null, error: null });
});

// ---------------------------------------------------------------------------
// Admin: platform messaging health + webhook event inspector
// ---------------------------------------------------------------------------

messagingRouter.get("/v1/admin/messaging-health", async (c) => {
  await requirePlatformAdmin(c);
  const admin = createSupabaseAdminClient();

  const [outbound, failed, replies, optOuts, smsTenants, marketingTenants, exhaustedBundles, a2pBlocked] =
    await Promise.all([
      admin
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .in("status", ["sent", "delivered"]),
      admin
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .in("status", ["failed", "undelivered"]),
      admin
        .from("sms_logs")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("message_type", "reply"),
      admin.from("sms_opt_outs").select("id", { count: "exact", head: true }),
      admin
        .from("business_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("sms_enabled", true),
      admin
        .from("business_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("marketing_email_enabled", true),
      admin
        .from("business_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("sms_overage_enabled", false)
        .lt("sms_segments_remaining", 10),
      admin
        .from("business_profiles")
        .select("user_id", { count: "exact", head: true })
        .not("sms_a2p_status", "in", '("approved","verified","active")'),
    ]);

  const firstError = [outbound, failed, replies, optOuts, smsTenants, marketingTenants, exhaustedBundles, a2pBlocked]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw firstError;

  return json({
    data: {
      smsEnabledTenants: smsTenants.count ?? 0,
      marketingEmailTenants: marketingTenants.count ?? 0,
      outbound: outbound.count ?? 0,
      failed: failed.count ?? 0,
      replies: replies.count ?? 0,
      optOuts: optOuts.count ?? 0,
      exhaustedBundles: exhaustedBundles.count ?? 0,
      a2pBlocked: a2pBlocked.count ?? 0,
    },
  });
});

const WEBHOOK_EVENT_FILTERS = ["all", "failed", "dead_letter"] as const;

messagingRouter.get("/v1/admin/webhook-events", async (c) => {
  await requirePlatformAdmin(c);
  const params = z
    .object({ filter: z.enum(WEBHOOK_EVENT_FILTERS).default("all") })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const admin = createSupabaseAdminClient();
  // Reads webhook_event_logs (not the webhook_events ingress ledger): this is
  // the table the admin webhook health UI was built against.
  let query = admin.from("webhook_event_logs").select("*").order("created_at", { ascending: false }).limit(100);
  if (params.filter === "failed") query = query.in("status", ["failed", "dead_letter"]);
  if (params.filter === "dead_letter") query = query.eq("status", "dead_letter");
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.post("/v1/admin/webhook-events/:id/replay", async (c) => {
  const id = z.string().parse(c.req.param("id"));
  const data = await invokeUserEdgeFunction(c, "replay-webhook-event", { event_log_id: id, action: "replay" });
  return json({ data: data ?? null, error: null });
});

messagingRouter.post("/v1/admin/webhook-events/:id/dismiss", async (c) => {
  const id = z.string().parse(c.req.param("id"));
  const data = await invokeUserEdgeFunction(c, "replay-webhook-event", { event_log_id: id, action: "dismiss" });
  return json({ data: data ?? null, error: null });
});

// ---------------------------------------------------------------------------
// Internal inbox (user-scoped team messaging; logic ported from the
// client-side query module so no browser Supabase access is needed)
// ---------------------------------------------------------------------------

type InternalInboxMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  attachments: unknown;
  created_at: string;
  edited_at: string | null;
};

type InternalInboxThreadDetail = {
  id: string;
  kind: "job" | "direct";
  title: string | null;
  appointmentId: string | null;
  serviceRecordId: string | null;
  createdBy: string | null;
  createdAt: string;
  jobContext: { id: string; title: string; jobNumber: string | null; customerName: string | null; scheduledDate: string | null } | null;
  participants: Array<{ userId: string; role: string | null; displayName: string | null; initials: string | null; lastReadAt: string | null }>;
  messages: InternalInboxMessageRow[];
  lastReadAt: string | null;
  latestActivity: string;
  otherUser: { userId: string; displayName: string | null; initials: string | null } | null;
};

function initialsForName(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return null;
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || null;
}

function inferJobTitle(record: any): string {
  const customerName = record?.customers?.name ?? record?.customer_name ?? null;
  const vehicle = [record?.vehicle_year, record?.vehicle_make, record?.vehicle_model]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
  if (customerName && vehicle) return `${customerName} · ${vehicle}`;
  return customerName ?? vehicle ?? "Service job";
}

async function resolveDirectThreadLabel(
  supabase: MessagingSupabase,
  threadId: string,
): Promise<{ id: string; name: string | null } | null> {
  const { data: thread } = await supabase
    .from("job_threads")
    .select("id, created_by")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread?.created_by) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("display_name, role")
    .eq("user_id", thread.created_by)
    .maybeSingle();
  return { id: thread.created_by, name: member?.display_name ?? member?.role ?? null };
}

async function listVisibleThreadIds(supabase: MessagingSupabase, userId: string): Promise<string[]> {
  const [{ data: participations }, { data: owned }] = await Promise.all([
    supabase
      .from("job_thread_participants")
      .select("thread_id, last_read_at")
      .eq("user_id", userId)
      .is("removed_at", null),
    supabase.from("job_threads").select("id").eq("owner_user_id", userId),
  ]);
  const ids = new Set<string>();
  for (const row of (participations ?? []) as Array<{ thread_id: string }>) ids.add(row.thread_id);
  for (const row of (owned ?? []) as Array<{ id: string }>) ids.add(row.id);
  return Array.from(ids);
}

async function resolveDisplayNames(
  supabase: MessagingSupabase,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  if (!userIds.length) return names;
  const { data: technicians } = await supabase
    .from("technicians")
    .select("user_id, name")
    .in("user_id", userIds);
  for (const technician of (technicians ?? []) as Array<{ user_id: string; name: string }>) {
    names.set(technician.user_id, technician.name);
  }
  const missing = userIds.filter((userId) => !names.has(userId));
  if (missing.length) {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, display_name, role")
      .in("user_id", missing);
    for (const member of (members ?? []) as Array<{ user_id: string; display_name: string | null; role: string | null }>) {
      names.set(member.user_id, member.display_name ?? member.role ?? null);
    }
  }
  return names;
}

async function assembleThreadDetails(
  supabase: MessagingSupabase,
  threadIds: string[],
  userId: string,
): Promise<InternalInboxThreadDetail[]> {
  if (!threadIds.length) return [];

  const { data: threadRows, error: threadError } = await supabase
    .from("job_threads")
    .select("id, kind, title, appointment_id, service_record_id, created_by, created_at")
    .in("id", threadIds);
  if (threadError) throw threadError;

  const serviceRecordIds = Array.from(
    new Set(
      (threadRows ?? [])
        .map((thread: any) => thread.service_record_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const { data: serviceRecords } = serviceRecordIds.length
    ? await supabase
        .from("service_records")
        .select("id, job_number, customer_name, vehicle_year, vehicle_make, vehicle_model, customers(name)")
        .in("id", serviceRecordIds)
    : { data: [] };
  const serviceRecordById = new Map<string, any>();
  for (const record of (serviceRecords ?? []) as Array<{ id: string }>) serviceRecordById.set(record.id, record);

  const [participationRows, messageRows, appointmentRows] = await Promise.all([
    supabase
      .from("job_thread_participants")
      .select("thread_id, user_id, role, last_read_at")
      .in("thread_id", threadIds)
      .is("removed_at", null),
    supabase
      .from("job_thread_messages")
      .select("id, thread_id, sender_id, sender_role, content, attachments, created_at, edited_at")
      .in("thread_id", threadIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("appointments")
      .select("service_record_id, customer_id, scheduled_date, customers(name)")
      .not("service_record_id", "is", null)
      .in("service_record_id", serviceRecordIds.length ? serviceRecordIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  if (participationRows.error) throw participationRows.error;
  if (messageRows.error) throw messageRows.error;

  const serviceRecordAppointments = new Map<string, { customerName: string | null; scheduledDate: string | null }>();
  for (const appointment of (appointmentRows.data ?? []) as Array<{ service_record_id: string; scheduled_date: string | null; customers: { name: string } | null }>) {
    if (appointment.service_record_id && !serviceRecordAppointments.has(appointment.service_record_id)) {
      serviceRecordAppointments.set(appointment.service_record_id, {
        customerName: appointment.customers?.name ?? null,
        scheduledDate: appointment.scheduled_date ?? null,
      });
    }
  }

  const userIds = new Set<string>();
  for (const participant of (participationRows.data ?? []) as Array<{ user_id: string }>) userIds.add(participant.user_id);
  for (const message of (messageRows.data ?? []) as InternalInboxMessageRow[]) userIds.add(message.sender_id);
  const displayNames = await resolveDisplayNames(supabase, Array.from(userIds));

  const messagesByThread = new Map<string, InternalInboxMessageRow[]>();
  for (const message of (messageRows.data ?? []) as InternalInboxMessageRow[]) {
    const bucket = messagesByThread.get(message.thread_id) ?? [];
    bucket.push(message);
    messagesByThread.set(message.thread_id, bucket);
  }
  const participantsByThread = new Map<string, Array<{ user_id: string; role: string | null; last_read_at: string | null }>>();
  for (const participant of (participationRows.data ?? []) as Array<{ thread_id: string; user_id: string; role: string | null; last_read_at: string | null }>) {
    const bucket = participantsByThread.get(participant.thread_id) ?? [];
    bucket.push(participant);
    participantsByThread.set(participant.thread_id, bucket);
  }

  const directLabels = new Map<string, { id: string; name: string | null }>();
  for (const thread of (threadRows ?? []) as Array<{ id: string; kind: string }>) {
    if (thread.kind === "direct") {
      const label = await resolveDirectThreadLabel(supabase, thread.id);
      if (label) directLabels.set(thread.id, label);
    }
  }

  return ((threadRows ?? []) as Array<{ id: string; kind: "job" | "direct"; title: string | null; appointment_id: string | null; service_record_id: string | null; created_by: string | null; created_at: string }>)
    .map((thread) => {
      const messages = messagesByThread.get(thread.id) ?? [];
      const participants = (participantsByThread.get(thread.id) ?? []).map((participant) => {
        const displayName = displayNames.get(participant.user_id) ?? null;
        return {
          userId: participant.user_id,
          role: participant.role ?? null,
          displayName,
          initials: initialsForName(displayName),
          lastReadAt: participant.last_read_at,
        };
      });
      const record = thread.service_record_id ? serviceRecordById.get(thread.service_record_id) : null;
      const serviceRecordAppointment = thread.service_record_id ? serviceRecordAppointments.get(thread.service_record_id) ?? null : null;
      const fallbackCustomer = serviceRecordAppointment?.customerName ?? null;
      const jobContext = record
        ? {
            id: record.id,
            title: inferJobTitle({
              ...record,
              customers: record.customers ?? (fallbackCustomer ? { name: fallbackCustomer } : null),
            }),
            jobNumber: record.job_number ?? null,
            customerName: serviceRecordAppointment?.customerName ?? null,
            scheduledDate: serviceRecordAppointment?.scheduledDate ?? null,
          }
        : null;
      const mine = participants.find((participant) => participant.userId === userId);
      const lastReadAt = mine?.lastReadAt ?? null;
      const latestActivity = [thread.created_at, ...messages.map((message) => message.created_at)].sort().at(-1) ?? thread.created_at;

      let otherUser: InternalInboxThreadDetail["otherUser"] = null;
      if (thread.kind === "direct") {
        const label = directLabels.get(thread.id);
        const otherParticipant = participants.find((participant) => participant.userId !== userId);
        const otherId = otherParticipant?.userId ?? label?.id ?? null;
        if (otherId) {
          const displayName = otherParticipant?.displayName ?? label?.name ?? displayNames.get(otherId) ?? null;
          otherUser = { userId: otherId, displayName, initials: initialsForName(displayName) };
        }
      }

      return {
        id: thread.id,
        kind: thread.kind,
        title: thread.title ?? null,
        appointmentId: thread.appointment_id ?? null,
        serviceRecordId: thread.service_record_id,
        createdBy: thread.created_by,
        createdAt: thread.created_at,
        jobContext,
        participants,
        messages,
        lastReadAt,
        latestActivity,
        otherUser,
      };
    })
    .sort((a, b) => b.latestActivity.localeCompare(a.latestActivity));
}

async function listInternalThreads(
  supabase: MessagingSupabase,
  userId: string,
): Promise<InternalInboxThreadDetail[]> {
  const threadIds = await listVisibleThreadIds(supabase, userId);
  return assembleThreadDetails(supabase, threadIds, userId);
}

messagingRouter.get("/v1/internal-inbox/threads", async (c) => {
  const { supabase, user } = await requireAuth(c);
  return json({ data: await listInternalThreads(supabase as unknown as MessagingSupabase, user.id) });
});

messagingRouter.get("/v1/internal-inbox/threads/:threadId/messages", async (c) => {
  const threadId = z.string().uuid().parse(c.req.param("threadId"));
  const { supabase, user } = await requireAuth(c);
  const visible = await listVisibleThreadIds(supabase as unknown as MessagingSupabase, user.id);
  if (!visible.includes(threadId)) throw new ApiError(403, "Thread access denied", "forbidden");
  const details = await assembleThreadDetails(supabase as unknown as MessagingSupabase, [threadId], user.id);
  if (!details.length) throw new ApiError(404, "Thread not found", "not_found");
  return json({ data: details[0] });
});

const internalMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  attachments: z.array(z.string().max(2048)).max(20).optional(),
});

messagingRouter.post("/v1/internal-inbox/threads/:threadId/messages", async (c) => {
  const threadId = z.string().uuid().parse(c.req.param("threadId"));
  const body = internalMessageSchema.parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.rpc("send_internal_thread_message_v1", {
    p_thread_id: threadId,
    p_content: body.content,
    p_attachments: body.attachments ?? [],
  });
  if (error) throw error;
  return json({ data: data ?? null }, { status: 201 });
});

messagingRouter.post("/v1/internal-inbox/threads/:threadId/read", async (c) => {
  const threadId = z.string().uuid().parse(c.req.param("threadId"));
  const { supabase, user } = await requireAuth(c);
  const visible = await listVisibleThreadIds(supabase as unknown as MessagingSupabase, user.id);
  if (!visible.includes(threadId)) throw new ApiError(403, "Thread access denied", "forbidden");
  const { error } = await supabase
    .from("job_thread_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ ok: true });
});

messagingRouter.post("/v1/internal-inbox/threads/direct", async (c) => {
  const { other_user_id } = z.object({ other_user_id: z.string().uuid() }).parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.rpc("ensure_direct_thread", { p_other_user_id: other_user_id });
  if (error) throw error;
  const threadId = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
  if (!threadId) throw new ApiError(500, "Failed to create direct thread", "thread_error");
  return json({ data: { threadId } }, { status: 201 });
});

messagingRouter.get("/v1/internal-inbox/dm-candidates", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: membershipRows, error: membershipError } = await supabase
    .from("workspace_members")
    .select("user_id, workspace_id")
    .eq("user_id", user.id)
    .is("deactivated_at", null);
  if (membershipError) throw membershipError;

  const workspaceIds = Array.from(
    new Set(
      ((membershipRows ?? []) as Array<{ workspace_id: string | null }>)
        .map((row) => row.workspace_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!workspaceIds.length) return json({ data: [] });

  const { data: memberRows, error: memberError } = await supabase
    .from("workspace_members")
    .select("user_id, display_name, role, job_title")
    .in("workspace_id", workspaceIds)
    .is("deactivated_at", null)
    .neq("user_id", user.id);
  if (memberError) throw memberError;

  const byUserId = new Map<string, any>();
  for (const row of (memberRows ?? []) as Array<any>) {
    if (row?.user_id && !byUserId.has(row.user_id)) byUserId.set(row.user_id, row);
  }
  const candidateIds = Array.from(byUserId.keys());
  if (!candidateIds.length) return json({ data: [] });

  const [linkRows, technicianRows, directThreads] = await Promise.all([
    supabase.from("team_user_links").select("user_id, linked_customer_id").in("user_id", candidateIds),
    supabase.from("technicians").select("user_id, name").in("user_id", candidateIds),
    supabase.from("job_threads").select("id").eq("kind", "direct"),
  ]);
  if (linkRows.error) throw linkRows.error;
  if (technicianRows.error) throw technicianRows.error;
  if (directThreads.error) throw directThreads.error;

  const directThreadIds = ((directThreads.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  let existingOtherUserIds: string[] = [];
  if (directThreadIds.length) {
    const { data: participationRows, error: participationError } = await supabase
      .from("job_thread_participants")
      .select("thread_id, user_id")
      .in("thread_id", directThreadIds)
      .is("removed_at", null);
    if (participationError) throw participationError;
    const byThread = new Map<string, string[]>();
    for (const row of (participationRows ?? []) as Array<{ thread_id: string; user_id: string }>) {
      const bucket = byThread.get(row.thread_id) ?? [];
      bucket.push(row.user_id);
      byThread.set(row.thread_id, bucket);
    }
    existingOtherUserIds = Array.from(byThread.values())
      .filter((ids) => ids.includes(user.id))
      .map((ids) => ids.find((id) => id !== user.id))
      .filter((id): id is string => Boolean(id));
  }

  const linkedUserIds = new Set(
    ((linkRows.data ?? []) as Array<{ user_id: string; linked_customer_id: unknown }>)
      .filter((row) => row.linked_customer_id !== null && row.linked_customer_id !== undefined)
      .map((row) => row.user_id),
  );
  const technicianNameByUserId = new Map(
    ((technicianRows.data ?? []) as Array<{ user_id: string; name: string }>).map((row) => [row.user_id, row.name]),
  );

  return json({
    data: candidateIds
      .map((candidateId) => {
        const member = byUserId.get(candidateId);
        const displayName = technicianNameByUserId.get(candidateId) ?? member.display_name ?? null;
        const subtitle = linkedUserIds.has(candidateId)
          ? "Driver"
          : (member.job_title as string | null) ?? (member.role as string | null) ?? "Team member";
        return {
          userId: candidateId,
          displayName,
          subtitle,
          initials: initialsForName(displayName),
          hasExistingDm: existingOtherUserIds.includes(candidateId),
        };
      })
      .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "")),
  });
});

// Lightweight polling feed for the realtime inbox (replaces the browser
// Supabase realtime subscription, which has no server-side equivalent). The
// client long-polls with `?since=` and merges new messages into its cache.
messagingRouter.get("/v1/internal-inbox/messages", async (c) => {
  const params = z
    .object({ since: z.string().max(64).optional() })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase, user } = await requireAuth(c);
  const sinceDate = params.since ? new Date(params.since) : new Date(0);
  if (Number.isNaN(sinceDate.getTime())) throw new ApiError(400, "Invalid since parameter", "invalid_input");

  const threadIds = await listVisibleThreadIds(supabase as unknown as MessagingSupabase, user.id);
  if (!threadIds.length) return json({ data: [] });
  const { data, error } = await supabase
    .from("job_thread_messages")
    .select("id, thread_id, sender_id, sender_role, content, attachments, created_at, edited_at")
    .in("thread_id", threadIds)
    .is("deleted_at", null)
    .gt("created_at", sinceDate.toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

messagingRouter.get("/v1/internal-inbox/me", async (c) => {
  const { user } = await requireAuth(c);
  return json({ data: { userId: user.id } });
});

// ---------------------------------------------------------------------------
// Technician push subscriptions (user-scoped upsert)
// ---------------------------------------------------------------------------

const techPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(1024),
  auth_key: z.string().min(1).max(1024),
  user_agent: z.string().max(1024).optional(),
});

messagingRouter.post("/v1/tech-push/subscriptions", async (c) => {
  const body = techPushSubscriptionSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase.from("tech_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth_key: body.auth_key,
      user_agent: body.user_agent ?? null,
      disabled_at: null,
    },
    { onConflict: "endpoint", ignoreDuplicates: false },
  );
  if (error) throw error;
  return json({ ok: true }, { status: 201 });
});
