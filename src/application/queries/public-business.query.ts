/**
 * Public Business Profile Query
 * Resolves business profiles by booking slug for public-facing pages.
 * ⚡ Security: Uses the allow-listed get_public_booking_profile_v2 RPC — never exposes stripe_account_id.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PublicBusinessProfile {
  user_id: string;
  business_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string | null;
  stripe_charges_enabled: boolean;
}

export async function fetchBusinessBySlug(slug: string): Promise<PublicBusinessProfile | null> {
  const { data, error } = await supabase.rpc("get_public_booking_profile_v2", {
    booking_slug_param: slug,
  });

  if (error || !data || data.length === 0) return null;

  const profile = data[0];
  return {
    user_id: profile.user_id,
    business_name: profile.business_name || "",
    logo_url: profile.logo_url || null,
    phone: profile.phone || null,
    email: profile.email || null,
    address: null,
    currency: profile.currency || null,
    stripe_charges_enabled: profile.stripe_charges_enabled || false,
  };
}
