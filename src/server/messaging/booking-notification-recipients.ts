import { createSupabaseAdminClient } from "@/lib/supabase";

/** Additional staff recipients for booking lifecycle events.
 * Stored in workspace_settings.operational_settings.booking_notification_emails.
 */
export async function getBookingNotificationEmails(workspaceId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const settings = data?.operational_settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
  const configured = (settings as Record<string, unknown>).booking_notification_emails;
  if (!Array.isArray(configured)) return [];
  return [...new Set(configured
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))];
}
