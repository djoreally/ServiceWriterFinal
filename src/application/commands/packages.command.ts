/**
 * Packages Command - Write operations for service packages.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface PackageFormPayload {
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  estimated_duration: number | null;
}

export interface PackageItemPayload {
  service_catalog_id: string;
  quantity: number;
  override_price: number | null;
}

function serializePackageItems(items: PackageItemPayload[]): Json {
  return items.map((item) => ({
    service_catalog_id: item.service_catalog_id,
    quantity: item.quantity,
    override_price: item.override_price,
  }));
}

/**
 * Create a new service package with line items — atomically via DB RPC.
 * Package insert + item inserts happen in a single transaction.
 */
export async function createServicePackage(
  payload: PackageFormPayload,
  items: PackageItemPayload[],
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "upsert_service_package",
    {
      p_name: payload.name,
      p_description: payload.description,
      p_package_price: payload.package_price,
      p_discount_type: payload.discount_type,
      p_discount_value: payload.discount_value,
      p_is_active: payload.is_active,
      p_estimated_duration: payload.estimated_duration,
      p_items: serializePackageItems(items),
    },
  );

  if (error) throw error;
  return data as string;
}

/**
 * Update an existing service package and replace its line items — atomically via DB RPC.
 * Package update + delete old items + insert new items happen in a single transaction.
 */
export async function updateServicePackage(
  packageId: string,
  payload: PackageFormPayload,
  items: PackageItemPayload[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "upsert_service_package",
    {
      p_package_id: packageId,
      p_name: payload.name,
      p_description: payload.description,
      p_package_price: payload.package_price,
      p_discount_type: payload.discount_type,
      p_discount_value: payload.discount_value,
      p_is_active: payload.is_active,
      p_estimated_duration: payload.estimated_duration,
      p_items: serializePackageItems(items),
    },
  );

  if (error) throw error;
}

/** Delete a service package. */
export async function deleteServicePackage(packageId: string): Promise<void> {
  const { error } = await supabase.from("service_packages").delete().eq("id", packageId);
  if (error) throw error;
}

/** Toggle the is_active flag on a service package. */
export async function toggleServicePackageActive(packageId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("service_packages")
    .update({ is_active: isActive })
    .eq("id", packageId);
  if (error) throw error;
}

/** Load pre-configured template packages via RPC. Returns number inserted. */
export async function loadTemplatePackages(): Promise<number> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("populate_user_service_packages", {
    p_user_id: user.id,
  });

  if (error) throw error;
  return data as number;
}
