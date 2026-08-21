/**
 * useShopBrand — resolves the shop (workspace owner) branding for in-app
 * surfaces that must be white-labeled to the shop the user works for.
 *
 * Technicians cannot read business_profiles directly (RLS), so this goes through
 * the security-definer RPC get_workspace_brand_v1, which only exposes branding
 * fields and only to the owner or a member of that workspace.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    queryKey: ["shop-brand", workspaceUserId],
    enabled: Boolean(workspaceUserId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_workspace_brand_v1", {
        p_workspace_user_id: workspaceUserId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as {
        business_name: string | null;
        logo_url: string | null;
        phone: string | null;
        email: string | null;
        website_url: string | null;
      } | null;
    },
  });

  return {
    name: data?.business_name?.trim() || FALLBACK_NAME,
    logoUrl: data?.logo_url ?? null,
    phone: data?.phone ?? null,
    email: data?.email ?? null,
    website: data?.website_url ?? null,
    loading: Boolean(workspaceUserId) && isLoading,
  };
}
