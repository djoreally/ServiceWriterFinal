/** Quotes Query — canonical workspace-scoped reads with a legacy UI adapter. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function uiStatus(status: string): string {
  switch (status) {
    case "approved": return "accepted";
    case "declined": return "rejected";
    case "draft":
    case "sent": return "pending";
    default: return status;
  }
}

function customerName(row: any): string {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || row?.company_name || "Customer";
}

/** Fetch all data needed for the Quotes page in the existing five-result shape. */
export async function fetchQuotesPageData() {
  const context = await resolveCurrentWorkspace();
  if (!context) {
    const empty = { data: [], error: null };
    return [empty, empty, empty, empty, empty] as const;
  }

  const client = supabase as any;
  const [quotesRes, customersRes, vehiclesRes, catalogRes] = await Promise.all([
    client.from("quotes")
      .select("id,workspace_id,customer_id,vehicle_id,work_order_id,status,subtotal,tax_total,total,expires_at,created_at,updated_at,metadata")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false }),
    client.from("customers")
      .select("id,first_name,last_name,company_name")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "archived")
      .order("last_name"),
    client.from("vehicles")
      .select("id,customer_id,make,model,year,vin")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    client.from("service_catalog")
      .select("id,name,description,default_price,labor_rate")
      .eq("workspace_id", context.workspaceId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const quotes = ((quotesRes.data ?? []) as any[]).map((row) => {
    const metadata = object(row.metadata);
    return {
      id: row.id,
      customer_id: row.customer_id,
      vehicle_id: row.vehicle_id,
      quote_number: String(metadata.quote_number ?? `Q-${row.id.slice(0, 8).toUpperCase()}`),
      quote_date: String(metadata.quote_date ?? row.created_at?.slice(0, 10) ?? ""),
      valid_until: metadata.valid_until ?? row.expires_at?.slice(0, 10) ?? null,
      description: String(metadata.description ?? "Quote"),
      labor_hours: metadata.labor_hours == null ? null : Number(metadata.labor_hours),
      labor_cost: metadata.labor_cost == null ? null : Number(metadata.labor_cost),
      parts_cost: metadata.parts_cost == null ? null : Number(metadata.parts_cost),
      total_cost: Number(row.total ?? 0),
      status: uiStatus(String(row.status)),
      notes: metadata.notes == null ? null : String(metadata.notes),
      fleet_metadata: metadata.fleet_metadata ?? null,
      updated_at: row.updated_at,
    };
  });

  return [
    { data: quotes, error: quotesRes.error },
    { data: ((customersRes.data ?? []) as any[]).map((row) => ({ id: row.id, name: customerName(row) })), error: customersRes.error },
    { data: vehiclesRes.data ?? [], error: vehiclesRes.error },
    // Inventory is intentionally not part of Final Service Writer yet. Preserve the UI slot as empty.
    { data: [], error: null },
    { data: catalogRes.data ?? [], error: catalogRes.error },
  ] as const;
}

/** Fetch workspace-scoped quote items for a specific quote. */
export async function fetchQuoteItems(quoteId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  return (supabase.from("quote_items") as any)
    .select("id,quote_id,inventory_item_id,description,quantity,unit_price,total_price")
    .eq("workspace_id", context.workspaceId)
    .eq("quote_id", quoteId)
    .order("created_at");
}
