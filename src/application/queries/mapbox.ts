import { requireMapboxToken } from '@/lib/mapbox';
import { getRoutePreview } from '@/application/commands/location-service.command';
import type { LineString } from 'geojson';

export interface GeocodeOptions {
  limit?: number;
  country?: string;
  types?: string;
  proximity?: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
  raw?: unknown;
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: LineString | null;
  legs: Array<{ distanceMeters: number; durationSeconds: number }>;
}

export interface DrivingRouteInput {
  origin: RoutePoint;
  destination: RoutePoint;
  profile?: 'driving' | 'driving-traffic';
}

const MAPBOX_GEOCODE_ENDPOINT = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Geocode an address via Mapbox; returns the first match or null when none. */
export const geocodeAddress = async (
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> => {
  if (!address.trim()) return null;

  const token = requireMapboxToken();
  const params = new URLSearchParams({
    access_token: token,
    limit: String(options.limit ?? 1),
  });

  if (options.country) params.set('country', options.country);
  if (options.types) params.set('types', options.types);
  if (options.proximity) params.set('proximity', options.proximity);

  const url = `${MAPBOX_GEOCODE_ENDPOINT}/${encodeURIComponent(address)}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocoding failed: ${res.statusText}`);

  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature?.center || feature.center.length < 2) return null;

  return {
    lat: feature.center[1],
    lng: feature.center[0],
    placeName: feature.place_name ?? address,
    raw: feature,
  };
};

/** Request a traffic-aware driving route between two points. */
export const getDrivingRoute = async (
  { origin, destination, profile = 'driving-traffic' }: DrivingRouteInput
): Promise<RouteResult> => {
  const data = await getRoutePreview({
    origin: { latitude: origin.lat, longitude: origin.lng },
    destination: { latitude: destination.lat, longitude: destination.lng },
    profile,
  });
  const route = data.routes[0];
  if (!route) return { distanceMeters: 0, durationSeconds: 0, geometry: null, legs: [] };

  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    legs: route.legs.map((leg: { distance?: number; duration?: number }) => ({
      distanceMeters: leg.distance ?? 0,
      durationSeconds: leg.duration ?? 0,
    })),
  };
};
