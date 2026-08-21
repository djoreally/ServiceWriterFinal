/**
 * useWorkspaceBrand — resolves the active workspace's brand (business name +
 * tagline + logo) so every in-app surface (sidebar, mobile nav, top header,
 * etc.) stays white-labeled to the owner the user is currently working under.
 *
 * For owners (admin) → reads their own business_profiles row.
 * For team members  → reads the owner's business_profiles row (via the
 *                     ownerUserId resolved by useTeamRole).
 *
 * Falls back to the platform brand ("Service Writer") while loading or when
 * onboarding hasn't filled in a business name yet.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeamRole } from "@/hooks/useTeamRole";

export interface WorkspaceBrand {
  name: string;
  tagline: string;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  loading: boolean;
}

const PLATFORM_FALLBACK = {
  name: "Service Writer",
  tagline: "",
  logoUrl: null as string | null,
};

export function useWorkspaceBrand(): WorkspaceBrand {
  const { ownerUserId, loading: roleLoading } = useTeamRole();

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-brand", ownerUserId],
    enabled: Boolean(ownerUserId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("business_name, logo_url, address, city, state, phone, email, website_url")
        .eq("user_id", ownerUserId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const loading = roleLoading || (Boolean(ownerUserId) && isLoading);
  const name =
    (data?.business_name && data.business_name.trim()) || PLATFORM_FALLBACK.name;
  const logoUrl = data?.logo_url ?? null;

  return {
    name,
    tagline: PLATFORM_FALLBACK.tagline,
    logoUrl,
    address: data?.address ?? null,
    city: data?.city ?? null,
    state: data?.state ?? null,
    phone: data?.phone ?? null,
    email: data?.email ?? null,
    website: data?.website_url ?? null,
    loading,
  };
}
