import { z } from "zod";
import { errorResponse, requireWorkspacePaymentsAddon } from "@/server/api";
import { POST as executePaymentAction } from "@/app/api/v1/payments/actions/route";

const entitlementEnvelope = z.object({ workspace_id: z.string().uuid() }).passthrough();

export async function POST(request: Request) {
  try {
    const body = entitlementEnvelope.parse(await request.clone().json());
    await requireWorkspacePaymentsAddon(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist"],
      request,
    );
    return executePaymentAction(request);
  } catch (error) {
    return errorResponse(error);
  }
}
