/**
 * useShopBrand — resolves branding from the canonical active workspace.
 * The legacy workspace owner parameter is retained for call-site compatibility
 * while the application converges on workspace IDs.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchBusinessSettings } from "@/application/queries/settings.query";

export interface ShopBrand {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  loading: boolean;
}

const FALLBACK_NAME = "Service Writer";

export function useShopBrand(workspaceUserId?: string | null): ShopBrand {
  const { data, isLoading } = useQuery({
    queryKey: ["shop-brand", "active", workspaceUserId ?? "self"],
    queryFn: fetchBusinessSettings,
    staleTime: 5 * 60 * 1000,
  });

  return {
    name: data?.business_name?.trim() || FALLBACK_NAME,
    logoUrl: data?.logo_url || null,
    phone: data?.phone || null,
    email: data?.email || null,
    website: null,
    loading: isLoading,
  };
}
