/**
 * Checkout Catalog Query - Fetch public service catalog for booking checkout upsells.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CheckoutCatalogItem {
  id: string;
  name: string;
  default_price: number;
  description?: string | null;
  category?: string | null;
  is_upsell?: boolean;
}

/** Fetch public service catalog for a business user (used in checkout upsell step). */
export async function fetchCheckoutCatalog(businessUserId: string): Promise<CheckoutCatalogItem[]> {
  const { data, error } = await supabase.rpc("get_public_service_catalog", {
    business_user_id: businessUserId,
  });
  if (error) return [];
  return (data as CheckoutCatalogItem[]) ?? [];
}
