/** Quote Document Query — canonical workspace-scoped document adapter. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function quoteStatus(status: string): string {
  if (status === "approved") return "accepted";
  if (status === "declined") return "rejected";
  if (status === "draft" || status === "sent") return "pending";
  return status;
}

function customerName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null }): string {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || row?.company_name || "Customer";
}

function address(row: { address_line1?: string | null; address_line2?: string | null; city?: string | null; region?: string | null; postal_code?: string | null } | null): string | null {
  const value = [row?.address_line1, row?.address_line2, row?.city, row?.region, row?.postal_code].filter(Boolean).join(", ");
  return value || null;
}

export async function fetchQuoteDocumentData(quoteId: string, customerId: string, vehicleId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const client = productionSupabase;

  const [quoteRes, itemsRes, customerRes, vehicleRes, workspaceRes, settingsRes] = await Promise.all([
    client.from("quotes")
      .select("id,customer_id,vehicle_id,status,subtotal,tax_total,total,expires_at,created_at,updated_at,metadata")
      .eq("workspace_id", context.workspaceId)
      .eq("id", quoteId)
      .single(),
    client.from("quote_items")
      .select("id,description,quantity,unit_price,total_price")
      .eq("workspace_id", context.workspaceId)
      .eq("quote_id", quoteId)
      .order("created_at"),
    client.from("customers")
      .select("id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,created_at")
      .eq("workspace_id", context.workspaceId)
      .eq("id", customerId)
      .maybeSingle(),
    client.from("vehicles")
      .select("id,make,model,year,trim,license_plate,vin,mileage,color,metadata")
      .eq("workspace_id", context.workspaceId)
      .eq("id", vehicleId)
      .maybeSingle(),
    client.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    client.from("workspace_settings")
      .select("owner_name,phone,email,address_line1,address_line2,city,region,postal_code,logo_url")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
  ]);

  if (quoteRes.error) throw quoteRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (customerRes.error) throw customerRes.error;
  if (vehicleRes.error) throw vehicleRes.error;
  if (workspaceRes.error) throw workspaceRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const row = quoteRes.data;
  const metadata = object(row.metadata);
  const customer = customerRes.data;
  const vehicle = vehicleRes.data;
  const vehicleMeta = object(vehicle?.metadata);
  const settings = settingsRes.data;

  return {
    quote: {
      id: row.id,
      quote_number: String(metadata.quote_number ?? `Q-${row.id.slice(0, 8).toUpperCase()}`),
      quote_date: String(metadata.quote_date ?? row.created_at?.slice(0, 10) ?? ""),
      valid_until: metadata.valid_until ?? row.expires_at?.slice(0, 10) ?? null,
      description: String(metadata.description ?? "Quote"),
      labor_hours: metadata.labor_hours == null ? null : Number(metadata.labor_hours),
      labor_cost: metadata.labor_cost == null ? null : Number(metadata.labor_cost),
      parts_cost: metadata.parts_cost == null ? null : Number(metadata.parts_cost),
      total_cost: Number(row.total ?? 0),
      status: quoteStatus(String(row.status)),
      notes: metadata.notes == null ? null : String(metadata.notes),
      fleet_metadata: metadata.fleet_metadata ?? null,
    },
    quoteItems: (itemsRes.data ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      total_price: Number(item.total_price ?? 0),
    })),
    customer: customer ? {
      name: customerName(customer),
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      address: address(customer),
      created_at: customer.created_at,
    } : null,
    vehicle: vehicle ? {
      make: vehicle.make,
      model: vehicle.model,
      year: Number(vehicle.year),
      license_plate: vehicle.license_plate ?? null,
      vin: vehicle.vin ?? null,
      mileage: vehicle.mileage ?? null,
      color: vehicle.color ?? null,
      engine: typeof vehicleMeta.engine === "string" ? vehicleMeta.engine : null,
    } : null,
    business: workspaceRes.data ? {
      business_name: workspaceRes.data.name,
      owner_name: settings?.owner_name ?? "",
      phone: settings?.phone ?? "",
      email: settings?.email ?? "",
      address: address(settings) ?? "",
      logo_url: settings?.logo_url ?? "",
    } : null,
  };
}

/** Final has no email provider runtime installed yet; never call a retired Edge Function. */
export async function sendQuoteEmail(_body: Record<string, unknown>): Promise<{ data: null; error: Error }> {
  return {
    data: null,
    error: new Error("Quote email delivery is not configured on Final yet. Print or download the quote instead."),
  };
}
