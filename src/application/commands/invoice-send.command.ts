import { apiClient, ApiClientError } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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

  try {
    const response = await apiClient.post<{
      data: {
        recipient?: string;
        invoice_status?: string;
        amount_paid?: number;
        balance_due?: number;
      };
    }>(`/v1/invoices/${encodeURIComponent(params.invoiceId)}/send`, {
      workspace_id,
      recipient_email: params.recipientEmail,
      subject: params.subject,
      message: params.message,
    });
    const data = response.data ?? {};
    return {
      recipient: data.recipient ?? params.recipientEmail ?? "",
      invoice_status: data.invoice_status ?? "unknown",
      amount_paid: Number(data.amount_paid ?? 0),
      balance_due: Number(data.balance_due ?? 0),
    };
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? error.message : "Failed to send invoice");
  }
}
