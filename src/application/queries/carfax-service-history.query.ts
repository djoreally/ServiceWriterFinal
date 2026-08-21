/**
 * CARFAX Service History Query
 * Wraps the carfax-service-history Edge Function call.
 */

import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.functions.invoke("carfax-service-history", {
    body: { vin },
  });

  if (error) throw error;

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
