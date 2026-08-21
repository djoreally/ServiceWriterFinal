import { supabase } from "@/integrations/supabase/client";

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("fleet-email-mailbox", { body });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "Email operation failed");
  return data;
}

export const syncFleetMailbox = () => invoke({ action: "sync" });
export const testFleetMailbox = () => invoke({ action: "test" });
export const replyToFleetEmail = (messageId: string, body: string) =>
  invoke({ action: "reply", message_id: messageId, body });

export async function markFleetEmailRead(messageId: string) {
  const { error } = await (supabase as any)
    .from("fleet_email_messages")
    .update({ is_read: true })
    .eq("id", messageId);
  if (error) throw error;
}
