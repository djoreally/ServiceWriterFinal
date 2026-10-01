import { apiClient } from "@/lib/api-client";

async function invoke(body: Record<string, unknown>): Promise<any> {
  try {
    const { data } = await apiClient.post<{ data: any }>(
      "/v1/fleet/email/mailbox",
      body,
    );
    if (!data?.success) throw new Error(data?.error || "Email operation failed");
    return data;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export const syncFleetMailbox = () => invoke({ action: "sync" });
export const testFleetMailbox = () => invoke({ action: "test" });
export const replyToFleetEmail = (messageId: string, body: string) =>
  invoke({ action: "reply", message_id: messageId, body });

export async function markFleetEmailRead(messageId: string) {
  await apiClient.patch(`/v1/fleet/email/messages/${messageId}`, { is_read: true });
}
