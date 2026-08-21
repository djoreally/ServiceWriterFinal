export interface TechnicianNotificationPreferences {
  pushNotificationsEnabled: boolean;
  dispatchPushEnabled: boolean;
  customerSmsEnabled: boolean;
  customerEmailEnabled: boolean;
  offlineCacheEnabled: boolean;
}

export const DEFAULT_TECH_NOTIFICATION_PREFERENCES: TechnicianNotificationPreferences = {
  pushNotificationsEnabled: true,
  dispatchPushEnabled: true,
  customerSmsEnabled: false,
  customerEmailEnabled: false,
  offlineCacheEnabled: true,
};

export function normalizeTechNotificationPreferences(input?: Partial<TechnicianNotificationPreferences> | null): TechnicianNotificationPreferences {
  return {
    pushNotificationsEnabled: input?.pushNotificationsEnabled ?? DEFAULT_TECH_NOTIFICATION_PREFERENCES.pushNotificationsEnabled,
    dispatchPushEnabled: input?.dispatchPushEnabled ?? DEFAULT_TECH_NOTIFICATION_PREFERENCES.dispatchPushEnabled,
    customerSmsEnabled: input?.customerSmsEnabled ?? DEFAULT_TECH_NOTIFICATION_PREFERENCES.customerSmsEnabled,
    customerEmailEnabled: input?.customerEmailEnabled ?? DEFAULT_TECH_NOTIFICATION_PREFERENCES.customerEmailEnabled,
    offlineCacheEnabled: input?.offlineCacheEnabled ?? DEFAULT_TECH_NOTIFICATION_PREFERENCES.offlineCacheEnabled,
  };
}

export function isTechMessageChannelEnabled(
  preferences: TechnicianNotificationPreferences,
  channel: "dispatch" | "customer_sms" | "customer_email",
): boolean {
  if (channel === "dispatch") return preferences.dispatchPushEnabled;
  if (channel === "customer_sms") return preferences.customerSmsEnabled;
  return preferences.customerEmailEnabled;
}
