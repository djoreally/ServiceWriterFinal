import { supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

export async function sendInvoiceEmail(params: {
  invoiceId: string;
  recipientEmail?: string;
  subject?: string;
  message?: string;
}): Promise<{
  recipient: string;
  invoice_status: string;
  amount_paid: number;
  balance_due: number;
}> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending an invoice.");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const response = await fetch(`${baseUrl}/v1/invoices/${encodeURIComponent(params.invoiceId)}/send`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      workspace_id,
      recipient_email: params.recipientEmail,
      subject: params.subject,
      message: params.message,
    }),
  });

  const payload = await response.json().catch(() => ({})) as {
    data?: {
      recipient?: string;
      invoice_status?: string;
      amount_paid?: number;
      balance_due?: number;
    };
    error?: { message?: string };
  };

  if (!response.ok) throw new Error(payload.error?.message || "Failed to send invoice");
  return {
    recipient: payload.data?.recipient ?? params.recipientEmail ?? "",
    invoice_status: payload.data?.invoice_status ?? "unknown",
    amount_paid: Number(payload.data?.amount_paid ?? 0),
    balance_due: Number(payload.data?.balance_due ?? 0),
  };
}
