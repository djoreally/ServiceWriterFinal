/**
 * Maintenance Reminder Commands - Send maintenance reminders via the API boundary.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface MaintenanceReminderSettings {
  auto_send: boolean;
  days_before_due: number;
  miles_before_due: number;
  include_high_priority: boolean;
  include_medium_priority: boolean;
  include_low_priority: boolean;
}

export const DEFAULT_MAINTENANCE_REMINDER_SETTINGS: MaintenanceReminderSettings = {
  auto_send: false,
  days_before_due: 7,
  miles_before_due: 500,
  include_high_priority: true,
  include_medium_priority: true,
  include_low_priority: false,
};

export async function fetchMaintenanceReminderSettings(): Promise<MaintenanceReminderSettings> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Please log in to load reminder settings");

  const { data } = await apiClient.get<{ data: MaintenanceReminderSettings }>(
    "/v1/crm/maintenance-reminders/settings",
  );
  return { ...DEFAULT_MAINTENANCE_REMINDER_SETTINGS, ...(data ?? {}) };
}

/** Persists the settings; throws unless the server confirms the write. */
export async function saveMaintenanceReminderSettings(
  settings: MaintenanceReminderSettings,
): Promise<MaintenanceReminderSettings> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Please log in to save reminder settings");

  const { data } = await apiClient.put<{ data: MaintenanceReminderSettings }>(
    "/v1/crm/maintenance-reminders/settings",
    settings,
  );
  if (!data) throw new Error("Reminder settings could not be saved");
  return data;
}

export async function sendMaintenanceReminders(sendAll = false): Promise<{ sent: number; errors?: string[] }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Please log in to send reminders");

  const { data } = await apiClient.post<{ data: { sent: number; errors?: string[] } }>("/v1/crm/maintenance-reminders/send", {
    send_all: sendAll,
  });
  return data;
}
