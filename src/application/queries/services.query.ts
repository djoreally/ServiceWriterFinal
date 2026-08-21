/**
 * Services Query - Read operations for service catalog
 */

import { supabase } from "@/integrations/supabase/client";

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
}

/**
 * Fetch all active services for the current authenticated user's tenant.
 */
export async function fetchServices(_tenantUserId?: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_price, estimated_duration, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    default_price: item.default_price,
    estimated_duration: item.estimated_duration,
    category: item.category,
  }));
}

/**
 * Fetch a single service by ID
 */
export async function fetchServiceById(
  _tenantUserId: string,
  serviceId: string
): Promise<ServiceCatalogItem | null> {
  const { data, error } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_price, estimated_duration, category")
    .eq("id", serviceId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}
