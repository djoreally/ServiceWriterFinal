/**
 * Maintenance Reminder Commands - Send maintenance reminders via the API boundary.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function sendMaintenanceReminders(sendAll = false): Promise<{ sent: number; errors?: string[] }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Please log in to send reminders");

  const { data } = await apiClient.post<{ data: { sent: number; errors?: string[] } }>("/v1/crm/maintenance-reminders/send", {
    send_all: sendAll,
  });
  return data;
}
