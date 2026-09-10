/**
 * Quick Service Query — canonical workspace-scoped reads for the Quick Service wizard.
 */
import { supabase } from "@/integrations/supabase/client";
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
  const db = supabase as any;
  const [customersResponse, vehiclesResponse, catalogRes] = await Promise.all([
    nextApi.customers.list(id),
    nextApi.vehicles.list(id),
    db
      .from("service_catalog")
      .select("id,name,description,labor_price,metadata")
      .eq("workspace_id", id)
      .eq("is_active", true)
      .order("name"),
  ]);
  if (catalogRes.error) throw catalogRes.error;

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
  const catalog = ((catalogRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
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
