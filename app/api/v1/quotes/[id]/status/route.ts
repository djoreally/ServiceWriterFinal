import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchQuoteLifecycle, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/quote-payment-events";
import { z } from "zod";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["approved", "declined"]),
  expected_updated_at: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const quoteId = z.string().uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);

    const { data: current, error: currentError } = await supabase
      .from("quotes")
      .select("id,workspace_id,customer_id,status,updated_at,quote_number,total,expires_at,metadata,customers(id,first_name,last_name,email)")
      .eq("workspace_id", body.workspace_id)
      .eq("id", quoteId)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Quote not found");
    if (current.status === "converted") return json({ error: { code: "quote_locked", message: "Converted quotes are immutable." } }, { status: 409 });
    if (body.expected_updated_at && current.updated_at !== body.expected_updated_at) {
      return json({ error: { code: "quote_conflict", message: "The quote changed before this response was submitted." } }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("quotes")
      .update({ status: body.status })
      .eq("workspace_id", body.workspace_id)
      .eq("id", quoteId)
      .select("id,workspace_id,customer_id,status,updated_at,quote_number,total,expires_at,metadata,customers(id,first_name,last_name,email)")
      .single();
    if (updateError || !updated) throw updateError ?? new Error("Quote status update returned no row");

    const customer = Array.isArray(updated.customers) ? updated.customers[0] : updated.customers;
    const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";
    const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single();
    try {
      if (customer?.email) {
        await dispatchQuoteLifecycle({
          eventKey: body.status === "approved" ? LIFECYCLE_EVENT_KEYS.customerApprovalReceived : LIFECYCLE_EVENT_KEYS.customerDeclineReceived,
          eventId: `${quoteId}:customer:${body.status}:${updated.updated_at}`,
          quote: { ...updated, customer_email: customer.email, customer_name: customerName },
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL(`/quotes/${quoteId}`, request.url).toString(),
        });
      }
      if (user.email) {
        await dispatchQuoteLifecycle({
          eventKey: body.status === "approved" ? LIFECYCLE_EVENT_KEYS.quoteApproved : LIFECYCLE_EVENT_KEYS.quoteDeclined,
          eventId: `${quoteId}:staff:${body.status}:${updated.updated_at}`,
          quote: { ...updated, customer_email: customer.email, customer_name: customerName },
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL(`/quotes/${quoteId}`, request.url).toString(),
          recipientEmail: user.email,
          recipientRole: "staff",
        });
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] quote status email enqueue failed", dispatchError);
    }

    return json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
