/**
 * Subscriptions Query Helpers - Additional service catalog fetch for subscriptions page.
 */

import { apiClient, ApiClientError } from "@/lib/api-client";

export interface SubscriptionServiceCatalogItem {
  id: string;
  name: string;
  default_price: number;
  category: string | null;
  is_active: boolean;
}

/** Fetch active service catalog items for subscription plan creation */
export async function fetchActiveServiceCatalog(): Promise<SubscriptionServiceCatalogItem[]> {
  try {
    const { data } = await apiClient.get<{ data: SubscriptionServiceCatalogItem[] }>("/v1/billing/service-catalog-active");
    return data ?? [];
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}
