/**
 * Service Invoice Query - Fetch all data needed to render a service invoice.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface InvoiceServiceData {
  id: string;
  service_number: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  shop_supplies: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  technician: string | null;
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

export interface InvoiceLaborItem {
  id: string;
  description: string;
  hours: number;
  rate: number;
  total_price: number;
}

export interface InvoiceServiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InvoiceBusinessProfile {
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  logo_url: string;
}

export interface InvoiceCustomerData {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface InvoiceVehicleData {
  make: string;
  model: string;
  year: number;
  license_plate: string | null;
  vin: string | null;
  mileage: number | null;
  color: string | null;
  oil_type?: string | null;
  oil_capacity?: string | null;
  engine?: string | null;
}

export interface InvoiceData {
  service: InvoiceServiceData | null;
  customer: InvoiceCustomerData | null;
  vehicle: InvoiceVehicleData | null;
  business: InvoiceBusinessProfile | null;
  laborItems: InvoiceLaborItem[];
  serviceItems: InvoiceServiceItem[];
}

/** Fetch all invoice data in parallel. */
export async function fetchInvoiceData(
  serviceId: string,
  customerId: string | null,
  vehicleId: string | null,
): Promise<InvoiceData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const [serviceRes, customerRes, vehicleRes, businessRes, laborRes, itemsRes] = await Promise.all([
    supabase.from("services").select("*").eq("id", serviceId).single(),
    customerId ? supabase.from("customers").select("name, email, phone, address, created_at").eq("id", customerId).single() : null,
    vehicleId ? supabase.from("vehicles").select("make, model, year, license_plate, vin, mileage, color, oil_type, oil_capacity, engine").eq("id", vehicleId).single() : null,
    supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("labor_items").select("*").eq("service_id", serviceId),
    supabase.from("service_items").select("*").eq("service_id", serviceId),
  ]);

  return {
    service: serviceRes.data as InvoiceServiceData | null,
    customer: (customerRes?.data as InvoiceCustomerData | null) ?? null,
    vehicle: (vehicleRes?.data as InvoiceVehicleData | null) ?? null,
    business: businessRes.data ? (businessRes.data as unknown as InvoiceBusinessProfile) : null,
    laborItems: (laborRes?.data as InvoiceLaborItem[]) ?? [],
    serviceItems: (itemsRes.data as InvoiceServiceItem[]) ?? [],
  };
}

/** Send an invoice or reminder email via Edge Function. */
export async function sendInvoiceEmail(params: {
  to: string;
  customerName: string;
  type: "invoice" | "reminder";
  documentNumber: string;
  businessName: string;
  businessEmail?: string;
  totalAmount: string;
  vehicleInfo?: string;
  serviceDescription: string;
  paymentStatus: string | null;
  notes: string | null;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("send-email", {
    body: {
      source: "service_invoice",
      ...params,
    },
  });
  if (error) throw error;
}
