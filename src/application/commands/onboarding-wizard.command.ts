/**
 * Onboarding Wizard Commands — All write operations for the onboarding flow.
 * Extracted from onboarding-wizard.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

/** Upsert onboarding profile data. */
export async function saveOnboardingProgress(profileData: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .upsert(profileData as any, { onConflict: "user_id" });
  if (error) throw error;
}

/** Add first service during onboarding. */
export async function addOnboardingService(userId: string, service: {
  name: string;
  description: string;
  price: number;
  duration: number;
}): Promise<void> {
  const { error } = await supabase.from("service_catalog").insert({
    user_id: userId,
    name: service.name,
    description: service.description,
    default_price: service.price,
    estimated_duration: service.duration,
    is_active: true,
  });
  if (error) throw error;
}

/**
 * Bulk-add services accepted from a website import.
 * Services with no detected price are stored unpriced (null) so they surface
 * as "Get a quote" instead of a misleading $0.
 */
export async function addOnboardingServices(
  userId: string,
  services: Array<{ name: string; description: string; price: number | null; duration_minutes: number }>,
): Promise<number> {
  if (services.length === 0) return 0;

  const rows = services.map((service) => ({
    user_id: userId,
    name: service.name,
    description: service.description,
    default_price: service.price,
    estimated_duration: service.duration_minutes,
    is_active: true,
  }));

  const { error } = await supabase.from("service_catalog").insert(rows as any);
  if (error) throw error;
  return rows.length;
}

