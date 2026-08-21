/**
 * TerritoryMap - Visualizes van territory zip codes on a Mapbox map.
 * Geocodes each zip code and displays markers + a convex hull polygon.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { requireMapboxToken } from "@/lib/mapbox";
import { Skeleton } from "@/components/ui/skeleton";

interface TerritoryMapProps {
  zipCodes: { id: string; zip_code: string; is_primary: boolean }[];
}

interface ZipPoint {
  zip: string;
  lng: number;
  lat: number;
  isPrimary: boolean;
}

// Compute convex hull using Graham scan for the coverage polygon
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export const TerritoryMap = ({ zipCodes }: TerritoryMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocodedPoints, setGeocodedPoints] = useState<ZipPoint[]>([]);

  // Geocode all zip codes
  const geocodeZips = useCallback(async () => {
    if (zipCodes.length === 0) {
      setLoading(false);
      return;
    }

    let token: string;
    try {
      token = requireMapboxToken();
    } catch (err) {
      console.error(err);
      setLoading(false);
      return;
    }

    const points: ZipPoint[] = [];

    // Batch geocode with small delay to avoid rate limits
    for (const z of zipCodes) {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(z.zip_code)}.json?access_token=${token}&country=US&types=postcode&limit=1`
        );
        const data = await res.json();
        if (data.features?.length > 0) {
          const [lng, lat] = data.features[0].center;
          points.push({ zip: z.zip_code, lng, lat, isPrimary: z.is_primary });
        }
      } catch {
        // Skip failed geocodes
      }
    }

    setGeocodedPoints(points);
    setLoading(false);
  }, [zipCodes]);

  useEffect(() => {
    geocodeZips();
  }, [geocodeZips]);

  // Initialize map once geocoding is done
  useEffect(() => {
    if (loading || !mapContainer.current || geocodedPoints.length === 0) return;

    // Clean up previous map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    let token: string;
    try {
      token = requireMapboxToken();
    } catch (err) {
      console.error(err);
      return;
    }
    mapboxgl.accessToken = token;

    // Calculate bounds
    const bounds = new mapboxgl.LngLatBounds();
    geocodedPoints.forEach((p) => bounds.extend([p.lng, p.lat]));

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds,
      fitBoundsOptions: { padding: 50, maxZoom: 12 },
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      if (!map.current) return;

      // Add markers for each zip code
      geocodedPoints.forEach((p) => {
        const el = document.createElement("div");
        el.className = "flex items-center justify-center";
        el.style.width = "28px";
        el.style.height = "28px";
        el.style.borderRadius = "50%";
        el.style.backgroundColor = p.isPrimary ? "#3b82f6" : "#6b7280";
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
        el.style.color = "white";
        el.style.fontSize = "9px";
        el.style.fontWeight = "bold";

        new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 15 }).setHTML(
              `<strong>${p.zip}</strong>${p.isPrimary ? '<br/><span style="color:#3b82f6;font-size:11px">Primary</span>' : ""}`
            )
          )
          .addTo(map.current!);
      });

      // Draw coverage polygon if 3+ points
      if (geocodedPoints.length >= 3) {
        const coords: [number, number][] = geocodedPoints.map((p) => [p.lng, p.lat]);
        const hull = convexHull(coords);
        hull.push(hull[0]); // close polygon

        map.current.addSource("territory-hull", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [hull] },
          },
        });

        map.current.addLayer({
          id: "territory-fill",
          type: "fill",
          source: "territory-hull",
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.12 },
        });

        map.current.addLayer({
          id: "territory-outline",
          type: "line",
          source: "territory-hull",
          paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [2, 2] },
        });
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [loading, geocodedPoints]);

  if (zipCodes.length === 0) {
    return (
      <div className="h-64 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-sm">
        Add zip codes to see territory coverage on the map
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (geocodedPoints.length === 0) {
    return (
      <div className="h-64 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-sm">
        Could not geocode any zip codes
      </div>
    );
  }

  return (
    <div className="relative w-full h-72 rounded-lg overflow-hidden border border-border">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-medium shadow-sm">
        {geocodedPoints.length} zip code{geocodedPoints.length !== 1 ? "s" : ""} mapped
      </div>
    </div>
  );
};
