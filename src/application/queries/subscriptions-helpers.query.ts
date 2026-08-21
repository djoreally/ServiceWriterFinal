/**
 * Subscriptions Query Helpers - Additional service catalog fetch for subscriptions page.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionServiceCatalogItem {
  id: string;
  name: string;
  default_price: number;
  category: string | null;
  is_active: boolean;
}

/** Fetch active service catalog items for subscription plan creation */
export async function fetchActiveServiceCatalog(): Promise<SubscriptionServiceCatalogItem[]> {
  const { data } = await supabase
    .from("service_catalog")
    .select("id, name, default_price, category, is_active")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as SubscriptionServiceCatalogItem[];
}
