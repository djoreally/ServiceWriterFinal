import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { CanonicalBasePlan } from "@/domain/billing/canonical-pricing";

function asPlan(value: unknown): CanonicalBasePlan {
  return value === "pro" || value === "fleet" ? value : "basic";
}

function asInterval(value: unknown): "monthly" | "annual" {
  return value === "annual" ? "annual" : "monthly";
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function asQuantity(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const direct = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const item = subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const unix = direct ?? item?.current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

async function updateFromSubscription(subscription: Stripe.Subscription, deleted = false) {
  const workspaceId = subscription.metadata?.workspace_id;
  if (!workspaceId || subscription.metadata?.service_writer_billing !== "true") return false;

  const admin = createSupabaseAdminClient();
  const canceled = deleted || subscription.status === "canceled";
  const { error } = await admin.from("workspace_billing").upsert({
    workspace_id: workspaceId,
    plan_tier: canceled ? "basic" : asPlan(subscription.metadata?.plan_tier),
    billing_interval: asInterval(subscription.metadata?.billing_interval),
    payments_addon_active: canceled ? false : asBoolean(subscription.metadata?.payments_addon_active),
    additional_technician_quantity: canceled ? 0 : asQuantity(subscription.metadata?.additional_technician_quantity),
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    stripe_subscription_id: subscription.id,
    subscription_status: canceled ? "canceled" : subscription.status,
    current_period_end: periodEnd(subscription),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  }, { onConflict: "workspace_id" });
  if (error) throw error;
  return true;
}

export async function reconcileServiceWriterBillingEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.service_writer_billing !== "true") return false;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) throw new Error("Service Writer billing checkout completed without a subscription ID");
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return updateFromSubscription(subscription);
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    return updateFromSubscription(event.data.object as Stripe.Subscription);
  }

  if (event.type === "customer.subscription.deleted") {
    return updateFromSubscription(event.data.object as Stripe.Subscription, true);
  }

  return false;
}
