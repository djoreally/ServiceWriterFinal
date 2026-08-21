/**
 * Invoices Query — Read operations for the manual invoices feature.
 */
import { supabase } from "@/integrations/supabase/client";

export interface InvoiceListRow {
  id: string;
  invoice_number: string;
  bill_to_type: "retail" | "fleet";
  customer_id: string | null;
  fleet_client_id: string | null;
  contact_name: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  total: number;
  amount_paid: number;
  created_at: string;
  customers?: { name: string } | null;
  fleet_clients?: { company_name: string } | null;
}

export interface InvoiceFleetClient {
  id: string;
  company_name: string;
  billing_email: string | null;
  ap_contact_name: string | null;
  ap_contact_email: string | null;
  phone: string | null;
}

export interface InvoiceCustomerOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface InvoiceVehicleOption {
  id: string;
  customer_id: string | null;
  year: number;
  make: string;
  model: string;
  license_plate: string | null;
}

export interface InvoiceServiceCatalogOption {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
}

export interface InvoiceFeeDefaults {
  waste_oil_fee: number;
  waste_oil_fee_enabled: boolean;
  shop_fee_value: number;
  shop_fee_type: string | null;
  shop_fee_enabled: boolean;
  surcharge_value: number;
  surcharge_type: string | null;
  surcharge_enabled: boolean;
  tax_rate: number;
}

export async function fetchInvoiceList(userId: string): Promise<InvoiceListRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, customers(name), fleet_clients(company_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(0, 9999);

  if (error) throw error;
  return (data ?? []) as unknown as InvoiceListRow[];
}

export interface InvoiceLineItemRow {
  id: string;
  invoice_id: string;
  vehicle_id: string | null;
  service_catalog_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  display_order: number;
  vin: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
}

export interface InvoiceFullRow {
  id: string;
  invoice_number: string;
  bill_to_type: "retail" | "fleet";
  customer_id: string | null;
  fleet_client_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  issue_date: string;
  due_date: string | null;
  payment_terms: string | null;
  status: string;
  notes: string | null;
  terms_text: string | null;
  subtotal: number;
  discount_type: "fixed" | "percentage" | null;
  discount_amount: number;
  tax_enabled: boolean;
  tax_rate: number;
  tax_amount: number;
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee: number;
  surcharge_enabled: boolean;
  surcharge: number;
  total: number;
  amount_paid: number;
  sent_at: string | null;
  delivery_status: string;
  delivery_last_error: string | null;
  delivery_attempt_count: number;
  last_delivery_attempt_at: string | null;
  customers?: { id: string; name: string; email: string | null; phone: string | null; address: string | null } | null;
  fleet_clients?: { id: string; company_name: string; billing_email: string | null; ap_contact_email: string | null; phone: string | null } | null;
  invoice_line_items: InvoiceLineItemRow[];
}

export async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceFullRow> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, customers(id, name, email, phone, address), fleet_clients(id, company_name, billing_email, ap_contact_email, phone), invoice_line_items(*)",
    )
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  const row = data as unknown as InvoiceFullRow;
  row.invoice_line_items = [...(row.invoice_line_items ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  return row;
}

export async function fetchInvoiceFormOptions(userId: string): Promise<{
  customers: InvoiceCustomerOption[];
  fleetClients: InvoiceFleetClient[];
  vehicles: InvoiceVehicleOption[];
  catalog: InvoiceServiceCatalogOption[];
  fees: InvoiceFeeDefaults | null;
}> {
  const [custRes, fleetRes, vehRes, catRes, profRes] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone").eq("user_id", userId).order("name"),
    supabase
      .from("fleet_clients")
      .select("id, company_name, billing_email, ap_contact_name, ap_contact_email, phone")
      .eq("user_id", userId)
      .order("company_name"),
    supabase
      .from("vehicles")
      .select("id, customer_id, year, make, model, license_plate")
      .eq("user_id", userId)
      .order("year", { ascending: false }),
    supabase
      .from("service_catalog")
      .select("id, name, description, default_price")
      .eq("user_id", userId)
      .order("name"),
    supabase
      .from("business_profiles")
      .select(
        "waste_oil_fee, waste_oil_fee_enabled, shop_fee_value, shop_fee_type, shop_fee_enabled, surcharge_value, surcharge_type, surcharge_enabled, tax_rate",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    customers: (custRes.data ?? []) as InvoiceCustomerOption[],
    fleetClients: (fleetRes.data ?? []) as InvoiceFleetClient[],
    vehicles: (vehRes.data ?? []) as InvoiceVehicleOption[],
    catalog: (catRes.data ?? []) as InvoiceServiceCatalogOption[],
    fees: (profRes.data as InvoiceFeeDefaults | null) ?? null,
  };
}

/** Generates a sequential-ish invoice number scoped to user. */
export async function generateInvoiceNumber(userId: string): Promise<string> {
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const seq = (count ?? 0) + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(seq).padStart(5, "0")}`;
}
