import { supabase } from "@/integrations/supabase/client";

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

  const { data, error } = await supabase.rpc("search_public_providers", {
    search_text: normalized.length > 0 ? normalized : null,
    p_limit: limit,
    p_offset: offset,
  } as never);

  const rows = (data || []) as (ProviderDirectoryItem & { total_count?: number })[];

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
  const { data, error } = await supabase.rpc("get_directory_provider_profile", {
    booking_slug_param: slug,
  } as never);

  const rows = (data || []) as DirectoryProviderProfile[];
  return { data: rows[0] ?? null, error };
}


export async function fetchProviderDirectoryServices(
  providerIds: string[]
): Promise<{ data: ProviderServiceItem[]; error: unknown }> {
  if (!providerIds.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from("service_catalog")
    .select("user_id, name, default_price")
    .eq("is_active", true)
    .in("user_id", providerIds)
    .limit(500);

  return {
    data: (data || []) as ProviderServiceItem[],
    error,
  };
}
