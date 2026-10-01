/**
 * Public Business Profile Query
 * Resolves business profiles by booking slug for public-facing pages.
 * ⚡ Security: Uses the allow-listed get_public_booking_profile_v2 RPC — never exposes stripe_account_id.
 */
import { apiClient } from "@/lib/api-client";

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
  const profile = await apiClient.get<PublicBusinessProfile | null>(
    "/v1/platform/public-booking/business",
    { query: { slug } },
  );
  return profile ?? null;
}
