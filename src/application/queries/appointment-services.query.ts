/**
 * Appointment Services Query — Read-only data access for appointment service line items.
 * All write operations have been moved to appointment-services.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface AppointmentServiceRow {
  id: string;
  appointment_id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  service_catalog_id: string | null;
  is_prepaid: boolean | null;
  added_at_service: boolean | null;
  created_at: string | null;
}

export interface FeeSettings {
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee_type: string;
  shop_fee_value: number;
  shop_fee_description: string;
  surcharge_enabled: boolean;
  surcharge_type: string;
  surcharge_value: number;
  surcharge_description: string;
}

export interface CatalogServiceInfo {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
}

export async function fetchAppointmentServices(appointmentId: string, serviceCatalogId?: string | null): Promise<{
  services: AppointmentServiceRow[];
  catalogService: CatalogServiceInfo | null;
}> {
  const { data, error } = await supabase
    .from("appointment_services")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at");

  if (error) {
    console.error("Failed to fetch services:", error);
    return { services: [], catalogService: null };
  }

  const services = (data || []) as unknown as AppointmentServiceRow[];
  let catalogService: CatalogServiceInfo | null = null;

  if (services.length === 0 && serviceCatalogId) {
    const { data: catalog } = await supabase
      .from("service_catalog")
      .select("id, name, description, default_price")
      .eq("id", serviceCatalogId)
      .single();

    if (catalog) catalogService = catalog;
  }

  return { services, catalogService };
}

export async function fetchFeeSettings(): Promise<FeeSettings | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data } = await supabase
    .from("business_profiles")
    .select("waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, shop_fee_description, surcharge_enabled, surcharge_type, surcharge_value, surcharge_description")
    .eq("user_id", user.id)
    .single();

  return data as FeeSettings | null;
}
