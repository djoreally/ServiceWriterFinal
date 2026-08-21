/**
 * useTechJobEta — Live Mapbox driving ETA/distance from the technician's device
 * location to a job destination.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { geocodeAddress, getDrivingRoute } from "@/application/queries/mapbox";
import type { LineString } from "geojson";

interface Destination {
  lat: number | null;
  lng: number | null;
  address?: string | null;
}


export interface TechJobEta {
  origin: { lat: number; lng: number } | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  etaLabel: string | null;
  geometry: LineString | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 120_000;

export function useTechJobEta(destination: Destination | null | undefined): TechJobEta {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [geometry, setGeometry] = useState<LineString | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const watchRef = useRef<number | null>(null);

  // Track device location
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Location unavailable on this device");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError("Location permission denied"),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Some assigned appointments only carry a street address. Geocode it once so the
  // map + ETA still resolve for the real current job.
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(null);
  const address = destination?.address?.trim() || null;
  const rawLat = destination?.lat ?? null;
  const rawLng = destination?.lng ?? null;

  useEffect(() => {
    if (rawLat != null && rawLng != null) {
      setResolved(null);
      return;
    }
    if (!address) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    geocodeAddress(address)
      .then((match) => {
        if (cancelled) return;
        setResolved(match ? { lat: match.lat, lng: match.lng } : null);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, rawLat, rawLng]);

  const destLat = rawLat ?? resolved?.lat ?? null;
  const destLng = rawLng ?? resolved?.lng ?? null;


  useEffect(() => {
    if (!origin || destLat == null || destLng == null) {
      setDistanceMiles(null);
      setDurationMinutes(null);
      setGeometry(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getDrivingRoute({ origin, destination: { lat: destLat, lng: destLng } })
      .then((route) => {
        if (cancelled) return;
        setDistanceMiles(route.distanceMeters / 1609.344);
        setDurationMinutes(route.durationSeconds / 60);
        setGeometry(route.geometry);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Route unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lng, destLat, destLng, tick]);

  // Periodic traffic-aware refresh
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const etaLabel =
    durationMinutes == null
      ? null
      : new Date(Date.now() + durationMinutes * 60_000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

  return { origin, distanceMiles, durationMinutes, etaLabel, geometry, loading, error, refresh };
}
