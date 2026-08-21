/**
 * Business profile queries scoped to the current authenticated user.
 * Kept small and focused so UI components don't reach into supabase directly.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BaseServiceCoordinates {
  lat: number;
  lng: number;
}

export async function fetchCurrentBusinessBaseCoordinates(): Promise<BaseServiceCoordinates | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("business_profiles")
    .select("service_coordinates")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const coords = data?.service_coordinates as { lat?: number; lng?: number } | null;
  if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
    return { lat: coords.lat, lng: coords.lng };
  }
  return null;
}
