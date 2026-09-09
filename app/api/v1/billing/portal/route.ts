import { z } from "zod";
import { ApiError, errorResponse, json } from "@/server/api";
import { ensureWorkspaceBilling, resolveAuthorizedBillingWorkspace, stripeBillingClient } from "@/server/billing/workspace-billing";

const schema = z.object({ workspace_id: z.string().uuid().optional() });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
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
  } catch (error) {
    return errorResponse(error);
  }
}
