/** Service package writes through canonical workspace-scoped RPCs. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface PackageFormPayload {
  name: string; description: string | null; package_price: number; discount_type: string;
  discount_value: number; is_active: boolean; estimated_duration: number | null;
}
export interface PackageItemPayload { service_catalog_id: string; quantity: number; override_price: number | null; }

function serializePackageItems(items: PackageItemPayload[]) {
  return items.map((item) => ({ service_catalog_id: item.service_catalog_id, quantity: item.quantity, override_price: item.override_price }));
}

async function workspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function createServicePackage(payload: PackageFormPayload, items: PackageItemPayload[]): Promise<string> {
  const id = await workspaceId();
  const { data, error } = await (supabase as any).rpc("upsert_service_package", {
    p_workspace_id: id,
    p_name: payload.name,
    p_description: payload.description,
    p_package_price: payload.package_price,
    p_discount_type: payload.discount_type,
    p_discount_value: payload.discount_value,
    p_is_active: payload.is_active,
    p_estimated_duration: payload.estimated_duration,
    p_items: serializePackageItems(items),
  });
  if (error) throw error;
  return String(data);
}

export async function updateServicePackage(packageId: string, payload: PackageFormPayload, items: PackageItemPayload[]): Promise<void> {
  const id = await workspaceId();
  const { error } = await (supabase as any).rpc("upsert_service_package", {
    p_workspace_id: id,
    p_package_id: packageId,
    p_name: payload.name,
    p_description: payload.description,
    p_package_price: payload.package_price,
    p_discount_type: payload.discount_type,
    p_discount_value: payload.discount_value,
    p_is_active: payload.is_active,
    p_estimated_duration: payload.estimated_duration,
    p_items: serializePackageItems(items),
  });
  if (error) throw error;
}

export async function deleteServicePackage(packageId: string): Promise<void> {
  const id = await workspaceId();
  const { error } = await (supabase as any).from("service_packages").delete().eq("workspace_id", id).eq("id", packageId);
  if (error) throw error;
}

export async function toggleServicePackageActive(packageId: string, isActive: boolean): Promise<void> {
  const id = await workspaceId();
  const { error } = await (supabase as any).from("service_packages").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("workspace_id", id).eq("id", packageId);
  if (error) throw error;
}

export async function loadTemplatePackages(): Promise<number> {
  const id = await workspaceId();
  const { data, error } = await (supabase as any).rpc("populate_workspace_service_packages", { p_workspace_id: id });
  if (error) throw error;
  return Number(data ?? 0);
}
