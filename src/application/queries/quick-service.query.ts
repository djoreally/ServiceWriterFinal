/**
 * Quick Service Query — canonical workspace-scoped reads for the Quick Service wizard.
 *
 * Phase 2: the service-catalog read goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router; customers/vehicles
 * remain on the grandfathered `nextApi` wrapper. Exported signatures are
 * unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getWorkspaceOwnerUserId } from "@/application/tenant-workspace";

/** Retained for legacy page compatibility; tenant authority comes from workspace selection. */
export async function getCurrentUserId(): Promise<string | null> {
  return getWorkspaceOwnerUserId();
}

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before using Quick Service.");
  return id;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Fetch customers, vehicles, and active service catalog from the selected workspace only. */
export async function fetchQuickServiceFormData() {
  const id = workspaceId();
  const [customersResponse, vehiclesResponse, catalogResponse] = await Promise.all([
    nextApi.customers.list(id),
    nextApi.vehicles.list(id),
    apiClient.get<{ data: Array<{ id: string; name: string; description: string | null; labor_price: number | string | null; metadata: unknown }> | null }>(
      "/v1/appointments/service-catalog",
      { query: { active: "true", selected_workspace_id: id } },
    ),
  ]);

  const customers = ((customersResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Customer",
  }));
  const vehicles = ((vehiclesResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    customer_id: String(row.customer_id ?? ""),
    make: String(row.make ?? ""),
    model: String(row.model ?? ""),
    year: Number(row.year ?? 0),
  }));
  const catalog = ((catalogResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const metadata = metadataObject(row.metadata);
    return {
      id: String(row.id),
      name: String(row.name ?? "Service"),
      description: row.description == null ? null : String(row.description),
      default_price: Number(metadata.default_price ?? row.labor_price ?? 0),
      labor_rate: metadata.labor_rate == null ? null : Number(metadata.labor_rate),
    };
  });

  return { customers, vehicles, catalog };
}
