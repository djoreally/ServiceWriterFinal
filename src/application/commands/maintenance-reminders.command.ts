/**
 * Maintenance Reminder Commands - Send maintenance reminders via edge function.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function sendMaintenanceReminders(sendAll = false): Promise<{ sent: number; errors?: string[] }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Please log in to send reminders");

  const { data, error } = await supabase.functions.invoke("maintenance-reminder-scheduler", {
    body: { user_id: user.id, send_all: sendAll },
  });

  if (error) throw error;
  return data;
}
