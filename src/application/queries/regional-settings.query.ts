/**
 * Regional Settings Query
 * Fetches date_format, timezone, currency from business profile.
 */

import { fetchBusinessPreferences } from "@/application/queries/business-preferences.query";

export interface RegionalSettingsData {
  date_format: string;
  timezone: string;
  currency: string;
}

const defaultSettings: RegionalSettingsData = {
  date_format: "DD/MM/YYYY HH:mm",
  timezone: "UTC",
  currency: "USD",
};

export async function fetchRegionalSettings(): Promise<RegionalSettingsData> {
  const data = await fetchBusinessPreferences();

  if (data) {
    return {
      date_format: data.date_format || defaultSettings.date_format,
      timezone: data.timezone || defaultSettings.timezone,
      currency: "USD",
    };
  }

  return defaultSettings;
}

export { defaultSettings as defaultRegionalSettings };
