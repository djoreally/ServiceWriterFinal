/**
 * Visual Inspection Query - Fetch inspection report data for customer-facing reports.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";

export interface InspectionResultRow {
  id: string;
  item_name: string;
  item_category: string | null;
  status: string;
  notes: string | null;
  image_url: string | null;
  sort_order: number;
  severity: string | null;
  measurement: string | null;
}

export interface InspectionReportData {
  id: string;
  template_name: string;
  inspector_name: string | null;
  inspection_date: string;
  notes: string | null;
  status: string;
  audio_url: string | null;
  transcript: string | null;
  source: string | null;
  vehicle_id?: string | null;
  user_id?: string | null;
}

export interface InspectionVehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  mileage: number | null;
}

export interface InspectionBusiness {
  business_name: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  service_address: string | null;
}

export interface InspectionReportResult {
  inspection: InspectionReportData;
  results: InspectionResultRow[];
  vehicle: InspectionVehicle | null;
  business: InspectionBusiness | null;
}

/** Fetch all data needed for a visual inspection report. */
export async function fetchInspectionReport(inspectionId: string): Promise<InspectionReportResult> {
  try {
    const response = await apiClient.get<{ data: InspectionReportResult | null }>(
      `/v1/inspections/${encodeURIComponent(inspectionId)}/report`,
    );
    if (!response.data) throw new Error("Inspection not found");
    return response.data;
  } catch (error) {
    if (error instanceof Error && error.message === "Inspection not found") throw error;
    throw new Error("Inspection not found");
  }
}
