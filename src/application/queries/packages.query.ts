/** Service package read operations backed by canonical workspace tables. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface PackageServiceItem {
  id: string; name: string; description: string | null; default_price: number; estimated_duration: number | null; category: string | null;
}
export interface PackageItem { id?: string; service_catalog_id: string; quantity: number; override_price: number | null; service?: PackageServiceItem; }
export interface ServicePackageRow {
  id: string; name: string; description: string | null; package_price: number; discount_type: string; discount_value: number;
  is_active: boolean; estimated_duration: number | null; items: PackageItem[];
}

function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export async function fetchServicePackages(): Promise<ServicePackageRow[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data: packagesData, error: packagesError } = await db
    .from("service_packages").select("id,name,description,package_price,discount_type,discount_value,is_active,estimated_duration,created_at")
    .eq("workspace_id", context.workspaceId).order("created_at", { ascending: false });
  if (packagesError) throw packagesError;

  const result: ServicePackageRow[] = [];
  for (const pkg of packagesData ?? []) {
    const { data: items, error } = await db.from("service_package_items").select(`
      id,service_catalog_id,quantity,override_price,
      service_catalog(id,name,description,labor_price,estimated_minutes,category)
    `).eq("package_id", pkg.id);
    if (error) throw error;
    result.push({
      ...pkg,
      package_price: Number(pkg.package_price ?? 0),
      discount_value: Number(pkg.discount_value ?? 0),
      estimated_duration: pkg.estimated_duration == null ? null : Number(pkg.estimated_duration),
      items: (items ?? []).map((item: any) => {
        const service = one<Record<string, any>>(item.service_catalog);
        return {
          id: item.id,
          service_catalog_id: item.service_catalog_id,
          quantity: Number(item.quantity ?? 1),
          override_price: item.override_price == null ? null : Number(item.override_price),
          service: service ? {
            id: service.id,
            name: service.name,
            description: service.description,
            default_price: Number(service.labor_price ?? 0),
            estimated_duration: service.estimated_minutes == null ? null : Number(service.estimated_minutes),
            category: service.category,
          } : undefined,
        };
      }),
    });
  }
  return result;
}

export async function fetchPackageServiceCatalog(): Promise<PackageServiceItem[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await db.from("service_catalog")
    .select("id,name,description,labor_price,estimated_minutes,category")
    .eq("workspace_id", context.workspaceId).eq("is_active", true).order("name");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    default_price: Number(row.labor_price ?? 0),
    estimated_duration: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    category: row.category,
  }));
}
