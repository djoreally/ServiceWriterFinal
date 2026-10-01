/**
 * Billing & payments domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/billing/checkout/route.ts
 * - app/api/v1/billing/portal/route.ts
 * - app/api/v1/billing/seats/route.ts
 * - app/api/v1/billing/subscription/route.ts
 * - app/api/v1/payments/route.ts
 * - app/api/v1/payments/[id]/route.ts
 * - app/api/v1/payments/actions/route.ts
 * - app/api/v1/payments/stripe-direct/route.ts
 *
 * Paths are registered relative to the `/api` basePath handled by `app.ts`.
 *
 * Behavioral nuance preserved: repo-root `proxy.ts` rewrites incoming
 * `/api/v1/payments/actions` requests to `/api/v1/payments/actions-entitled`,
 * which has no route — so live traffic to `/v1/payments/actions` currently
 * resolves to 404. The route is migrated as-is (no `actions-entitled` route
 * is created) so this behavior is unchanged.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
// Server-side Hono route: Stripe SDK usage here is backend code, not frontend.
// eslint-disable-next-line no-restricted-imports
import Stripe from "stripe";
import { ApiError, json, paginationSchema } from "@/server/api";
import {
  requireAuth,
  requireWorkspaceAuth,
  requireWorkspacePaymentsAddonAuth,
} from "@/server/hono/middleware/auth";
import type { RequestAuthContext } from "@/server/hono/types";
import {
  checkoutCatalogKeys,
  ensureWorkspaceBilling,
  getCatalogPrice,
  resolveAuthorizedBillingWorkspace,
  stripeBillingClient,
} from "@/server/billing/workspace-billing";
import {
  dispatchPaymentLifecycle,
  LIFECYCLE_EVENT_KEYS,
} from "@/server/messaging/quote-payment-events";
import {
  markStripeInvoicePaidOutOfBand,
  syncCanonicalInvoiceToStripe,
} from "@/server/payments/stripe-invoice-sync";
import {
  resolveStripeWorkspaceExecution,
  type StripeWorkspaceExecution,
} from "@/server/payments/stripe-workspace-execution";
import { createSupabaseAdminClient, createSupabaseAnonServerClient, supabaseFunctionsBaseUrl, supabasePublishableKey } from "@/lib/supabase";
import { encryptPaymentCredential } from "@/server/payments/stripe-workspace-execution";

export const billingRouter = new Hono();

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

const checkoutSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  plan_tier: z.enum(["basic", "pro", "fleet"]),
  billing_interval: z.enum(["monthly", "annual"]).default("monthly"),
  payments_addon_active: z.boolean().default(false),
  additional_technician_quantity: z.number().int().min(0).max(500).default(0),
});

billingRouter.post("/v1/billing/checkout", async (c) => {
  const request = c.req.raw;
  const body = checkoutSchema.parse(await request.json());
  const { admin, user, workspace } = await resolveAuthorizedBillingWorkspace(request, body.workspace_id);
  const billing = await ensureWorkspaceBilling(admin, workspace.id);

  if (billing.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(billing.subscription_status)) {
    throw new ApiError(409, "This workspace already has a Stripe subscription. Manage the existing subscription instead of creating another one.", "subscription_exists");
  }

  const catalogKeys = checkoutCatalogKeys({
    planTier: body.plan_tier,
    interval: body.billing_interval,
    paymentsAddonActive: body.payments_addon_active,
    additionalTechnicianQuantity: body.additional_technician_quantity,
  });

  if (catalogKeys.length === 0) {
    const { error } = await admin.from("workspace_billing").update({
      plan_tier: "basic",
      billing_interval: body.billing_interval,
      payments_addon_active: false,
      additional_technician_quantity: 0,
      subscription_status: "active",
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
    }).eq("workspace_id", workspace.id);
    if (error) throw error;
    return json({ free: true, redirect_url: "/dashboard" });
  }

  const catalog = await Promise.all(catalogKeys.map(async (item) => ({
    item,
    price: await getCatalogPrice(admin, item.key),
  })));

  const stripe = stripeBillingClient();
  let customerId = billing.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: workspace.name,
      metadata: { workspace_id: workspace.id, service_writer_billing: "true" },
    }, { idempotencyKey: `service-writer-customer:${workspace.id}` });
    customerId = customer.id;
    const { error } = await admin.from("workspace_billing").update({ stripe_customer_id: customerId }).eq("workspace_id", workspace.id);
    if (error) throw error;
  }

  const origin = new URL(request.url).origin;
  const metadata = {
    workspace_id: workspace.id,
    plan_tier: body.plan_tier,
    billing_interval: body.billing_interval,
    payments_addon_active: String(body.payments_addon_active),
    additional_technician_quantity: String(body.additional_technician_quantity),
    service_writer_billing: "true",
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: catalog.map(({ item, price }) => ({ price: price.stripe_price_id, quantity: item.quantity })),
    client_reference_id: workspace.id,
    metadata,
    subscription_data: { metadata },
    success_url: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
    billing_address_collection: "auto",
  }, {
    idempotencyKey: [
      "service-writer-checkout",
      workspace.id,
      body.plan_tier,
      body.billing_interval,
      body.payments_addon_active ? "payments" : "no-payments",
      body.additional_technician_quantity,
    ].join(":"),
  });

  if (!session.url) throw new Error("Stripe Checkout did not return a hosted URL");
  return json({ url: session.url, session_id: session.id, workspace_id: workspace.id });
});

const portalSchema = z.object({ workspace_id: z.string().uuid().optional() });

billingRouter.post("/v1/billing/portal", async (c) => {
  const request = c.req.raw;
  const body = portalSchema.parse(await request.json().catch(() => ({})));
  const { admin, workspace } = await resolveAuthorizedBillingWorkspace(request, body.workspace_id);
  const billing = await ensureWorkspaceBilling(admin, workspace.id);
  if (!billing.stripe_customer_id) {
    throw new ApiError(409, "This workspace does not have a Stripe billing customer yet", "billing_customer_missing");
  }

  const stripe = stripeBillingClient();
  const origin = new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${origin}/settings?billing=return`,
  });

  return json({ url: session.url });
});

const seatsSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  additional_technician_quantity: z.number().int().min(0).max(500),
});

billingRouter.post("/v1/billing/seats", async (c) => {
  const request = c.req.raw;
  const body = seatsSchema.parse(await request.json());
  const { admin, workspace } = await resolveAuthorizedBillingWorkspace(request, body.workspace_id);
  const billing = await ensureWorkspaceBilling(admin, workspace.id);

  if (billing.plan_tier !== "pro" && billing.plan_tier !== "fleet") {
    throw new ApiError(409, "Technician seats require Pro or Fleet", "technician_plan_required");
  }
  if (!billing.stripe_subscription_id || !["active", "trialing"].includes(billing.subscription_status)) {
    throw new ApiError(409, "An active Stripe subscription is required to change technician seats", "active_subscription_required");
  }

  const included = billing.plan_tier === "pro" ? 3 : 5;
  const { count, error: countError } = await admin
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("role", "technician")
    .eq("is_active", true);
  if (countError) throw countError;

  const minimumAdditional = Math.max(0, (count ?? 0) - included);
  if (body.additional_technician_quantity < minimumAdditional) {
    throw new ApiError(
      409,
      `This workspace currently needs at least ${minimumAdditional} additional technician seat${minimumAdditional === 1 ? "" : "s"}`,
      "technician_seats_in_use",
    );
  }

  if (body.additional_technician_quantity === billing.additional_technician_quantity) {
    return json({
      data: {
        workspace_id: workspace.id,
        additional_technician_quantity: billing.additional_technician_quantity,
        unchanged: true,
      },
    });
  }

  const price = await getCatalogPrice(
    admin,
    `${billing.plan_tier}_technician_${billing.billing_interval}`,
  );
  const stripe = stripeBillingClient();
  const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
  const seatItem = subscription.items.data.find((item) => item.price.id === price.stripe_price_id);

  const items = body.additional_technician_quantity === 0
    ? seatItem
      ? [{ id: seatItem.id, deleted: true as const }]
      : []
    : seatItem
      ? [{ id: seatItem.id, quantity: body.additional_technician_quantity }]
      : [{ price: price.stripe_price_id, quantity: body.additional_technician_quantity }];

  const updated = await stripe.subscriptions.update(
    subscription.id,
    {
      ...(items.length ? { items } : {}),
      proration_behavior: "create_prorations",
      metadata: {
        ...subscription.metadata,
        workspace_id: workspace.id,
        plan_tier: billing.plan_tier,
        billing_interval: billing.billing_interval,
        payments_addon_active: String(billing.payments_addon_active),
        additional_technician_quantity: String(body.additional_technician_quantity),
        service_writer_billing: "true",
      },
    },
    {
      idempotencyKey: `service-writer-seats:${workspace.id}:${body.additional_technician_quantity}:${billing.billing_interval}`,
    },
  );

  return json({
    data: {
      workspace_id: workspace.id,
      subscription_id: updated.id,
      additional_technician_quantity: body.additional_technician_quantity,
      status: updated.status,
      pending_webhook_reconciliation: true,
    },
  });
});

billingRouter.get("/v1/billing/subscription", async (c) => {
  const request = c.req.raw;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id");

  let resolved;
  try {
    resolved = await resolveAuthorizedBillingWorkspace(request, workspaceId);
  } catch (error) {
    if (!workspaceId && error instanceof ApiError && error.code === "billing_workspace_missing") {
      return json({
        workspace: null,
        billing: {
          workspace_id: null,
          plan_tier: "basic",
          billing_interval: "monthly",
          payments_addon_active: false,
          additional_technician_quantity: 0,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: "active",
          current_period_end: null,
          cancel_at_period_end: false,
        },
        entitlements: null,
        usage: { technician_count: 0, technicians_remaining: 0 },
        provisional: true,
      });
    }
    throw error;
  }

  const { admin, workspace } = resolved;
  const billing = await ensureWorkspaceBilling(admin, workspace.id);

  const [{ data: entitlement, error: entitlementError }, technicianCount] = await Promise.all([
    admin.rpc("get_workspace_billing_v1", { p_workspace_id: workspace.id }),
    admin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("role", "technician")
      .eq("is_active", true),
  ]);
  if (entitlementError) throw entitlementError;
  if (technicianCount.error) throw technicianCount.error;

  const entitlements = entitlement?.[0] ?? null;
  const technician_count = technicianCount.count ?? 0;
  const technician_limit = entitlements?.entitled_technicians ?? 0;

  return json({
    workspace: { id: workspace.id, name: workspace.name },
    billing,
    entitlements,
    usage: {
      technician_count,
      technicians_remaining: Math.max(0, technician_limit - technician_count),
    },
    provisional: false,
  });
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const paymentStatusSchema = z.enum(["pending", "succeeded", "failed", "refunded", "partially_refunded"]);
const providerSchema = z.enum(["stripe", "square", "quickbooks", "google_calendar", "resend", "sms", "carfax", "mapbox", "ai", "other"]);

const paymentSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: providerSchema.nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: paymentStatusSchema.default("pending"),
  amount: z.number().finite().positive(),
  currency_code: z.string().trim().length(3).toUpperCase().default("USD"),
  paid_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

billingRouter.get("/v1/payments", async (c) => {
  const request = c.req.raw;
  const url = new URL(request.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspacePaymentsAddonAuth(c, workspaceId, undefined);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase
    .from("payments")
    .select("*, invoices(id,invoice_number,total,amount_paid,status), customers(id,first_name,last_name,email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

billingRouter.post("/v1/payments", async (c) => {
  const request = c.req.raw;
  const body = paymentSchema.parse(await request.json());
  const { supabase, user } = await requireWorkspacePaymentsAddonAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
  const metadata = body.metadata ?? {};
  const appointmentId = metadataString(metadata, "appointment_id");
  const paymentType = metadataString(metadata, "payment_type");

  if (!body.invoice_id && !body.customer_id && !body.provider_payment_id && !appointmentId) {
    return json({
      error: {
        code: "payment_provenance_required",
        message: "Payment must reference an invoice, customer, provider payment, or appointment.",
      },
    }, { status: 422 });
  }

  if (body.invoice_id) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,customer_id,status")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.invoice_id)
      .single();
    if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
    if (invoice.status === "void") {
      return json({ error: { code: "invoice_void", message: "Payments cannot be posted to a void invoice." } }, { status: 409 });
    }
    if (body.customer_id && body.customer_id !== invoice.customer_id) {
      return json({ error: { code: "customer_mismatch", message: "Payment customer does not match the invoice customer." } }, { status: 409 });
    }
  }

  if (body.status === "pending" && appointmentId && !body.provider_payment_id) {
    let duplicateQuery = (supabase.from("payments") as any)
      .select("*")
      .eq("workspace_id", body.workspace_id)
      .eq("status", "pending")
      .eq("metadata->>appointment_id", appointmentId)
      .limit(1);
    if (paymentType) duplicateQuery = duplicateQuery.eq("metadata->>payment_type", paymentType);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate?.id) {
      return json({ data: duplicate, reused: true });
    }
  }

  const paidAt = body.status === "succeeded" && !body.paid_at ? new Date().toISOString() : body.paid_at ?? null;
  const { data, error } = await (supabase.from("payments") as any)
    .insert({
      workspace_id: body.workspace_id,
      invoice_id: body.invoice_id ?? null,
      customer_id: body.customer_id ?? null,
      provider: body.provider ?? null,
      provider_payment_id: body.provider_payment_id ?? null,
      status: body.status,
      amount: body.amount,
      currency_code: body.currency_code,
      paid_at: paidAt,
      created_by: user.id,
      metadata,
    })
    .select()
    .single();
  if (error) throw error;

  if (data?.customer_id && (data.status === "succeeded" || data.status === "failed")) {
    const { data: customer } = await supabase
      .from("customers")
      .select("first_name,last_name,email")
      .eq("workspace_id", body.workspace_id)
      .eq("id", data.customer_id)
      .maybeSingle();
    if (customer?.email) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name,timezone")
        .eq("id", body.workspace_id)
        .single();
      const eventKey = data.status === "succeeded"
        ? LIFECYCLE_EVENT_KEYS.paymentReceipt
        : LIFECYCLE_EVENT_KEYS.paymentFailed;
      void dispatchPaymentLifecycle({
        eventKey,
        eventId: data.id,
        payment: {
          ...data,
          customer_email: customer.email,
          customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: new URL(String((data.metadata as Record<string, unknown> | null)?.payment_url || `/payments/${data.id}`), request.url).toString(),
      }).catch((dispatchError) => console.error("[Lifecycle] payment creation email failed", dispatchError));
    }
  }

  return json({ data }, { status: 201 });
});

const patchPaymentSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: providerSchema.nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: paymentStatusSchema.optional(),
  amount: z.number().nonnegative().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one payment field is required",
});

billingRouter.get("/v1/payments/:id", async (c) => {
  const request = c.req.raw;
  const id = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspacePaymentsAddonAuth(c, workspaceId, undefined);
  const { data, error } = await supabase
    .from("payments")
    .select("*, invoices(id,invoice_number,total,amount_paid,status), customers(id,first_name,last_name,email)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.patch("/v1/payments/:id", async (c) => {
  const request = c.req.raw;
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = patchPaymentSchema.parse(await request.json());
  const { workspace_id, ...patch } = body;
  const { supabase } = await requireWorkspacePaymentsAddonAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

  if (body.invoice_id) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,customer_id,status")
      .eq("workspace_id", workspace_id)
      .eq("id", body.invoice_id)
      .single();
    if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
    if (invoice.status === "void") {
      return json({ error: { code: "invoice_void", message: "Payments cannot be linked to a void invoice." } }, { status: 409 });
    }
    if (body.customer_id && body.customer_id !== invoice.customer_id) {
      return json({ error: { code: "customer_mismatch", message: "Payment customer does not match the invoice customer." } }, { status: 409 });
    }
  }

  if (body.status === "succeeded" && body.paid_at === undefined) {
    patch.paid_at = new Date().toISOString();
  }

  const { data, error } = await (supabase.from("payments") as any)
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspace_id)
    .select()
    .single();
  if (error) throw error;

  if (data?.customer_id && ["succeeded", "failed", "refunded", "partially_refunded"].includes(data.status)) {
    const { data: customer } = await supabase
      .from("customers")
      .select("first_name,last_name,email")
      .eq("workspace_id", workspace_id)
      .eq("id", data.customer_id)
      .maybeSingle();
    if (customer?.email) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name,timezone")
        .eq("id", workspace_id)
        .single();
      const eventKey = data.status === "succeeded"
        ? LIFECYCLE_EVENT_KEYS.paymentReceipt
        : data.status === "failed"
          ? LIFECYCLE_EVENT_KEYS.paymentFailed
          : LIFECYCLE_EVENT_KEYS.refundIssued;
      void dispatchPaymentLifecycle({
        eventKey,
        eventId: `${data.id}:${data.status}:${data.paid_at || "state"}`,
        payment: {
          ...data,
          customer_email: customer.email,
          customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        },
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: new URL(String((data.metadata as Record<string, unknown> | null)?.payment_url || `/payments/${data.id}`), request.url).toString(),
      }).catch((dispatchError) => console.error("[Lifecycle] payment status email failed", dispatchError));
    }
  }

  return json({ data });
});

billingRouter.delete("/v1/payments/:id", async (c) => {
  const request = c.req.raw;
  const id = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
  await requireWorkspacePaymentsAddonAuth(c, workspaceId, ["owner", "admin", "manager"]);
  return json({
    error: {
      code: "ledger_record_immutable",
      message: `Payment ${id} cannot be deleted. Use the refund or status workflow so the financial audit trail is preserved.`,
    },
  }, { status: 409 });
});

// ---------------------------------------------------------------------------
// Payment actions
// ---------------------------------------------------------------------------

const actionsSchema = z.discriminatedUnion("action", [
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

billingRouter.post("/v1/payments/actions", async (c) => {
  const request = c.req.raw;
  const body = actionsSchema.parse(await request.json());
  const roles = ["owner", "admin", "manager", "service_advisor", "receptionist"];

  if (body.action === "send_manual_invoice") {
    await requireWorkspaceAuth(c, body.workspace_id, roles);
    return json({
      error: {
        code: "invoice_domain_required",
        message: "Manual invoice delivery has moved to /api/v1/invoices/{id}/send.",
      },
    }, { status: 410 });
  }

  const { supabase } = await requireWorkspacePaymentsAddonAuth(c, body.workspace_id, roles);

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
});

// ---------------------------------------------------------------------------
// Stripe direct
// ---------------------------------------------------------------------------

const configureSchema = z.object({
  // Optional: when omitted, the workspace is resolved server-side from the
  // auth token (first active membership). The client never passes it.
  workspace_id: z.string().uuid().optional(),
  account_id: z.string().startsWith("acct_"),
  secret_key: z.string().min(20),
  webhook_secret: z.string().min(10),
});

function directStatus(operational: Record<string, unknown>) {
  return {
    mode: operational.stripe_payment_mode === "direct" ? "direct" : "connect",
    configured: typeof operational.stripe_direct_account_id === "string",
    accountId: typeof operational.stripe_direct_account_id === "string" ? operational.stripe_direct_account_id : null,
    keyLast4: typeof operational.stripe_direct_key_last4 === "string" ? operational.stripe_direct_key_last4 : null,
    chargesEnabled: operational.stripe_direct_charges_enabled === true,
    payoutsEnabled: operational.stripe_direct_payouts_enabled === true,
    detailsSubmitted: operational.stripe_direct_details_submitted === true,
    webhookConfigured: typeof operational.stripe_direct_webhook_secret_encrypted === "string",
    checkedAt: typeof operational.stripe_direct_checked_at === "string" ? operational.stripe_direct_checked_at : null,
  };
}

async function readSettings(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workspace_settings")
    .select("payment_provider,operational_settings")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return { admin, settings: data };
}

billingRouter.get("/v1/payments/stripe-direct", async (c) => {
  const request = c.req.raw;
  let workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) {
    workspaceId = (await resolveBillingWorkspace(c)).workspaceId;
  }
  await requireWorkspacePaymentsAddonAuth(c, workspaceId, undefined);
  const { settings } = await readSettings(workspaceId);
  return json({ data: directStatus(object(settings.operational_settings)) });
});

billingRouter.put("/v1/payments/stripe-direct", async (c) => {
  const request = c.req.raw;
  const body = configureSchema.parse(await request.json());
  const workspaceId = body.workspace_id ?? (await resolveBillingWorkspace(c)).workspaceId;
  await requireWorkspacePaymentsAddonAuth(c, workspaceId, ["owner", "admin", "platform_admin"]);

  if (!body.secret_key.startsWith("sk_")) {
    throw new ApiError(400, "Enter a valid Stripe secret API key", "invalid_stripe_key");
  }
  if (!body.webhook_secret.startsWith("whsec_")) {
    throw new ApiError(400, "Enter a valid Stripe webhook signing secret", "invalid_webhook_secret");
  }

  const stripe = new Stripe(body.secret_key);
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(body.account_id);
  } catch (error) {
    console.error("[stripe-direct] credential validation failed", error);
    throw new ApiError(400, "Stripe rejected this account ID / API key combination", "stripe_key_rejected");
  }
  if (account.id !== body.account_id) {
    throw new ApiError(400, "Stripe account ID does not match the validated account", "stripe_account_mismatch");
  }

  const { admin, settings } = await readSettings(workspaceId);
  const operational = object(settings.operational_settings);
  const checkedAt = new Date().toISOString();
  const nextOperational = {
    ...operational,
    stripe_payment_mode: "direct",
    stripe_direct_account_id: account.id,
    stripe_direct_secret_encrypted: encryptPaymentCredential(body.secret_key),
    stripe_direct_webhook_secret_encrypted: encryptPaymentCredential(body.webhook_secret),
    stripe_direct_key_last4: body.secret_key.slice(-4),
    stripe_direct_charges_enabled: account.charges_enabled === true,
    stripe_direct_payouts_enabled: account.payouts_enabled === true,
    stripe_direct_details_submitted: account.details_submitted === true,
    stripe_direct_checked_at: checkedAt,
  };

  const { error: updateError } = await admin
    .from("workspace_settings")
    .update({ payment_provider: "stripe", operational_settings: nextOperational })
    .eq("workspace_id", workspaceId);
  if (updateError) throw updateError;

  return json({ data: directStatus(nextOperational) });
});

billingRouter.delete("/v1/payments/stripe-direct", async (c) => {
  const request = c.req.raw;
  let workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId) {
    workspaceId = (await resolveBillingWorkspace(c)).workspaceId;
  }
  await requireWorkspacePaymentsAddonAuth(c, workspaceId, ["owner", "admin", "platform_admin"]);

  const { admin, settings } = await readSettings(workspaceId);
  const nextOperational = { ...object(settings.operational_settings) };
  for (const key of [
    "stripe_direct_account_id",
    "stripe_direct_secret_encrypted",
    "stripe_direct_webhook_secret_encrypted",
    "stripe_direct_key_last4",
    "stripe_direct_charges_enabled",
    "stripe_direct_payouts_enabled",
    "stripe_direct_details_submitted",
    "stripe_direct_checked_at",
  ]) {
    delete nextOperational[key];
  }
  nextOperational.stripe_payment_mode = "connect";

  const { error } = await admin
    .from("workspace_settings")
    .update({ operational_settings: nextOperational })
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  return json({ data: directStatus(nextOperational) });
});

// ---------------------------------------------------------------------------
// Phase 2 — frontend decoupling endpoints
//
// The browser application layer (`src/application/...`) reaches every
// endpoint below through the sanctioned API client (`@/lib/api-client`).
// The workspace is always resolved server-side from the auth token; the
// client never passes `workspace_id` for authorization. Endpoints that
// proxy legacy Supabase Edge Functions forward the incoming bearer token
// (when present) plus the publishable key, preserving the functions'
// existing auth behavior exactly.
// ---------------------------------------------------------------------------

type BillingServerContext = {
  supabase: RequestAuthContext["supabase"];
  user: RequestAuthContext["user"];
  workspaceId: string;
};

/** Resolve the caller's active workspace from the auth token (first active membership). */
async function resolveBillingWorkspace(c: Context): Promise<BillingServerContext> {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,is_active,workspaces!inner(is_active)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  const memberships = ((data ?? []) as unknown) as Array<{
    workspace_id: string;
    workspaces: { is_active: boolean } | Array<{ is_active: boolean }> | null;
  }>;
  const workspaceId =
    memberships.find((m) => {
      const joined = m.workspaces;
      const active = Array.isArray(joined) ? joined[0]?.is_active !== false : joined?.is_active !== false;
      return active;
    })?.workspace_id ?? null;
  if (!workspaceId) {
    throw new ApiError(403, "No active workspace is available for this account", "workspace_missing");
  }
  return { supabase, user, workspaceId };
}

function edgeFunctionErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    const nested = record.error as Record<string, unknown> | null;
    if (nested && typeof nested.message === "string" && nested.message.trim()) return nested.message;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
  }
  return "The payment service request failed.";
}

/**
 * Invoke a legacy Supabase Edge Function server-side. The incoming bearer
 * token is forwarded when present (the functions validate the user JWT
 * themselves); the publishable key covers public (tokenless) calls. Error
 * bodies are translated into the `{ error: { code, message } }` envelope
 * with the function's message preserved verbatim — client error parsers
 * match on that text.
 */
async function proxyEdgeFunction(
  c: Context,
  functionName: string,
  options: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {},
) {
  const request = c.req.raw;
  const url = new URL(`${supabaseFunctionsBaseUrl()}/${functionName}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) url.searchParams.set(key, value);
  }
  const headers = new Headers();
  headers.set("apikey", supabasePublishableKey());
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);
  const method = options.method ?? "POST";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url.toString(), init);
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const status = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw new ApiError(status, edgeFunctionErrorMessage(payload), "edge_function_error");
  }
  return json(payload);
}

function actorDisplayName(user: RequestAuthContext["user"]): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  const fallbackName = typeof meta.full_name === "string" ? meta.full_name : "";
  const email = typeof user.email === "string" ? user.email : "";
  return fullName || fallbackName || email || "Team member";
}

async function logExpenseActivityServer(
  supabase: RequestAuthContext["supabase"],
  input: {
    workspaceId: string;
    expenseId: string;
    actorUserId: string;
    actorName: string;
    eventType: string;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await (supabase.from("expense_activity") as any).insert({
    workspace_id: input.workspaceId,
    expense_id: input.expenseId,
    actor_user_id: input.actorUserId,
    actor_name: input.actorName,
    event_type: input.eventType,
    details: input.details ?? {},
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Messaging billing (addon checkout + usage stats)
// ---------------------------------------------------------------------------

const messagingAddonCheckoutSchema = z.object({
  bundle_key: z.string().trim().min(1).max(120),
});

billingRouter.post("/v1/billing/messaging-addon-checkout", async (c) => {
  const body = messagingAddonCheckoutSchema.parse(await c.req.raw.json());
  // Public edge function (the BillingSettings page itself is auth-gated);
  // the bearer token is forwarded when the caller has a session.
  return proxyEdgeFunction(c, "create-messaging-addon-checkout", {
    body: { bundleKey: body.bundle_key },
  });
});

billingRouter.get("/v1/billing/messaging-stats", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [outbound, failed, replies, optOuts] = await Promise.all([
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "outbound").in("status", ["sent", "delivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "outbound").in("status", ["failed", "undelivered"]),
    supabase.from("sms_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("direction", "inbound").eq("message_type", "reply"),
    supabase.from("sms_opt_outs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  if (outbound.error) throw outbound.error;
  if (failed.error) throw failed.error;
  if (replies.error) throw replies.error;
  if (optOuts.error) throw optOuts.error;
  return json({
    data: {
      outbound: outbound.count ?? 0,
      failed: failed.count ?? 0,
      replies: replies.count ?? 0,
      optOuts: optOuts.count ?? 0,
    },
  });
});

// ---------------------------------------------------------------------------
// Cash drawer
// ---------------------------------------------------------------------------

const cashDrawerSettingsSchema = z.object({
  cash_drawer_enabled: z.boolean(),
  cash_drawer_type: z.string().trim().max(60),
  cash_drawer_config: z.record(z.string(), z.unknown()).default({}),
  cash_drawer_open_on_cash_payment: z.boolean(),
  cash_drawer_require_reason: z.boolean(),
});

billingRouter.get("/v1/billing/cash-drawer", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [profileRes, eventsRes, sessionsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("cash_drawer_enabled, cash_drawer_type, cash_drawer_config, cash_drawer_open_on_cash_payment, cash_drawer_require_reason, stripe_charges_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("cash_drawer_events")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cash_drawer_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  return json({
    data: {
      profile: profileRes.data ?? null,
      events: eventsRes.data ?? [],
      sessions: sessionsRes.data ?? [],
    },
  });
});

billingRouter.put("/v1/billing/cash-drawer/settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = cashDrawerSettingsSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("business_profiles") as any)
    .update({
      cash_drawer_enabled: body.cash_drawer_enabled,
      cash_drawer_type: body.cash_drawer_type,
      cash_drawer_config: body.cash_drawer_config,
      cash_drawer_open_on_cash_payment: body.cash_drawer_open_on_cash_payment,
      cash_drawer_require_reason: body.cash_drawer_require_reason,
    })
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

const cashDrawerEventSchema = z.object({
  event_type: z.string().trim().min(1).max(80),
  trigger_type: z.string().trim().min(1).max(80),
  amount: z.number().finite().nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
  payment_method: z.string().trim().max(60).nullable().optional(),
});

billingRouter.post("/v1/billing/cash-drawer/events", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = cashDrawerEventSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.rpc as any)("log_cash_drawer_event", {
    p_event_type: body.event_type,
    p_trigger_type: body.trigger_type,
    p_amount: body.amount ?? null,
    p_reason: body.reason ?? null,
    p_payment_method: body.payment_method ?? null,
  });
  if (error) throw error;
  return json({ data: { success: true } });
});

const cashDrawerSessionStartSchema = z.object({
  opening_amount: z.number().finite().min(0),
  staff_name: z.string().trim().max(200).nullable().optional(),
});

billingRouter.post("/v1/billing/cash-drawer/sessions", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = cashDrawerSessionStartSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("cash_drawer_sessions") as any)
    .insert({
      user_id: user.id,
      opening_amount: body.opening_amount,
      staff_name: body.staff_name || null,
      status: "open",
    })
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

const cashDrawerSessionEndSchema = z.object({
  closing_amount: z.number().finite().min(0),
  expected_closing: z.number().finite().min(0),
  variance_reason: z.string().trim().max(1000).nullable().optional(),
});

billingRouter.patch("/v1/billing/cash-drawer/sessions/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = cashDrawerSessionEndSchema.parse(await c.req.raw.json());
  const variance = body.closing_amount - body.expected_closing;
  const { data, error } = await (supabase.from("cash_drawer_sessions") as any)
    .update({
      ended_at: new Date().toISOString(),
      closing_amount: body.closing_amount,
      expected_closing: body.expected_closing,
      variance,
      variance_reason: Math.abs(variance) > 0.01 ? body.variance_reason ?? null : null,
      status: "closed",
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.post("/v1/billing/stripe-terminal-readers", async (c) => {
  await requireAuth(c);
  return proxyEdgeFunction(c, "stripe-terminal-readers", { body: { action: "list" } });
});

// ---------------------------------------------------------------------------
// Public booking checkout (Stripe/Square) — proxies the legacy edge functions
// ---------------------------------------------------------------------------

const publicCheckoutSchema = z.object({
  payment_provider: z.enum(["stripe", "square"]),
  checkout: z.record(z.string(), z.unknown()),
});

billingRouter.post("/v1/billing/public-checkout", async (c) => {
  const body = publicCheckoutSchema.parse(await c.req.raw.json());
  const functionName = body.payment_provider === "square" ? "create-square-payment" : "create-booking-payment";
  // Public booking page: no auth requirement. The publishable key lets the
  // edge-function gateway accept the call; the function validates the payload.
  return proxyEdgeFunction(c, functionName, { body: body.checkout });
});

billingRouter.get("/v1/billing/checkout-catalog", async (c) => {
  const businessUserId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("business_user_id") ?? "");
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await (anon.rpc as any)("get_public_service_catalog", {
    business_user_id: businessUserId,
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const expenseLineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive(),
  unit_price: z.number().finite().min(0),
  line_total: z.number().finite(),
});

const expenseHeaderSchema = z.object({
  vendor_name_raw: z.string().trim().min(1).max(300),
  category_id: z.string().uuid().nullable(),
  transaction_date: z.string().trim().min(1).max(30),
  subtotal: z.number().finite().min(0),
  tax_amount: z.number().finite().min(0),
  total_amount: z.number().finite().min(0),
  payment_method: z.string().trim().max(60).nullable(),
  last4: z.string().trim().max(10).nullable().optional(),
  reference_number: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  receipt_url: z.string().trim().max(2000).nullable().optional(),
  is_billable: z.boolean().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
});

const createExpenseSchema = expenseHeaderSchema.extend({
  submitted_by: z.string().trim().max(200).nullable().optional(),
  ocr_confidence: z.number().finite().min(0).max(1).nullable().optional(),
  ocr_raw_json: z.record(z.string(), z.unknown()).nullable().optional(),
  line_items: z.array(expenseLineItemSchema).default([]),
});

billingRouter.get("/v1/billing/expenses", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const url = new URL(c.req.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const appointmentId = url.searchParams.get("appointment_id");
  let query = (supabase.from("expenses") as any)
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });
  if (since) query = query.gte("transaction_date", since);
  if (until) query = query.lt("transaction_date", until);
  if (appointmentId) query = query.eq("appointment_id", appointmentId);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.post("/v1/billing/expenses", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const body = createExpenseSchema.parse(await c.req.raw.json());
  const metadata: Record<string, unknown> = {};
  if (body.submitted_by) metadata.submitted_by_label = body.submitted_by;
  if (body.ocr_raw_json != null) metadata.ocr_raw_json = body.ocr_raw_json;

  const { data: expense, error } = await (supabase.from("expenses") as any)
    .insert({
      workspace_id: workspaceId,
      submitted_by_user_id: user.id,
      vendor_name_raw: body.vendor_name_raw,
      category_id: body.category_id,
      transaction_date: body.transaction_date,
      subtotal: body.subtotal,
      tax_amount: body.tax_amount,
      total_amount: body.total_amount,
      payment_method: body.payment_method,
      last4: body.last4 ?? null,
      reference_number: body.reference_number ?? null,
      notes: body.notes ?? null,
      receipt_url: body.receipt_url ?? null,
      is_billable: body.is_billable ?? false,
      appointment_id: body.appointment_id ?? null,
      ocr_confidence: body.ocr_confidence ?? null,
      status: "pending",
      metadata,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  if (body.line_items.length > 0) {
    const rows = body.line_items.map((li, idx) => ({
      workspace_id: workspaceId,
      expense_id: expense.id,
      description: li.description,
      quantity: li.quantity,
      unit_cost: li.unit_price,
      line_total: li.line_total,
      sort_order: idx,
    }));
    const { error: lineError } = await (supabase.from("expense_line_items") as any).insert(rows);
    if (lineError) throw lineError;
  }

  await logExpenseActivityServer(supabase, {
    workspaceId,
    expenseId: expense.id,
    actorUserId: user.id,
    actorName: actorDisplayName(user),
    eventType: "created",
    details: { status: expense.status, total_amount: expense.total_amount, vendor_name_raw: expense.vendor_name_raw },
  });

  return json({ data: expense }, { status: 201 });
});

const updateExpenseSchema = expenseHeaderSchema.extend({
  line_items: z.array(expenseLineItemSchema).optional(),
});

billingRouter.put("/v1/billing/expenses/:id", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = updateExpenseSchema.parse(await c.req.raw.json());
  const { line_items, ...header } = body;
  const { data: expense, error } = await (supabase.from("expenses") as any)
    .update(header)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (line_items) {
    const { error: deleteError } = await (supabase.from("expense_line_items") as any)
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("expense_id", id);
    if (deleteError) throw deleteError;
    if (line_items.length > 0) {
      const rows = line_items.map((li, idx) => ({
        workspace_id: workspaceId,
        expense_id: id,
        description: li.description,
        quantity: li.quantity,
        unit_cost: li.unit_price,
        line_total: li.line_total,
        sort_order: idx,
      }));
      const { error: insertError } = await (supabase.from("expense_line_items") as any).insert(rows);
      if (insertError) throw insertError;
    }
  }

  await logExpenseActivityServer(supabase, {
    workspaceId,
    expenseId: expense.id,
    actorUserId: user.id,
    actorName: actorDisplayName(user),
    eventType: "edited",
    details: { total_amount: expense.total_amount, vendor_name_raw: expense.vendor_name_raw, line_items_count: line_items?.length ?? null },
  });
  return json({ data: expense });
});

billingRouter.post("/v1/billing/expenses/:id/approve", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const approvedAt = new Date().toISOString();
  const { data: current, error: readError } = await (supabase.from("expenses") as any)
    .select("metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const metadata = { ...((current?.metadata ?? {}) as Record<string, unknown>), approved_at: approvedAt, approved_by: user.id };
  const { data, error } = await (supabase.from("expenses") as any)
    .update({ status: "approved", metadata })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await logExpenseActivityServer(supabase, {
    workspaceId,
    expenseId: data.id,
    actorUserId: user.id,
    actorName: actorDisplayName(user),
    eventType: "approved",
    details: { status: data.status, approved_at: approvedAt },
  });
  return json({ data });
});

const rejectExpenseSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

billingRouter.post("/v1/billing/expenses/:id/reject", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = rejectExpenseSchema.parse(await c.req.raw.json());
  const { data: current, error: readError } = await (supabase.from("expenses") as any)
    .select("metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const metadata = {
    ...((current?.metadata ?? {}) as Record<string, unknown>),
    rejected_reason: body.reason,
    rejected_by: user.id,
    rejected_at: new Date().toISOString(),
  };
  const { data, error } = await (supabase.from("expenses") as any)
    .update({ status: "rejected", metadata })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await logExpenseActivityServer(supabase, {
    workspaceId,
    expenseId: data.id,
    actorUserId: user.id,
    actorName: actorDisplayName(user),
    eventType: "rejected",
    details: { reason: body.reason, status: data.status },
  });
  return json({ data });
});

billingRouter.post("/v1/billing/expenses/:id/soft-delete", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const deletedAt = new Date().toISOString();
  const { data, error } = await (supabase.from("expenses") as any)
    .update({ deleted_at: deletedAt })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await logExpenseActivityServer(supabase, {
    workspaceId,
    expenseId: data.id,
    actorUserId: user.id,
    actorName: actorDisplayName(user),
    eventType: "deleted",
    details: { deleted_at: deletedAt, vendor_name_raw: data.vendor_name_raw },
  });
  return json({ data });
});

billingRouter.get("/v1/billing/expense-categories", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { data, error } = await (supabase.from("expense_categories") as any)
    .select("id, name, is_active, is_system, sort_order")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.post("/v1/billing/expense-categories/seed", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { count, error } = await (supabase.from("expense_categories") as any)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  if ((count ?? 0) > 0) return json({ data: { seeded: false } });
  const { data, error: rpcError } = await (supabase.rpc as any)("seed_default_expense_categories", {
    p_workspace_id: workspaceId,
  });
  if (rpcError) throw rpcError;
  return json({ data: { seeded: Number(data ?? 0) > 0 } });
});

billingRouter.get("/v1/billing/expense-line-items", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const expenseId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("expense_id") ?? "");
  const { data, error } = await (supabase.from("expense_line_items") as any)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("expense_id", expenseId)
    .order("sort_order");
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/vendors", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { data, error } = await (supabase.from("vendors") as any)
    .select("id, name, normalized_name, default_category_id, vendor_type, is_active, times_seen")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(300),
  default_category_id: z.string().uuid().nullable().optional(),
  vendor_type: z.string().trim().max(60).nullable().optional(),
});

billingRouter.post("/v1/billing/vendors", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const body = createVendorSchema.parse(await c.req.raw.json());
  const normalized = body.name.trim().toLowerCase().replace(/\s+/g, " ");
  const { data, error } = await (supabase.from("vendors") as any)
    .insert({
      workspace_id: workspaceId,
      name: body.name.trim(),
      normalized_name: normalized,
      default_category_id: body.default_category_id ?? null,
      vendor_type: body.vendor_type ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

billingRouter.get("/v1/billing/expense-activity", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const expenseId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("expense_id") ?? "");
  const { data, error } = await (supabase.from("expense_activity") as any)
    .select("id, workspace_id, expense_id, actor_user_id, actor_name, event_type, details, created_at")
    .eq("workspace_id", workspaceId)
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.post("/v1/billing/receipts", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const fileName = form.get("file_name");
  if (!(file instanceof File)) throw new ApiError(400, "A receipt file upload is required", "receipt_file_required");
  const safeName = typeof fileName === "string" && fileName.trim() ? fileName.trim().slice(0, 200) : file.name.slice(0, 200);
  const path = `${workspaceId}/${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
  if (error) throw error;
  return json({ data: { path } }, { status: 201 });
});

billingRouter.get("/v1/billing/receipt-signed-url", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const url = new URL(c.req.url);
  const path = url.searchParams.get("path") ?? "";
  const expiresIn = Math.min(Math.max(Number(url.searchParams.get("expires_in") ?? 3600) || 3600, 60), 7 * 24 * 3600);
  if (!path.startsWith(`${workspaceId}/`)) {
    throw new ApiError(403, "Receipt path is outside this workspace", "receipt_path_forbidden");
  }
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, expiresIn);
  if (error) throw error;
  return json({ data: { signed_url: data?.signedUrl ?? null } });
});

const receiptOcrSchema = z.object({
  image_base64: z.string().min(1),
  mime_type: z.string().trim().min(1).max(120),
});

billingRouter.post("/v1/billing/receipt-ocr", async (c) => {
  const body = receiptOcrSchema.parse(await c.req.raw.json());
  await requireAuth(c);
  return proxyEdgeFunction(c, "expense-receipt-ocr", {
    body: { imageBase64: body.image_base64, mimeType: body.mime_type },
  });
});

// ---------------------------------------------------------------------------
// Payment provider + payment settings + coupons
// ---------------------------------------------------------------------------

function readOperationalSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

billingRouter.get("/v1/billing/payment-provider", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const db = supabase as any;
  const [{ data: settings, error: settingsError }, { data: connections, error: connectionsError }] = await Promise.all([
    db.from("workspace_settings")
      .select("payment_provider,operational_settings")
      .eq("workspace_id", workspaceId)
      .single(),
    db.from("provider_connections")
      .select("provider,external_account_id,status,metadata,last_synced_at")
      .eq("workspace_id", workspaceId)
      .in("provider", ["stripe", "square"]),
  ]);
  if (settingsError) throw settingsError;
  if (connectionsError) throw connectionsError;

  const operational = readOperationalSettings(settings?.operational_settings);
  const stripeConnection = (connections ?? []).find((row: any) => row.provider === "stripe" && row.status === "connected");
  const squareConnection = (connections ?? []).find((row: any) => row.provider === "square" && row.status === "connected");
  const stripeMetadata = readOperationalSettings(stripeConnection?.metadata);
  const squareMetadata = readOperationalSettings(squareConnection?.metadata);

  return json({
    data: {
      provider: settings?.payment_provider ?? "none",
      stripeStatus: {
        connected: Boolean(stripeConnection?.external_account_id),
        chargesEnabled: stripeMetadata.charges_enabled === true && operational.stripe_charges_enabled === true,
        payoutsEnabled: stripeMetadata.payouts_enabled === true && operational.stripe_payouts_enabled === true,
        detailsSubmitted: stripeMetadata.details_submitted === true || operational.stripe_details_submitted === true || operational.stripe_onboarding_complete === true,
        accountId: typeof stripeConnection?.external_account_id === "string" ? stripeConnection.external_account_id : undefined,
      },
      squareStatus: {
        connected: Boolean(squareConnection?.external_account_id),
        chargesEnabled: operational.square_charges_enabled === true,
        merchantId: typeof squareConnection?.external_account_id === "string" ? squareConnection.external_account_id : null,
        locationId: typeof squareMetadata.location_id === "string" ? squareMetadata.location_id : (typeof operational.square_location_id === "string" ? operational.square_location_id : null),
        onboardingComplete: operational.square_onboarding_complete === true,
        accountStatus: typeof operational.square_account_status === "string" ? operational.square_account_status : undefined,
        tokenExpiringSoon: operational.square_token_expiring_soon === true,
      },
    },
  });
});

const updatePaymentProviderSchema = z.object({
  provider: z.enum(["stripe", "square", "none"]),
});

billingRouter.put("/v1/billing/payment-provider", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const body = updatePaymentProviderSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("workspace_settings") as any)
    .update({ payment_provider: body.provider })
    .eq("workspace_id", workspaceId);
  if (error) throw new ApiError(400, error.message, "payment_provider_update_failed");
  return json({ data: { success: true, provider: body.provider } });
});

const providerConnectSchema = z.object({
  provider: z.enum(["stripe", "square"]),
  mode: z.enum(["initiate", "callback", "status"]),
  code: z.string().max(2000).optional(),
  state: z.string().max(2000).optional(),
});

billingRouter.post("/v1/billing/payment-provider/connect", async (c) => {
  const { workspaceId } = await resolveBillingWorkspace(c);
  const body = providerConnectSchema.parse(await c.req.raw.json());
  // The edge function authorizes owner/admin itself; the workspace id is
  // resolved server-side from the auth token, never trusted from the client.
  return proxyEdgeFunction(c, "payment-provider-connect", {
    body: { workspace_id: workspaceId, provider: body.provider, mode: body.mode, code: body.code, state: body.state },
  });
});

billingRouter.get("/v1/billing/payment-settings", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const db = supabase as any;
  const [settingsRes, couponsRes] = await Promise.all([
    db.from("workspace_settings")
      .select("tax_rate,oil_price_per_quart,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,operational_settings")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db.from("coupon_codes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (couponsRes.error) throw couponsRes.error;
  return json({
    data: {
      settingsRow: settingsRes.data ?? null,
      coupons: couponsRes.data ?? [],
    },
  });
});

const paymentSettingsSchema = z.object({
  accept_deposits: z.boolean(),
  deposit_percentage: z.number().finite().min(0).max(100),
  tax_rate: z.number().finite().min(0),
  oil_price_per_quart: z.number().finite().min(0),
  surcharge_enabled: z.boolean(),
  surcharge_type: z.enum(["percentage", "fixed"]),
  surcharge_value: z.number().finite().min(0),
  surcharge_description: z.string().max(300),
  waste_oil_fee_enabled: z.boolean(),
  waste_oil_fee: z.number().finite().min(0),
  shop_fee_enabled: z.boolean(),
  shop_fee_type: z.enum(["percentage", "fixed"]),
  shop_fee_value: z.number().finite().min(0),
  shop_fee_description: z.string().max(300),
  phone_as_coupon_enabled: z.boolean(),
  phone_coupon_discount_type: z.enum(["percentage", "fixed"]),
  phone_coupon_discount_value: z.number().finite().min(0),
  phone_coupon_min_order_amount: z.number().finite().min(0),
  phone_coupon_description: z.string().max(300),
});

billingRouter.put("/v1/billing/payment-settings", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const body = paymentSettingsSchema.parse(await c.req.raw.json());
  const db = supabase as any;
  const current = await db.from("workspace_settings").select("operational_settings").eq("workspace_id", workspaceId).maybeSingle();
  if (current.error) throw current.error;
  const operational = {
    ...readOperationalSettings(current.data?.operational_settings),
    accept_deposits: body.accept_deposits,
    deposit_percentage: body.deposit_percentage,
    phone_as_coupon_enabled: body.phone_as_coupon_enabled,
    phone_coupon_discount_type: body.phone_coupon_discount_type,
    phone_coupon_discount_value: body.phone_coupon_discount_value,
    phone_coupon_min_order_amount: body.phone_coupon_min_order_amount,
    phone_coupon_description: body.phone_coupon_description,
  };
  const { error } = await db.from("workspace_settings").upsert({
    workspace_id: workspaceId,
    tax_rate: body.tax_rate,
    oil_price_per_quart: body.oil_price_per_quart,
    surcharge_enabled: body.surcharge_enabled,
    surcharge_type: body.surcharge_type,
    surcharge_value: body.surcharge_value,
    surcharge_description: body.surcharge_description,
    waste_oil_fee_enabled: body.waste_oil_fee_enabled,
    waste_oil_fee: body.waste_oil_fee,
    shop_fee_enabled: body.shop_fee_enabled,
    shop_fee_type: body.shop_fee_type,
    shop_fee_value: body.shop_fee_value,
    shop_fee_description: body.shop_fee_description,
    operational_settings: operational,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw error;
  return json({ data: { success: true } });
});

const couponSchema = z.object({
  code: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable(),
  discount_type: z.string().trim().min(1).max(40),
  discount_value: z.number().finite().min(0),
  min_order_amount: z.number().finite().min(0),
  max_uses: z.number().int().positive().nullable(),
  valid_until: z.string().trim().max(40).nullable(),
});

billingRouter.post("/v1/billing/coupons", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const body = couponSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("coupon_codes") as any)
    .insert({ ...body, workspace_id: workspaceId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

billingRouter.put("/v1/billing/coupons/:id", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = couponSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("coupon_codes") as any)
    .update({ ...body, workspace_id: workspaceId, user_id: user.id })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.delete("/v1/billing/coupons/:id", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { error } = await (supabase.from("coupon_codes") as any)
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { success: true } });
});

const toggleCouponSchema = z.object({
  is_active: z.boolean(),
});

billingRouter.patch("/v1/billing/coupons/:id", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = toggleCouponSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("coupon_codes") as any)
    .update({ is_active: body.is_active })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { success: true, is_active: body.is_active } });
});

// ---------------------------------------------------------------------------
// QuickBooks
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/qbo", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [profileResp, logsResp, customersResp, invoicesResp, paymentsResp] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("qbo_enabled, qbo_realm_id, qbo_connected_at, qbo_sync_customers, qbo_sync_invoices, qbo_sync_payments, qbo_income_account_id, qbo_last_sync_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("qbo_sync_log")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase.from("qbo_entity_mappings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("entity_type", "customer"),
    supabase.from("qbo_entity_mappings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("entity_type", "invoice"),
    supabase.from("qbo_entity_mappings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("entity_type", "payment"),
  ]);
  if (profileResp.error) throw profileResp.error;
  if (logsResp.error) throw logsResp.error;
  if (customersResp.error) throw customersResp.error;
  if (invoicesResp.error) throw invoicesResp.error;
  if (paymentsResp.error) throw paymentsResp.error;
  return json({
    data: {
      profile: profileResp.data ?? null,
      syncLogs: logsResp.data ?? [],
      entityStats: {
        customers: customersResp.count ?? 0,
        invoices: invoicesResp.count ?? 0,
        payments: paymentsResp.count ?? 0,
      },
    },
  });
});

const qboSettingsSchema = z.object({
  qbo_sync_customers: z.boolean(),
  qbo_sync_invoices: z.boolean(),
  qbo_sync_payments: z.boolean(),
  qbo_income_account_id: z.string().trim().max(120).nullable(),
});

billingRouter.put("/v1/billing/qbo/settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = qboSettingsSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("business_profiles") as any)
    .update(body)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

billingRouter.post("/v1/billing/qbo/connect", async (c) => {
  await requireAuth(c);
  return proxyEdgeFunction(c, "qbo-connect", { body: {} });
});

billingRouter.post("/v1/billing/qbo/disconnect", async (c) => {
  await requireAuth(c);
  return proxyEdgeFunction(c, "qbo-disconnect", { body: {} });
});

const qboSyncSchema = z.object({
  entity_type: z.string().trim().min(1).max(60).default("all"),
});

billingRouter.post("/v1/billing/qbo/sync", async (c) => {
  const body = qboSyncSchema.parse(await c.req.raw.json().catch(() => ({})));
  await requireAuth(c);
  return proxyEdgeFunction(c, "qbo-sync", { body: { entityType: body.entity_type } });
});

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

const recurringFrequencySchema = z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]);
const recurringPaymentMethodSchema = z.enum(["cash", "card", "check", "ach", "other"]).nullable().optional();

const recurringExpenseSchema = z.object({
  name: z.string().trim().min(1).max(300),
  vendor_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().trim().min(1).max(300),
  category_id: z.string().uuid().nullable().optional(),
  amount: z.number().finite().min(0),
  frequency: recurringFrequencySchema,
  interval_count: z.number().int().positive().optional(),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  start_date: z.string().trim().min(1).max(30),
  end_date: z.string().trim().max(30).nullable().optional(),
  next_due_date: z.string().trim().min(1).max(30),
  payment_method: recurringPaymentMethodSchema,
  last4: z.string().trim().max(10).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  is_active: z.boolean().optional(),
  autopost: z.boolean().optional(),
});

billingRouter.get("/v1/billing/recurring-expenses", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("recurring_expenses") as any)
    .select("*")
    .eq("user_id", user.id)
    .order("next_due_date", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.post("/v1/billing/recurring-expenses", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = recurringExpenseSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("recurring_expenses") as any)
    .insert([{ user_id: user.id, interval_count: 1, is_active: true, autopost: true, ...body }])
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

billingRouter.put("/v1/billing/recurring-expenses/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = recurringExpenseSchema.partial().parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("recurring_expenses") as any)
    .update(body)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.delete("/v1/billing/recurring-expenses/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { error } = await (supabase.from("recurring_expenses") as any)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

const toggleRecurringExpenseSchema = z.object({
  is_active: z.boolean(),
});

billingRouter.patch("/v1/billing/recurring-expenses/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = toggleRecurringExpenseSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("recurring_expenses") as any)
    .update({ is_active: body.is_active })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.post("/v1/billing/recurring-expenses/process", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("process_due_recurring_expenses", {
    p_user_id: user.id,
  });
  if (error) throw error;
  return json({ data: { generated: (data as number) ?? 0 } });
});

// ---------------------------------------------------------------------------
// Subscription plans (customer-facing plans shops sell)
// ---------------------------------------------------------------------------

const subscriptionPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.number().finite().min(0),
  billing_cycle: z.string().trim().min(1).max(40),
  features: z.array(z.string()).default([]),
  included_services: z.array(z.string()).default([]),
  max_services_per_cycle: z.number().int().positive().nullable().optional(),
  is_active: z.boolean(),
  display_order: z.number().int(),
  tier: z.string().trim().max(60).nullable().optional(),
  price_min: z.number().finite().min(0).nullable().optional(),
  price_max: z.number().finite().min(0).nullable().optional(),
  badge_label: z.string().trim().max(80).nullable().optional(),
  badge_color: z.string().trim().max(40).nullable().optional(),
  highlight: z.boolean().optional(),
  cta_label: z.string().trim().max(80).optional(),
});

billingRouter.get("/v1/billing/subscription-plans", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const activeOnly = new URL(c.req.url).searchParams.get("active_only") === "true";
  let query = (supabase.from("subscription_plans") as any)
    .select("*")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .order("price", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/subscription-plans/public", async (c) => {
  const businessUserId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("business_user_id") ?? "");
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await (anon.from("subscription_plans") as any)
    .select("*")
    .eq("user_id", businessUserId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/subscription-plans/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { data, error } = await (supabase.from("subscription_plans") as any)
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.post("/v1/billing/subscription-plans", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = subscriptionPlanSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("subscription_plans") as any)
    .insert({
      user_id: user.id,
      name: body.name,
      description: body.description || null,
      price: body.price,
      billing_cycle: body.billing_cycle,
      features: body.features || [],
      included_services: body.included_services || [],
      max_services_per_cycle: body.max_services_per_cycle ?? null,
      is_active: body.is_active,
      display_order: body.display_order,
      tier: body.tier || null,
      price_min: body.price_min ?? null,
      price_max: body.price_max ?? null,
      badge_label: body.badge_label ?? null,
      badge_color: body.badge_color ?? null,
      highlight: body.highlight ?? false,
      cta_label: body.cta_label ?? "Subscribe Now",
    })
    .select()
    .single();
  if (error) throw new ApiError(400, `Failed to create plan: ${error.message}`, "plan_create_failed");
  return json({ data }, { status: 201 });
});

billingRouter.put("/v1/billing/subscription-plans/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = subscriptionPlanSchema.partial().parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("subscription_plans") as any)
    .update(body)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw new ApiError(400, `Failed to update plan: ${error.message}`, "plan_update_failed");
  return json({ data });
});

billingRouter.delete("/v1/billing/subscription-plans/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { error } = await (supabase.from("subscription_plans") as any)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new ApiError(400, `Failed to delete plan: ${error.message}`, "plan_delete_failed");
  return json({ data: { success: true } });
});

const togglePlanSchema = z.object({
  is_active: z.boolean(),
});

billingRouter.patch("/v1/billing/subscription-plans/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = togglePlanSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("subscription_plans") as any)
    .update({ is_active: body.is_active })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new ApiError(400, `Failed to toggle plan: ${error.message}`, "plan_toggle_failed");
  return json({ data: { success: true, is_active: body.is_active } });
});

const syncPlanSchema = z.object({
  plan_id: z.string().uuid().optional(),
  sync_all: z.boolean().optional(),
});

billingRouter.post("/v1/billing/subscription-plans/sync", async (c) => {
  const body = syncPlanSchema.parse(await c.req.raw.json().catch(() => ({})));
  await requireAuth(c);
  return proxyEdgeFunction(c, "sync-subscription-plan", {
    body: body.sync_all ? { sync_all: true } : { plan_id: body.plan_id },
  });
});

billingRouter.get("/v1/billing/plan-templates", async (c) => {
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await (anon.from("subscription_plan_templates") as any)
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/customer-subscriptions", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const customerId = new URL(c.req.url).searchParams.get("customer_id");
  let query = (supabase.from("customer_subscriptions") as any)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/subscription-stats", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [plansResult, subsResult] = await Promise.all([
    (supabase.from("subscription_plans") as any)
      .select("id, price, billing_cycle, is_active, stripe_price_id")
      .eq("user_id", user.id),
    (supabase.from("customer_subscriptions") as any)
      .select("id, plan_id, status")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (subsResult.error) throw subsResult.error;

  const plans = (plansResult.data ?? []) as Array<{
    id: string; price: number | null; billing_cycle: string | null; is_active: boolean; stripe_price_id: string | null;
  }>;
  const subs = (subsResult.data ?? []) as Array<{ id: string; plan_id: string | null; status: string }>;

  const activePlans = plans.filter((p) => p.is_active);
  const plansWithStripe = plans.filter((p) => p.stripe_price_id).length;
  const estimatedMRR = subs.reduce((sum, sub) => {
    const plan = plans.find((p) => p.id === sub.plan_id);
    if (!plan) return sum;
    const multiplier = plan.billing_cycle === "yearly" ? 1 / 12 : plan.billing_cycle === "quarterly" ? 1 / 3 : 1;
    return sum + (plan.price || 0) * multiplier;
  }, 0);

  return json({
    data: {
      totalPlans: plans.length,
      activePlans: activePlans.length,
      totalSubscribers: subs.length,
      estimatedMRR,
      plansWithStripe,
      plansWithoutStripe: plans.length - plansWithStripe,
    },
  });
});

const subscriptionCheckoutSchema = z.object({
  plan_id: z.string().trim().min(1).max(200),
  business_user_id: z.string().trim().min(1).max(200),
  customer_email: z.string().email().max(320),
  customer_name: z.string().trim().max(200).optional(),
  customer_id: z.string().trim().max(200).optional(),
  vehicle_id: z.string().trim().max(200).optional(),
  addon_plan_ids: z.array(z.string().trim().max(200)).optional(),
  success_url: z.string().url().max(2000).optional(),
  cancel_url: z.string().url().max(2000).optional(),
});

billingRouter.post("/v1/billing/subscription-checkout", async (c) => {
  const body = subscriptionCheckoutSchema.parse(await c.req.raw.json());
  // Public subscription purchase page: no auth requirement.
  return proxyEdgeFunction(c, "create-subscription-checkout", { body });
});

const manageSubscriptionSchema = z.object({
  subscription_id: z.string().trim().min(1).max(200),
  action: z.enum(["cancel", "cancel_immediately", "pause", "resume"]),
});

billingRouter.post("/v1/billing/subscriptions/manage", async (c) => {
  const body = manageSubscriptionSchema.parse(await c.req.raw.json());
  await requireAuth(c);
  return proxyEdgeFunction(c, "manage-subscription", { body });
});

billingRouter.get("/v1/billing/service-catalog-active", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("service_catalog") as any)
    .select("id, name, default_price, category, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Tax settings + tax rates
//
// Legacy model: workspace-level tax configuration lives in workspace_settings
// (tax_rate + operational_settings), tax-provider fields live on the business
// profile, and per-location breakdowns live in tax_rates. Both read and write
// shapes are preserved exactly as the client files used them.
// ---------------------------------------------------------------------------

const taxSettingsWriteSchema = z.object({
  location_tax_enabled: z.boolean(),
  tax_provider: z.string().trim().max(120),
  default_tax_nexus_state: z.string().trim().max(10).nullable(),
  flat_tax_rate: z.number().finite().min(0),
});

billingRouter.get("/v1/billing/tax-settings", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { data, error } = await (supabase.from("workspace_settings") as any)
    .select("tax_rate, operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

billingRouter.put("/v1/billing/tax-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = taxSettingsWriteSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("business_profiles") as any)
    .update({
      location_tax_enabled: body.location_tax_enabled,
      tax_provider: body.tax_provider,
      default_tax_nexus_state: body.default_tax_nexus_state,
      tax_rate: body.flat_tax_rate,
    })
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

billingRouter.post("/v1/billing/tax-settings/seed", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("seed_default_tax_rates", { p_user_id: user.id });
  if (error) throw error;
  return json({ data: { seeded: (data as number) ?? 0 } });
});

const taxRateSchema = z.object({
  state_code: z.string().trim().min(1).max(10),
  county: z.string().trim().max(120).nullable(),
  city: z.string().trim().max(120).nullable(),
  postal_code: z.string().trim().max(20).nullable(),
  state_rate: z.number().finite().min(0),
  county_rate: z.number().finite().min(0),
  city_rate: z.number().finite().min(0),
  special_rate: z.number().finite().min(0),
  combined_rate: z.number().finite().min(0),
});

billingRouter.post("/v1/billing/tax-rates", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = taxRateSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("tax_rates") as any)
    .insert({ ...body, user_id: user.id, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

billingRouter.put("/v1/billing/tax-rates/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = taxRateSchema.parse(await c.req.raw.json());
  const { data, error } = await (supabase.from("tax_rates") as any)
    .update({ ...body, user_id: user.id, is_active: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

billingRouter.delete("/v1/billing/tax-rates/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { error } = await (supabase.from("tax_rates") as any)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// Accounting: financial imports + bank transactions
// ---------------------------------------------------------------------------

const importedBankRowSchema = z.object({
  source_row_hash: z.string().trim().min(1).max(128),
  posted_on: z.string().trim().min(1).max(30),
  description_raw: z.string().trim().min(1).max(2000),
  amount: z.number().finite(),
  direction: z.enum(["inflow", "outflow"]),
  classification: z.string().trim().min(1).max(80),
  confidence: z.number().finite().min(0).max(1),
  source_data: z.record(z.string(), z.unknown()).nullable().optional(),
});

const financialImportSchema = z.object({
  file_name: z.string().trim().min(1).max(500),
  source_hash: z.string().trim().min(1).max(128),
  rows: importedBankRowSchema.array().min(1).max(10000),
});

billingRouter.post("/v1/billing/financial-imports", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const body = financialImportSchema.parse(await c.req.raw.json());

  const { data: batch, error: batchError } = await (supabase.from("financial_import_batches") as any)
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      source_type: "bank_upload",
      source_name: body.file_name,
      source_hash: body.source_hash,
      row_count: body.rows.length,
      imported_count: 0,
      duplicate_count: 0,
      status: "pending",
    })
    .select("id")
    .single();
  if (batchError || !batch?.id) throw batchError ?? new ApiError(500, "Unable to create import batch.", "import_batch_failed");

  let imported = 0;
  let duplicates = 0;
  for (let i = 0; i < body.rows.length; i += 200) {
    const chunk = body.rows.slice(i, i + 200).map((row) => ({
      workspace_id: workspaceId,
      import_batch_id: batch.id,
      source_row_hash: row.source_row_hash,
      posted_on: row.posted_on,
      description_raw: row.description_raw,
      amount: row.amount,
      direction: row.direction,
      classification: row.classification,
      confidence: row.confidence,
      review_status: row.confidence >= 0.9 ? "approved" : "pending",
      source_data: row.source_data ?? null,
      classified_by: row.confidence >= 0.9 ? user.id : null,
      classified_at: row.confidence >= 0.9 ? new Date().toISOString() : null,
    }));
    const { data, error } = await (supabase.from("bank_transactions") as any)
      .upsert(chunk, { onConflict: "workspace_id,source_row_hash", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    const inserted = (data ?? []).length;
    imported += inserted;
    duplicates += chunk.length - inserted;
  }

  const { error: updateError } = await (supabase.from("financial_import_batches") as any)
    .update({ imported_count: imported, duplicate_count: duplicates, status: "completed" })
    .eq("id", batch.id)
    .eq("workspace_id", workspaceId);
  if (updateError) throw updateError;

  return json({ data: { batch_id: batch.id, imported, duplicates } });
});

billingRouter.get("/v1/billing/bank-transactions", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const limit = Math.min(Math.max(Number(new URL(c.req.url).searchParams.get("limit")) || 1000, 1), 5000);
  const { data, error } = await (supabase.from("bank_transactions") as any)
    .select("id,posted_on,description_raw,amount,direction,classification,confidence,review_status,notes,created_at")
    .eq("workspace_id", workspaceId)
    .order("posted_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return json({ data: data ?? [] });
});

const bankTransactionPatchSchema = z.object({
  classification: z.string().trim().min(1).max(80),
  notes: z.string().max(2000).nullable().optional(),
});

billingRouter.patch("/v1/billing/bank-transactions/:id", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = bankTransactionPatchSchema.parse(await c.req.raw.json());
  const { error } = await (supabase.from("bank_transactions") as any)
    .update({
      classification: body.classification,
      review_status: body.classification === "unresolved" ? "pending" : "approved",
      confidence: body.classification === "unresolved" ? 0 : 1,
      classified_by: user.id,
      classified_at: new Date().toISOString(),
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// Cash receipts + financial reports
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/cash-receipts", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const url = new URL(c.req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to");
  let query = (supabase.from("payments") as any)
    .select("id,amount,status,provider,paid_at,created_at,metadata")
    .eq("workspace_id", workspaceId)
    .in("status", ["succeeded", "partially_refunded", "refunded"])
    .not("paid_at", "is", null)
    .gte("paid_at", from)
    .order("paid_at", { ascending: true });
  if (to) query = query.lte("paid_at", to);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/financials/succeeded-payments", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const since = new URL(c.req.url).searchParams.get("since") ?? "";
  const { data, error } = await (supabase.from("payments") as any)
    .select("id,amount,status,provider,paid_at,created_at,metadata")
    .eq("workspace_id", workspaceId)
    .in("status", ["succeeded", "partially_refunded", "refunded"])
    .not("paid_at", "is", null)
    .gte("paid_at", since)
    .order("paid_at");
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/financials/pending-payments", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { data, error } = await (supabase.from("payments") as any)
    .select("id,amount,metadata")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/financials/appointment-statuses", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const ids = new URL(c.req.url).searchParams.getAll("appointment_id").filter(Boolean);
  if (ids.length === 0) return json({ data: [] });
  const { data, error } = await (supabase.from("appointments") as any)
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .in("id", ids);
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/financials/completed-services", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const since = new URL(c.req.url).searchParams.get("since") ?? "";
  const { data, error } = await (supabase.from("service_records") as any)
    .select("id,total_amount,tax_amount,discount_amount,status,completed_at,created_at,updated_at,metadata")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .gte("completed_at", since)
    .order("completed_at");
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Payment ledger (server-side pagination over payments)
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/payment-ledger", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const PAGE_SIZE = 250;
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await (supabase.from("payments") as any)
      .select("id,amount,currency_code,status,provider,provider_payment_id,created_at,metadata,invoice_id,customer_id,customers(first_name,last_name,email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return json({ data: rows });
});

// ---------------------------------------------------------------------------
// Stripe account status + payment success lookup
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/stripe-account-status", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const { data, error } = await (supabase.from("workspace_settings") as any)
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

billingRouter.get("/v1/billing/payment-success", async (c) => {
  const sessionId = z.string().trim().min(1).max(200).parse(new URL(c.req.url).searchParams.get("session_id") ?? "");
  // Public confirmation page: use the publishable-key client (anon RLS),
  // matching the logged-out browser behavior of the legacy call.
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await (anon.from("payments") as any)
    .select("id,workspace_id,customer_id,provider,provider_payment_id,amount,currency_code,status,created_by,metadata,customers(first_name,last_name,email),workspaces(name)")
    .eq(sessionId.startsWith("cs_") ? "provider_payment_id" : "id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Payouts + Stripe payment methods (edge-function proxies)
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/payouts", async (c) => {
  await requireAuth(c);
  const action = z.enum(["list", "balance", "eligibility"]).parse(
    new URL(c.req.url).searchParams.get("action") ?? "list",
  );
  const query: Record<string, string> = { action };
  const limit = new URL(c.req.url).searchParams.get("limit");
  if (limit) query.limit = limit;
  return proxyEdgeFunction(c, "stripe-payouts", { method: "GET", query });
});

const instantPayoutSchema = z.object({
  amount: z.number().finite().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
});

billingRouter.post("/v1/billing/payouts/instant", async (c) => {
  const body = instantPayoutSchema.parse(await c.req.raw.json().catch(() => ({})));
  await requireAuth(c);
  // Forward the edge function's native body shape untouched.
  return proxyEdgeFunction(c, "stripe-payouts", { body });
});

const stripePaymentMethodSchema = z.object({
  mode: z.enum(["self", "list", "setup", "detach", "set-default"]),
  payment_method_id: z.string().trim().max(200).optional(),
});

billingRouter.post("/v1/billing/stripe-payment-methods", async (c) => {
  const body = stripePaymentMethodSchema.parse(await c.req.raw.json());
  await requireAuth(c);
  return proxyEdgeFunction(c, "stripe-connect-payment-methods", { body });
});

// ---------------------------------------------------------------------------
// Coupon validation (public booking page)
// ---------------------------------------------------------------------------

const validateCouponRequestSchema = z.object({
  business_user_id: z.string().uuid(),
  code: z.string().trim().min(1).max(60),
});

billingRouter.post("/v1/billing/coupons/validate", async (c) => {
  const body = validateCouponRequestSchema.parse(await c.req.raw.json());
  const trimmed = body.code.trim();
  // Public booking page: no auth. The publishable-key client mirrors the
  // logged-out browser RLS the legacy call used.
  const anon = createSupabaseAnonServerClient();
  const { data: coupon, error } = await (anon.from("coupon_codes") as any)
    .select("*")
    .eq("user_id", body.business_user_id)
    .ilike("code", trimmed)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (coupon) return json({ data: { kind: "coupon", row: coupon } });

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 7) {
    const { data: phoneCoupon, error: phoneError } = await (anon.rpc as any)("validate_phone_coupon", {
      _business_user_id: body.business_user_id,
      _phone: digits,
    });
    if (phoneError) throw phoneError;
    const row = Array.isArray(phoneCoupon) ? phoneCoupon[0] : phoneCoupon;
    if (row) return json({ data: { kind: "phone_coupon", row, digits } });
  }
  return json({ data: { kind: "none", digits } });
});

// ---------------------------------------------------------------------------
// Phone coupon overrides
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/phone-coupons", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const [customerRes, overrideRes] = await Promise.all([
    (supabase.from("customers") as any)
      .select("id,first_name,last_name,company_name,email,phone")
      .eq("workspace_id", workspaceId)
      .not("phone", "is", null),
    (supabase.from("phone_coupon_overrides") as any)
      .select("*")
      .eq("workspace_id", workspaceId),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (overrideRes.error) throw overrideRes.error;
  return json({
    data: {
      customers: customerRes.data ?? [],
      overrides: overrideRes.data ?? [],
    },
  });
});

const phoneCouponOverrideSchema = z.object({
  customer_id: z.string().uuid(),
  disabled: z.boolean().optional(),
  custom_discount_type: z.enum(["percentage", "fixed"]).nullable().optional(),
  custom_discount_value: z.number().finite().min(0).nullable().optional(),
  custom_min_order_amount: z.number().finite().min(0).nullable().optional(),
  custom_description: z.string().trim().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

billingRouter.post("/v1/billing/phone-coupons/overrides", async (c) => {
  const { supabase, user, workspaceId } = await resolveBillingWorkspace(c);
  const body = phoneCouponOverrideSchema.parse(await c.req.raw.json());
  const row = {
    workspace_id: workspaceId,
    user_id: user.id,
    customer_id: body.customer_id,
    disabled: body.disabled ?? false,
    custom_discount_type: body.custom_discount_type ?? null,
    custom_discount_value: body.custom_discount_value ?? null,
    custom_min_order_amount: body.custom_min_order_amount ?? null,
    custom_description: body.custom_description ?? null,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await (supabase.from("phone_coupon_overrides") as any)
    .upsert(row, { onConflict: "workspace_id,customer_id" });
  if (error) throw error;
  return json({ data: { success: true } });
});

billingRouter.delete("/v1/billing/phone-coupons/overrides/:id", async (c) => {
  const { supabase, workspaceId } = await resolveBillingWorkspace(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const { error } = await (supabase.from("phone_coupon_overrides") as any)
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// SMS credits (prepaid messaging billing)
// ---------------------------------------------------------------------------

billingRouter.get("/v1/billing/sms-credit-balance", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("sms_credit_balance_v1", { p_user_id: user.id });
  if (error) throw error;
  return json({ data: data ?? {} });
});

billingRouter.get("/v1/billing/sms-bundles", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("message_bundles") as any)
    .select("bundle_key, name, credit_units, price_cents, renewal_period")
    .eq("channel", "sms")
    .eq("is_active", true)
    .not("bundle_key", "is", null)
    .order("price_cents", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

billingRouter.get("/v1/billing/sms-credit-purchases", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("sms_credit_purchases") as any)
    .select("id, bundle_key, units, kind, amount_cents, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return json({ data: data ?? [] });
});

const smsSettingsSchema = z.object({
  sms_low_balance_threshold: z.number().int().min(0).optional(),
  sms_transactional_enabled: z.boolean().optional(),
  sms_marketing_enabled: z.boolean().optional(),
});

billingRouter.put("/v1/billing/sms-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = smsSettingsSchema.parse(await c.req.raw.json());
  const update: Record<string, unknown> = {};
  if (body.sms_low_balance_threshold !== undefined) update.sms_low_balance_threshold = body.sms_low_balance_threshold;
  if (body.sms_transactional_enabled !== undefined) update.sms_transactional_enabled = body.sms_transactional_enabled;
  if (body.sms_marketing_enabled !== undefined) update.sms_marketing_enabled = body.sms_marketing_enabled;
  if (Object.keys(update).length === 0) return json({ data: { success: true } });
  const { error } = await (supabase.from("business_profiles") as any).update(update).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { success: true } });
});

const sendTestSmsSchema = z.object({
  to: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(2000),
});

billingRouter.post("/v1/billing/send-test-sms", async (c) => {
  const body = sendTestSmsSchema.parse(await c.req.raw.json());
  await requireAuth(c);
  return proxyEdgeFunction(c, "send-sms", {
    body: { to: body.to, message: body.message, messageClass: "transactional", messageType: "test" },
  });
});
