/**
 * Recall Lookup Query (SW-68)
 * Wraps POST /v1/public-bookings/recall-lookup — the free NHTSA
 * chain (vPIC decode → recallsByVehicle) behind the booking page's
 * recall notice.
 *
 * Fail-soft by contract: this NEVER throws and NEVER surfaces an
 * error to the booking customer. Any failure — bad VIN, NHTSA
 * down, timeout — resolves to null, which the UI reads as "show
 * nothing". A recall lookup must never block or break a booking.
 */

import { apiClient } from "@/lib/api-client";

export interface RecallCampaign {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportReceivedDate: string | null;
}

export interface RecallLookupData {
  vehicle: { year: number; make: string; model: string };
  campaigns: RecallCampaign[];
}

interface RecallLookupResponseData {
  success?: boolean;
  vehicle?: { year: number; make: string; model: string };
  campaigns?: RecallCampaign[];
}

export async function lookupRecallsByVin(vin: string): Promise<RecallLookupData | null> {
  try {
    const response = await apiClient.post<{ data: RecallLookupResponseData | null }>(
      "/v1/public-bookings/recall-lookup",
      { vin },
      // The server's own worst case is ~10s (decode + model
      // fallbacks, each hard-capped); stay inside the client's
      // 15s default but don't let a slow chain hold the full 15.
      { timeout: 12_000 },
    );
    const data = response.data;
    if (!data?.success || !data.vehicle || !Array.isArray(data.campaigns)) {
      return null;
    }
    return { vehicle: data.vehicle, campaigns: data.campaigns };
  } catch {
    return null;
  }
}
