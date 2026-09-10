/**
 * Inline Service Writer Queries — canonical workspace-scoped reads for the Command Center.
 */
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { supabase } from "@/integrations/supabase/client";

type QueryResult<T> = { data: T | null; error: Error | null };

type InlineCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  labor_rate: number | null;
  estimated_duration: number | null;
  category: string | null;
};

type InlineCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Request failed");
}

/** Fetch canonical service catalog and customers in parallel. userId is retained for caller compatibility only. */
export async function fetchServiceWriterData(_userId: string): Promise<[
  QueryResult<InlineCatalogItem[]>,
  QueryResult<InlineCustomer[]>,
]> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("Select a workspace before using the Service Writer.");

    const [customerResponse, catalogResponse] = await Promise.all([
      nextApi.customers.list(context.workspaceId),
      (supabase as any)
        .from("service_catalog")
        .select("id,name,description,default_price,labor_rate,estimated_duration,category")
        .eq("workspace_id", context.workspaceId)
        .eq("is_active", true)
        .order("name"),
    ]);

    if (catalogResponse.error) throw catalogResponse.error;

    const customers = ((customerResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || String(row.company_name || "Customer"),
      email: typeof row.email === "string" ? row.email : null,
      phone: typeof row.phone === "string" ? row.phone : null,
      address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", ") || null,
    }));

    const catalog = ((catalogResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name || "Service"),
      description: typeof row.description === "string" ? row.description : null,
      default_price: Number(row.default_price ?? 0),
      labor_rate: row.labor_rate == null ? null : Number(row.labor_rate),
      estimated_duration: row.estimated_duration == null ? null : Number(row.estimated_duration),
      category: typeof row.category === "string" ? row.category : null,
    }));

    return [
      { data: catalog, error: null },
      { data: customers, error: null },
    ];
  } catch (error) {
    const normalized = asError(error);
    return [
      { data: null, error: normalized },
      { data: null, error: normalized },
    ];
  }
}
