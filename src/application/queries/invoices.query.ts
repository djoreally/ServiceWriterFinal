/** Invoice read adapters for the canonical Final ledger. */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before viewing invoices.");
  return id;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function legacyStatus(status: string): string {
  if (status === "issued") return "sent";
  if (status === "partially_paid") return "partial";
  return status;
}

function displayInvoiceNumber(row: Record<string, any>): string {
  const metadata = object(row.metadata);
  return typeof metadata.legacy_invoice_label === "string" && metadata.legacy_invoice_label
    ? metadata.legacy_invoice_label
    : `INV-${row.invoice_number}`;
}

function customerName(customer: any): string {
  if (!customer) return "";
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.company_name || "Customer";
}

function customerAddress(customer: any): string | null {
  if (!customer) return null;
  const metadata = object(customer.metadata);
  const address = [customer.address_line1, customer.address_line2, customer.city, customer.region, customer.postal_code]
    .filter(Boolean).join(", ");
  return address || (typeof metadata.address === "string" ? metadata.address : null);
}

export async function fetchInvoiceList(_userId: string): Promise<InvoiceListRow[]> {
  const id = workspaceId();
  const response = await nextApi.invoices.list(id);
  return ((response.data ?? []) as Record<string, any>[]).map((row) => {
    const metadata = object(row.metadata);
    return {
      id: row.id,
      invoice_number: displayInvoiceNumber(row),
      bill_to_type: "retail",
      customer_id: row.customer_id ?? null,
      fleet_client_id: null,
      contact_name: metadata.contact_name ?? null,
      issue_date: (row.issued_at ?? row.created_at).slice(0, 10),
      due_date: row.due_at ? row.due_at.slice(0, 10) : null,
      status: legacyStatus(row.status),
      total: Number(row.total ?? 0),
      amount_paid: Number(row.amount_paid ?? 0),
      created_at: row.created_at,
      customers: row.customers ? { name: customerName(row.customers) } : null,
      fleet_clients: null,
    };
  });
}

export async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceFullRow> {
  const id = workspaceId();
  const response = await nextApi.invoices.get(id, invoiceId);
  const row = response.data as Record<string, any>;
  const metadata = object(row.metadata);
  const customer = row.customers;
  const lines = ((row.invoice_lines ?? []) as Record<string, any>[])
    .map((line): InvoiceLineItemRow => {
      const meta = object(line.metadata);
      return {
        id: line.id,
        invoice_id: line.invoice_id,
        vehicle_id: line.vehicle_id ?? null,
        service_catalog_id: line.service_catalog_id ?? null,
        description: line.description,
        quantity: Number(line.quantity ?? 0),
        unit_price: Number(line.unit_price ?? 0),
        line_total: Number(line.quantity ?? 0) * Number(line.unit_price ?? 0),
        display_order: Number(line.sort_order ?? 0),
        vin: meta.vin ?? null,
        vehicle_year: meta.vehicle_year ?? null,
        vehicle_make: meta.vehicle_make ?? null,
        vehicle_model: meta.vehicle_model ?? null,
        vehicle_trim: meta.vehicle_trim ?? null,
        vehicle_engine: meta.vehicle_engine ?? null,
        oil_type: meta.oil_type ?? null,
        oil_capacity: meta.oil_capacity ?? null,
        oil_filter: meta.oil_filter ?? null,
      };
    })
    .sort((a, b) => a.display_order - b.display_order);

  return {
    id: row.id,
    invoice_number: displayInvoiceNumber(row),
    bill_to_type: "retail",
    customer_id: row.customer_id ?? null,
    fleet_client_id: null,
    contact_name: metadata.contact_name ?? null,
    contact_email: metadata.contact_email ?? null,
    contact_phone: metadata.contact_phone ?? null,
    issue_date: (row.issued_at ?? row.created_at).slice(0, 10),
    due_date: row.due_at ? row.due_at.slice(0, 10) : null,
    payment_terms: metadata.payment_terms ?? null,
    status: legacyStatus(row.status),
    notes: metadata.notes ?? null,
    terms_text: metadata.terms_text ?? null,
    subtotal: Number(row.subtotal ?? 0),
    discount_type: metadata.discount_type === "percentage" ? "percentage" : "fixed",
    discount_amount: Number(metadata.discount_amount ?? 0),
    tax_enabled: Number(row.tax_total ?? 0) > 0,
    tax_rate: Number(metadata.tax_rate ?? 0),
    tax_amount: Number(row.tax_total ?? 0),
    waste_oil_fee_enabled: Boolean(metadata.waste_oil_fee_enabled),
    waste_oil_fee: Number(metadata.waste_oil_fee ?? 0),
    shop_fee_enabled: Boolean(metadata.shop_fee_enabled),
    shop_fee: Number(metadata.shop_fee ?? 0),
    surcharge_enabled: Boolean(metadata.surcharge_enabled),
    surcharge: Number(metadata.surcharge ?? 0),
    total: Number(row.total ?? 0),
    amount_paid: Number(row.amount_paid ?? 0),
    sent_at: row.issued_at ?? null,
    delivery_status: "not_configured",
    delivery_last_error: null,
    delivery_attempt_count: 0,
    last_delivery_attempt_at: null,
    customers: customer ? {
      id: customer.id,
      name: customerName(customer),
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      address: customerAddress(customer),
    } : null,
    fleet_clients: null,
    invoice_line_items: lines,
  };
}

export async function fetchInvoiceFormOptions(_userId: string): Promise<{
  customers: InvoiceCustomerOption[];
  fleetClients: InvoiceFleetClient[];
  vehicles: InvoiceVehicleOption[];
  catalog: InvoiceServiceCatalogOption[];
  fees: InvoiceFeeDefaults | null;
}> {
  const id = workspaceId();
  const [customersRes, vehiclesRes, catalogRes, settingsRes] = await Promise.all([
    nextApi.customers.list(id),
    nextApi.vehicles.list(id),
    (supabase.from("service_catalog") as any)
      .select("id,name,description,default_price")
      .eq("workspace_id", id)
      .eq("is_active", true)
      .order("name"),
    (supabase.from("workspace_settings") as any)
      .select("waste_oil_fee,waste_oil_fee_enabled,shop_fee_value,shop_fee_type,shop_fee_enabled,surcharge_value,surcharge_type,surcharge_enabled,tax_rate")
      .eq("workspace_id", id)
      .maybeSingle(),
  ]);

  if (catalogRes.error) throw catalogRes.error;
  if (settingsRes.error) throw settingsRes.error;

  return {
    customers: ((customersRes.data ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      name: customerName(row),
      email: row.email ?? null,
      phone: row.phone ?? null,
    })),
    fleetClients: [],
    vehicles: ((vehiclesRes.data ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      customer_id: row.customer_id ?? null,
      year: Number(row.year ?? 0),
      make: row.make ?? "",
      model: row.model ?? "",
      license_plate: row.license_plate ?? null,
    })),
    catalog: ((catalogRes.data ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      default_price: Number(row.default_price ?? 0),
    })),
    fees: settingsRes.data ? {
      waste_oil_fee: Number(settingsRes.data.waste_oil_fee ?? 0),
      waste_oil_fee_enabled: Boolean(settingsRes.data.waste_oil_fee_enabled),
      shop_fee_value: Number(settingsRes.data.shop_fee_value ?? 0),
      shop_fee_type: settingsRes.data.shop_fee_type ?? null,
      shop_fee_enabled: Boolean(settingsRes.data.shop_fee_enabled),
      surcharge_value: Number(settingsRes.data.surcharge_value ?? 0),
      surcharge_type: settingsRes.data.surcharge_type ?? null,
      surcharge_enabled: Boolean(settingsRes.data.surcharge_enabled),
      tax_rate: Number(settingsRes.data.tax_rate ?? 0),
    } : null,
  };
}

/** Display-only legacy label. The database assigns the canonical bigint. */
export async function generateInvoiceNumber(_userId: string): Promise<string> {
  const id = workspaceId();
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", id);
  if (error) throw error;
  const seq = (count ?? 0) + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(seq).padStart(5, "0")}`;
}
