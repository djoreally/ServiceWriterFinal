/**
 * Business profile queries scoped to the current authenticated user.
 * Kept small and focused so UI components don't reach into supabase directly.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BaseServiceCoordinates {
  lat: number;
  lng: number;
}

export async function fetchCurrentBusinessBaseCoordinates(): Promise<BaseServiceCoordinates | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  try {
    const data = await apiClient.get<BaseServiceCoordinates | null>(
      "/v1/platform/business-profile/coordinates",
    );
    if (data && typeof data.lat === "number" && typeof data.lng === "number") {
      return { lat: data.lat, lng: data.lng };
    }
    return null;
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}
