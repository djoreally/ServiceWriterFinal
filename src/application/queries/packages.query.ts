/**
 * Packages Query - Read operations for service packages.
 */

import { supabase } from "@/integrations/supabase/client";
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";

export interface PackageServiceItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
}

export interface PackageItem {
  id?: string;
  service_catalog_id: string;
  quantity: number;
  override_price: number | null;
  service?: PackageServiceItem;
}

export interface ServicePackageRow {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  estimated_duration: number | null;
  items: PackageItem[];
}

/** Fetch all service packages with their line items for the authenticated user. */
export async function fetchServicePackages(): Promise<ServicePackageRow[]> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  const { data: packagesData, error: packagesError } = await supabase
    .from("service_packages")
    .select("*")
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false });

  if (packagesError) throw packagesError;

  // Fetch items for each package
  const packagesWithItems: ServicePackageRow[] = [];
  for (const pkg of packagesData || []) {
    const { data: items } = await supabase
      .from("service_package_items")
      .select(`
        id,
        service_catalog_id,
        quantity,
        override_price,
        service_catalog (
          id, name, description, default_price, estimated_duration, category
        )
      `)
      .eq("package_id", pkg.id);

    packagesWithItems.push({
      ...pkg,
      items: (items || []).map((item) => ({
        id: item.id,
        service_catalog_id: item.service_catalog_id,
        quantity: item.quantity,
        override_price: item.override_price,
        service: item.service_catalog as unknown as PackageServiceItem,
      })),
    });
  }

  return packagesWithItems;
}

/** Fetch active service catalog items for the authenticated user (used in package builder). */
export async function fetchPackageServiceCatalog(): Promise<PackageServiceItem[]> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  const { data, error } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_price, estimated_duration, category")
    .eq("user_id", ownerUserId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data || []) as PackageServiceItem[];
}
