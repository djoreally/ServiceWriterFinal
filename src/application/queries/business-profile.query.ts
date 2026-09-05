/**
 * Business profile queries backed by the canonical workspace settings adapter.
 */
import { fetchBusinessSettings } from "@/application/queries/settings.query";

export interface BaseServiceCoordinates {
  lat: number;
  lng: number;
}

export async function fetchCurrentBusinessBaseCoordinates(): Promise<BaseServiceCoordinates | null> {
  const settings = await fetchBusinessSettings();
  const coords = settings?.service_coordinates;
  if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
    return { lat: coords.lat, lng: coords.lng };
  }
  return null;
}
