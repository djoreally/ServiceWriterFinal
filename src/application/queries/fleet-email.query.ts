import { supabase } from "@/integrations/supabase/client";

export interface FleetEmailMessage {
  id: string;
  thread_key: string;
  internet_message_id: string | null;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
}

export interface FleetMailboxConfiguration {
  workspace_user_id: string;
  use_custom_smtp: boolean;
  smtp_configured: boolean;
  smtp_host: string | null;
  smtp_username: string | null;
  from_email: string | null;
  imap_enabled: boolean;
  imap_configured: boolean;
  imap_host: string | null;
  imap_username: string | null;
  imap_last_synced_at: string | null;
  imap_last_error: string | null;
  updated_at: string | null;
}

export async function fetchFleetMailboxConfiguration(): Promise<FleetMailboxConfiguration> {
  const { data, error } = await (supabase as any).rpc("get_workspace_email_connection_status");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Workspace email settings are unavailable");
  return row as FleetMailboxConfiguration;
}

export async function fetchFleetEmailMessages(): Promise<FleetEmailMessage[]> {
  const { data, error } = await (supabase as any)
    .from("fleet_email_messages")
    .select("id, thread_key, internet_message_id, direction, from_email, from_name, to_emails, subject, body_text, body_html, received_at, is_read")
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as FleetEmailMessage[];
}

export function subscribeToFleetEmailMessages(onChange: () => void) {
  const channel = supabase.channel("fleet-email-mailbox")
    .on("postgres_changes", { event: "*", schema: "public", table: "fleet_email_messages" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
