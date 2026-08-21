/**
 * Service Detail Query - Fetches all data needed for the service detail page.
 * Consolidates multiple supabase.from() calls that were previously in the page component.
 */

import { supabase } from "@/integrations/supabase/client";
import { bankersRound } from "@/lib/financialMath";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface ServiceDetailData {
  id: string;
  service_number: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_id: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  status: string;
  notes: string | null;
  technician: string | null;
  oil_quarts_used: number | null;
  created_at: string;
  updated_at: string;
  // Carfax-compliant vehicle snapshot captured at time of service
  mileage: number | null;
  vin_captured: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_engine: string | null;
  license_plate: string | null;
  odometer_measure: string | null;
}

export interface ServiceDetailCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface ServiceDetailVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string | null;
  vin: string | null;
  mileage: number | null;
  color: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  engine: string | null;
}

export interface ServiceDetailLaborItem {
  id: string;
  description: string;
  hours: number;
}

export interface ServiceDetailTimelineEvent {
  id: string;
  status: string;
  timestamp: string;
  notes: string | null;
}

export interface ServiceDetailResult {
  service: ServiceDetailData;
  customer: ServiceDetailCustomer | null;
  vehicle: ServiceDetailVehicle | null;
  laborItems: ServiceDetailLaborItem[];
  timeline: ServiceDetailTimelineEvent[];
  businessName: string;
  businessEmail: string;
  guestInfo: { name: string; email?: string; phone?: string } | null;
  catalogDescription: string | null;
  catalogLaborHours: number | null;
  oilType: string | null;
}

/**
 * Fetch all data needed for a service detail page in parallel where possible.
 * Returns null if service not found or user not authenticated.
 */
export async function fetchServiceDetail(serviceId: string): Promise<ServiceDetailResult | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  // 1. Fetch the service record with IDOR protection
  const { data: serviceData, error: serviceError } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("user_id", user.id)
    .single();

  if (serviceError || !serviceData) return null;

  // 2. Fetch related data in parallel
  const [laborRes, timelineRes, profileRes] = await Promise.all([
    supabase.from("labor_items").select("id, description, hours").eq("service_id", serviceId).order("created_at"),
    supabase.from("service_timeline").select("*").eq("service_id", serviceId).order("timestamp", { ascending: true }),
    supabase.from("business_profiles").select("business_name, email").eq("user_id", user.id).single(),
  ]);

  let customer: ServiceDetailCustomer | null = null;
  let vehicle: ServiceDetailVehicle | null = null;
  let guestInfo: ServiceDetailResult["guestInfo"] = null;
  let catalogDescription: string | null = null;
  let catalogLaborHours: number | null = null;
  let oilType: string | null = null;

  // 3. Fetch customer and vehicle in parallel if IDs exist
  const [customerRes, vehicleRes] = await Promise.all([
    serviceData.customer_id
      ? supabase.from("customers").select("*").eq("id", serviceData.customer_id).single()
      : Promise.resolve({ data: null }),
    serviceData.vehicle_id
      ? supabase.from("vehicles").select("*").eq("id", serviceData.vehicle_id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (customerRes.data) customer = customerRes.data as ServiceDetailCustomer;
  if (vehicleRes.data) {
    vehicle = vehicleRes.data as ServiceDetailVehicle;
    // NOTE: do NOT seed oilType from the vehicle's current oil_type — that would
    // make every historical service record show the *current* oil. Per-service
    // oil is extracted from the description below; vehicle.oil_type is only a
    // last-resort fallback if nothing per-service was captured.
  }

  // 4. Resolve guest info and catalog data from linked appointment
  if (serviceData.appointment_id) {
    const { data: apptData } = await supabase
      .from("appointments")
      .select("guest_name, guest_email, guest_phone, customer_id, service_catalog_id")
      .eq("id", serviceData.appointment_id)
      .single();

    if (apptData) {
      // Fill customer from appointment if not already found
      if (!customer && apptData.customer_id) {
        const { data: custData } = await supabase.from("customers").select("*").eq("id", apptData.customer_id).single();
        if (custData) customer = custData as ServiceDetailCustomer;
      }

      // Guest info fallback
      if (!customer && apptData.guest_name) {
        guestInfo = {
          name: apptData.guest_name,
          email: apptData.guest_email || undefined,
          phone: apptData.guest_phone || undefined,
        };
      }

      // Catalog description and labor hours
      if (apptData.service_catalog_id) {
        const { data: catalogData } = await supabase
          .from("service_catalog")
          .select("description, name, estimated_duration")
          .eq("id", apptData.service_catalog_id)
          .single();
        if (catalogData?.description) catalogDescription = catalogData.description;
        if (catalogData?.estimated_duration) {
          catalogLaborHours = bankersRound(catalogData.estimated_duration / 60, 2);
        }
      }
    }
  }

  // Per-service oil type extracted from description (captured at completion)
  if (!oilType && serviceData.description) {
    const oilMatch = serviceData.description.match(/Oil:\s*[\d.]+\s*qt\s+(.+)/i);
    if (oilMatch) oilType = oilMatch[1].trim();
  }

  // Last-resort fallback: vehicle's current oil_type (only when nothing was
  // captured per service). Older records without captured data will show this.
  if (!oilType && vehicle?.oil_type) oilType = vehicle.oil_type;

  return {
    service: serviceData as ServiceDetailData,
    customer,
    vehicle,
    laborItems: (laborRes.data ?? []) as ServiceDetailLaborItem[],
    timeline: (timelineRes.data ?? []) as ServiceDetailTimelineEvent[],
    businessName: profileRes.data?.business_name || "",
    businessEmail: profileRes.data?.email || "",
    guestInfo,
    catalogDescription,
    catalogLaborHours,
    oilType,
  };
}
