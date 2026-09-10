import { z } from "zod";
import { ApiError, errorResponse, json } from "@/server/api";
import {
  ensureWorkspaceBilling,
  getCatalogPrice,
  resolveAuthorizedBillingWorkspace,
  stripeBillingClient,
} from "@/server/billing/workspace-billing";

const schema = z.object({
  workspace_id: z.string().uuid().optional(),
  additional_technician_quantity: z.number().int().min(0).max(500),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
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
  } catch (error) {
    return errorResponse(error);
  }
}
