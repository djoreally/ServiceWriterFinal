/**
 * useWorkspaceBrand — active workspace branding from the canonical workspace
 * and workspace_settings model.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchBusinessSettings } from "@/application/queries/settings.query";

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

function splitAddress(address: string): { city: string | null; state: string | null } {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: parts.length >= 2 ? parts[parts.length - 2] : null,
    state: parts.length >= 1 ? parts[parts.length - 1] : null,
  };
}

export function useWorkspaceBrand(): WorkspaceBrand {
  const { data, isLoading } = useQuery({
    queryKey: ["workspace-brand", "active"],
    queryFn: fetchBusinessSettings,
    staleTime: 5 * 60 * 1000,
  });

  const parsed = splitAddress(data?.address || "");

  return {
    name: data?.business_name?.trim() || PLATFORM_FALLBACK.name,
    tagline: PLATFORM_FALLBACK.tagline,
    logoUrl: data?.logo_url || null,
    address: data?.address || null,
    city: parsed.city,
    state: parsed.state,
    phone: data?.phone || null,
    email: data?.email || null,
    website: null,
    loading: isLoading,
  };
}
