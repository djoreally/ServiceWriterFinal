import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: FleetMailboxConfiguration }>(
    "/v1/fleet/email/mailbox-configuration",
  );
  return data as FleetMailboxConfiguration;
}

export async function fetchFleetEmailMessages(): Promise<FleetEmailMessage[]> {
  const { data } = await apiClient.get<{ data: FleetEmailMessage[] }>("/v1/fleet/email/messages");
  return (data ?? []) as FleetEmailMessage[];
}

export function subscribeToFleetEmailMessages(onChange: () => void) {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  // Poll the query instead; the returned function unsubscribes (no-op).
  return () => {};
}
