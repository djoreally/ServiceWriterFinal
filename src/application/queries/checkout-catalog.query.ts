/**
 * Checkout Catalog Query - Fetch public service catalog for booking checkout upsells.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

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
  try {
    const { data } = await apiClient.get<{ data: CheckoutCatalogItem[] }>("/v1/billing/checkout-catalog", {
      query: { business_user_id: businessUserId },
    });
    return data ?? [];
  } catch (error) {
    if (error instanceof ApiClientError) return [];
    throw error;
  }
}
