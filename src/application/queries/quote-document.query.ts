/** Quote Document Query — canonical workspace-scoped document adapter.
 *
 * Phase 2: the document bundle is fetched through the typed API client
 * (`@/lib/api-client`) from the documents Hono router; presentation
 * shaping stays client-side. Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return null;

  const response = await apiClient.get<{
    data: {
      quote: Record<string, any>;
      items: Array<Record<string, any>>;
      customer: Record<string, any> | null;
      vehicle: Record<string, any> | null;
      workspace: { name: string } | null;
      settings: Record<string, any> | null;
    };
  }>(`/v1/quotes/${encodeURIComponent(quoteId)}/document`, {
    query: {
      workspace_id: workspaceId,
      customer_id: customerId,
      vehicle_id: vehicleId,
    },
  });

  const row = response.data.quote;
  const items = response.data.items ?? [];
  const customer = response.data.customer;
  const vehicle = response.data.vehicle;
  const workspace = response.data.workspace;
  const settings = response.data.settings;
  const metadata = object(row.metadata);
  const vehicleMeta = object(vehicle?.metadata);

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
    quoteItems: items.map((item) => ({
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
    business: workspace ? {
      business_name: workspace.name,
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
