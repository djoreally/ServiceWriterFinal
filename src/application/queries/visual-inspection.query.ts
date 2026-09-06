/** Visual Inspection Query - Fetch inspection report data for customer-facing reports. */
import { supabase } from "@/integrations/supabase/client";

export interface InspectionResultRow { id: string; item_name: string; item_category: string | null; status: string; notes: string | null; image_url: string | null; sort_order: number; severity: string | null; measurement: string | null; }
export interface InspectionReportData { id: string; template_name: string; inspector_name: string | null; inspection_date: string; notes: string | null; status: string; audio_url: string | null; transcript: string | null; source: string | null; vehicle_id?: string | null; user_id?: string | null; }
export interface InspectionVehicle { year: number | null; make: string | null; model: string | null; vin: string | null; license_plate: string | null; color: string | null; mileage: number | null; }
export interface InspectionBusiness { business_name: string | null; phone: string | null; email: string | null; logo_url: string | null; service_address: string | null; }
export interface InspectionReportResult { inspection: InspectionReportData; results: InspectionResultRow[]; vehicle: InspectionVehicle | null; business: InspectionBusiness | null; }

export async function fetchInspectionReport(inspectionId: string): Promise<InspectionReportResult> {
  const { data: insp } = await (supabase as any).from("service_inspections").select("*").eq("id", inspectionId).single();
  if (!insp) throw new Error("Inspection not found");

  const { data: res } = await (supabase as any).from("inspection_results").select("*").eq("inspection_id", inspectionId).order("sort_order");
  let vehicle: InspectionVehicle | null = null;
  let business: InspectionBusiness | null = null;

  if (insp.vehicle_id) {
    const { data: veh } = await supabase.from("vehicles").select("year, make, model, vin, license_plate, color, mileage").eq("id", insp.vehicle_id).single();
    vehicle = veh;
  }

  if (insp.user_id) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("created_by", insp.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (workspace) {
      const { data: settings } = await supabase
        .from("workspace_settings")
        .select("phone, email, logo_url, address_line1, address_line2, city, region, postal_code")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      const serviceAddress = settings
        ? [settings.address_line1, settings.address_line2, settings.city, settings.region, settings.postal_code].filter(Boolean).join(", ") || null
        : null;
      business = {
        business_name: workspace.name,
        phone: settings?.phone ?? null,
        email: settings?.email ?? null,
        logo_url: settings?.logo_url ?? null,
        service_address: serviceAddress,
      };
    }
  }

  return { inspection: insp as InspectionReportData, results: (res || []) as InspectionResultRow[], vehicle, business };
}
