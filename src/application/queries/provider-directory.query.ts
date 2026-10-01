import { apiClient } from "@/lib/api-client";

export interface ProviderDirectoryItem {
  user_id: string;
  business_name: string;
  description: string;
  booking_slug: string;
  booking_url: string;
  service_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  logo_url: string | null;
}

export interface ProviderServiceItem {
  user_id: string;
  name: string;
  default_price: number | null;
}

export interface DirectoryProviderProfile {
  user_id: string;
  business_name: string;
  booking_slug: string;
  logo_url: string | null;
  phone: string | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  google_review_url: string | null;
  yelp_review_url: string | null;
}

export interface ProviderDirectoryPage {
  data: ProviderDirectoryItem[];
  totalCount: number;
  error: unknown;
}

/**
 * Server-side directory search. Only returns businesses that explicitly
 * opted into the public marketplace and are not soft-deleted.
 */
export async function searchProviderDirectory(
  searchText: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ProviderDirectoryPage> {
  const normalized = searchText.trim();
  const limit = options.limit ?? 25;
  const offset = options.offset ?? 0;

  const { data, error } = await apiClient.get<{
    data: (ProviderDirectoryItem & { total_count?: number })[];
    error: unknown;
  }>("/v1/platform/provider-directory/search", {
    query: {
      search_text: normalized.length > 0 ? normalized : "",
      limit,
      offset,
    },
  });

  const rows = data || [];

  const normalizedData = rows
    .filter((provider) => Boolean(provider.booking_slug))
    .map((provider) => ({
      ...provider,
      booking_url: `/book/${provider.booking_slug}`,
    }));

  return {
    data: normalizedData,
    totalCount: Number(rows[0]?.total_count ?? normalizedData.length),
    error,
  };
}

export async function fetchDirectoryProviderProfile(
  slug: string
): Promise<{ data: DirectoryProviderProfile | null; error: unknown }> {
  return apiClient.get("/v1/platform/provider-directory/profile", {
    query: { slug },
  });
}


export async function fetchProviderDirectoryServices(
  providerIds: string[]
): Promise<{ data: ProviderServiceItem[]; error: unknown }> {
  if (!providerIds.length) return { data: [], error: null };

  return apiClient.get("/v1/platform/provider-directory/services", {
    query: { provider_ids: providerIds.join(",") },
  });
}
