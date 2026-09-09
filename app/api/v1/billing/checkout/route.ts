import { z } from "zod";
import { ApiError, errorResponse, json } from "@/server/api";
import {
  checkoutCatalogKeys,
  ensureWorkspaceBilling,
  getCatalogPrice,
  resolveAuthorizedBillingWorkspace,
  stripeBillingClient,
} from "@/server/billing/workspace-billing";

const schema = z.object({
  workspace_id: z.string().uuid().optional(),
  plan_tier: z.enum(["basic", "pro", "fleet"]),
  billing_interval: z.enum(["monthly", "annual"]).default("monthly"),
  payments_addon_active: z.boolean().default(false),
  additional_technician_quantity: z.number().int().min(0).max(500).default(0),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
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
  } catch (error) {
    return errorResponse(error);
  }
}
