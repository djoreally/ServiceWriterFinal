/**
 * Terminology Query
 * Fetches custom terminology settings from business profile.
 */

import { fetchBusinessPreferences } from "@/application/queries/business-preferences.query";

export interface Terminology {
  customer: string;
  vehicle: string;
  service: string;
  quote: string;
}

const defaultTerminology: Terminology = {
  customer: "Customer",
  vehicle: "Vehicle",
  service: "Service",
  quote: "Quote",
};

export async function fetchTerminology(): Promise<Terminology> {
  const data = await fetchBusinessPreferences();

  if (data?.terminology && typeof data.terminology === "object" && !Array.isArray(data.terminology)) {
    const t = data.terminology as Record<string, unknown>;
    return {
      customer: typeof t.customer === "string" ? t.customer : defaultTerminology.customer,
      vehicle: typeof t.vehicle === "string" ? t.vehicle : defaultTerminology.vehicle,
      service: typeof t.service === "string" ? t.service : defaultTerminology.service,
      quote: typeof t.quote === "string" ? t.quote : defaultTerminology.quote,
    };
  }

  return defaultTerminology;
}

export { defaultTerminology };
