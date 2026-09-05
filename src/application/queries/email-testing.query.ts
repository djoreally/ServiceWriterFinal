/** Email Testing Query — canonical workspace profile plus legacy email delivery ledgers. */
import { supabase, productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function fetchEmailTestingData() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const [workspaceResp, settingsResp, emailSettingsResp, queueResp, logsResp] = await Promise.all([
    productionSupabase.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    productionSupabase.from("workspace_settings").select("email").eq("workspace_id", context.workspaceId).maybeSingle(),
    (supabase as any).from("email_settings").select("id, use_custom_smtp, smtp_host, verified").eq("user_id", user.id).maybeSingle(),
    (supabase as any).from("email_queue").select("id, email_type, recipient_email, recipient_name, status, scheduled_for, sent_at, error_message, created_at, source, retry_count, review_request_id, campaign_id, provider_message_id, last_event, last_event_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("email_logs").select("id, recipient_email, recipient_name, email_type, subject, status, provider, error_message, created_at, source, queue_id, review_request_id, campaign_id, provider_message_id, last_event, last_event_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);

  return {
    userEmail: user.email,
    profile: { business_name: workspaceResp.data?.name ?? null, email: settingsResp.data?.email ?? null },
    emailSettings: emailSettingsResp.data,
    emailQueue: queueResp.data || [],
    emailLogs: logsResp.data || [],
  };
}

export async function fetchEmailQueue() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data } = await supabase.from("email_queue").select("id, email_type, recipient_email, recipient_name, status, scheduled_for, sent_at, error_message, created_at, source, retry_count, review_request_id, campaign_id, provider_message_id, last_event, last_event_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  return data || [];
}
export async function fetchEmailLogs() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data } = await supabase.from("email_logs").select("id, recipient_email, recipient_name, email_type, subject, status, provider, error_message, created_at, source, queue_id, review_request_id, campaign_id, provider_message_id, last_event, last_event_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return data || [];
}
