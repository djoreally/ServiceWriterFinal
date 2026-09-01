/**
 * Smart Upsells Queries & Commands — canonical service_catalog adapter.
 * Pricing is stored in labor_price and behavioral flags live in metadata.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { user, workspaceId: workspace.workspaceId };
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export interface UpsellItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  is_active: boolean;
  is_upsell: boolean;
}

export async function fetchUpsells(): Promise<UpsellItem[]> {
  const { workspaceId } = await requireContext();
  const { data, error } = await supabase
    .from("service_catalog")
    .select("id,name,description,labor_price,is_active,metadata")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const metadata = metadataObject(row.metadata);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        default_price: Number(row.labor_price ?? 0),
        is_active: row.is_active,
        is_upsell: metadata.is_upsell === true,
        sort_order: Number(metadata.sort_order ?? 0),
      };
    })
    .filter((row) => row.is_upsell)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(({ sort_order: _sortOrder, ...row }) => row);
}

export async function updateUpsell(
  id: string,
  payload: { name: string; description: string | null; default_price: number; is_active: boolean },
): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await supabase
    .from("service_catalog")
    .update({
      name: payload.name,
      description: payload.description,
      labor_price: payload.default_price,
      is_active: payload.is_active,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

export async function toggleUpsellActive(id: string, currentlyActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await supabase
    .from("service_catalog")
    .update({ is_active: !currentlyActive })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

export async function loadDefaultUpsellTemplates(existingNames: Set<string>): Promise<number> {
  const { workspaceId } = await requireContext();
  const defaults = [
    { name: "Engine Air Filter", description: "Replace engine air filter to improve fuel efficiency and engine performance.", price: 24.99 },
    { name: "Cabin Air Filter", description: "Replace cabin air filter for cleaner, fresher air inside the vehicle.", price: 29.99 },
    { name: "Wiper Blade Replacement", description: "Replace front and rear wiper blades for clear visibility in all weather conditions.", price: 24.99 },
  ];
  const toInsert = defaults.filter((item) => !existingNames.has(item.name.toLowerCase()));
  if (!toInsert.length) return 0;

  const { error } = await supabase.from("service_catalog").insert(
    toInsert.map((item, index) => ({
      workspace_id: workspaceId,
      name: item.name,
      description: item.description,
      category: "Add-ons",
      estimated_minutes: 15,
      labor_price: item.price,
      is_active: true,
      metadata: { is_upsell: true, sort_order: 900 + index, pricing_mode: "flat" },
    })),
  );
  if (error) throw error;
  return toInsert.length;
}

export async function addUpsell(payload: {
  name: string;
  description: string | null;
  default_price: number;
}): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await supabase.from("service_catalog").insert({
    workspace_id: workspaceId,
    name: payload.name,
    description: payload.description,
    category: "Add-ons",
    estimated_minutes: 15,
    labor_price: payload.default_price,
    is_active: true,
    metadata: { is_upsell: true, pricing_mode: "flat" },
  });
  if (error) throw error;
}
