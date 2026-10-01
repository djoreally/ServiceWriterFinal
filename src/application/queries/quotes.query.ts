/** Quotes Query — canonical workspace-scoped reads with a legacy UI adapter.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. The legacy UI
 * adapter (tuple returns, uiStatus mapping) is preserved; exported
 * signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function customerName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null }): string {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || row?.company_name || "Customer";
}

interface PageDataResponse {
  quotes: Array<Record<string, unknown>>;
  customers: Array<{ id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null }>;
  vehicles: Array<{ id: string; customer_id: string | null; make: string; model: string; year: number; vin: string | null }>;
  catalog: Array<{ id: string; name: string; description: string | null; labor_price: number | null; metadata: unknown }>;
}

export async function fetchQuotesPageData() {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) {
    const empty = { data: [], error: null };
    return [empty, empty, empty, empty, empty] as const;
  }

  const response = await apiClient.get<{ data: PageDataResponse }>(`/v1/quotes/page-data`, {
    query: { workspace_id: workspaceId },
  });
  const { quotes: quoteRows = [], customers: customerRows = [], vehicles: vehicleRows = [], catalog: catalogRows = [] } =
    response.data ?? {};

  const quotes = quoteRows
    .filter((row) => !object(row.metadata).archived_at)
    .map((row) => {
      const metadata = object(row.metadata);
      return {
        id: row.id,
        customer_id: row.customer_id,
        vehicle_id: row.vehicle_id,
        quote_number: String(metadata.quote_number ?? `Q-${String(row.id).slice(0, 8).toUpperCase()}`),
        quote_date: String(metadata.quote_date ?? String(row.created_at ?? "").slice(0, 10) ?? ""),
        valid_until: metadata.valid_until ?? (typeof row.expires_at === "string" ? row.expires_at.slice(0, 10) : null),
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
    { data: quotes, error: null },
    { data: customerRows.map((row) => ({ id: String(row.id), name: customerName(row) })), error: null },
    { data: vehicleRows, error: null },
    { data: [], error: null },
    {
      data: catalogRows.map((row) => {
        const metadata = object(row.metadata);
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          description: row.description ?? null,
          default_price: Number(metadata.default_price ?? row.labor_price ?? 0),
          labor_rate: metadata.labor_rate == null ? null : Number(metadata.labor_rate),
        };
      }),
      error: null,
    },
  ] as const;
}

export async function fetchQuoteItems(quoteId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: [], error: null };
  try {
    const response = await apiClient.get<{ data: unknown[] }>(
      `/v1/quotes/${encodeURIComponent(quoteId)}/items`,
      { query: { workspace_id: workspaceId } },
    );
    return { data: response.data ?? [], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error("Failed to fetch quote items") };
  }
}
