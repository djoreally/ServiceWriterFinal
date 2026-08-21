/**
 * Visual Inspection Query - Fetch inspection report data for customer-facing reports.
 */
import { supabase } from "@/integrations/supabase/client";

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
  // Fetch inspection
  const { data: insp } = await (supabase as any)
    .from("service_inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  if (!insp) throw new Error("Inspection not found");

  // Fetch results
  const { data: res } = await (supabase as any)
    .from("inspection_results")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("sort_order");

  let vehicle: InspectionVehicle | null = null;
  let business: InspectionBusiness | null = null;

  // Fetch vehicle if linked
  if (insp.vehicle_id) {
    const { data: veh } = await supabase
      .from("vehicles")
      .select("year, make, model, vin, license_plate, color, mileage")
      .eq("id", insp.vehicle_id)
      .single();
    vehicle = veh;
  }

  // Fetch business profile
  if (insp.user_id) {
    const { data: biz } = await supabase
      .from("business_profiles")
      .select("business_name, phone, email, logo_url, service_address")
      .eq("user_id", insp.user_id)
      .single();
    business = biz;
  }

  return {
    inspection: insp as InspectionReportData,
    results: (res || []) as InspectionResultRow[],
    vehicle,
    business,
  };
}
