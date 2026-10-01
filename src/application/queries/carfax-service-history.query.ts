/**
 * CARFAX Service History Query
 * Wraps the carfax-service-history provider call (currently unavailable).
 */

import { apiClient, ApiClientError } from "@/lib/api-client";

export interface CarfaxServiceRecord {
  date: string;
  mileage: number;
  serviceType: string;
  description: string;
  facility?: string;
}

export interface CarfaxLookupResult {
  integrationUnavailable: boolean;
  success: boolean;
  hasServiceHistory: boolean;
  recordCount: number;
  services: CarfaxServiceRecord[];
  error?: string;
}

export async function lookupCarfaxServiceHistory(vin: string): Promise<CarfaxLookupResult> {
  let data: Record<string, any> | null;
  try {
    const response = await apiClient.post<{ data: Record<string, any> | null }>("/v1/carfax/service-history", { vin });
    data = response.data;
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 501 || error.code === "provider_not_configured")) {
      return { integrationUnavailable: true, success: false, hasServiceHistory: false, recordCount: 0, services: [], error: error.message || "CARFAX API not configured" };
    }
    throw error;
  }

  if (data?.integrationUnavailable) {
    return { integrationUnavailable: true, success: false, hasServiceHistory: false, recordCount: 0, services: [], error: data.error || "CARFAX API not configured" };
  }

  if (data?.success) {
    return {
      integrationUnavailable: false,
      success: true,
      hasServiceHistory: data.hasServiceHistory,
      recordCount: data.recordCount || 0,
      services: data.services || [],
    };
  }

  return { integrationUnavailable: false, success: false, hasServiceHistory: false, recordCount: 0, services: [], error: data?.error || "Failed to check service history" };
}
