/**
 * FleetCommandMap — Multi-van territory overlay map.
 * Renders each van's territory as a colored convex-hull polygon,
 * van / technician GPS markers, and today's job pins.
 *
 * Performance: zip geocoding is cached per session in a module-level Map
 * so re-renders never re-geocode the same zip code.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { requireMapboxToken } from "@/lib/mapbox";
import { isValidLngLat, normalizeLatLng } from "@/lib/coords";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, MapPin, Truck, Users, Navigation } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VanMapData {
  id: string;
  name: string;
  status: string;
  color: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  zipCodes: { zip_code: string; is_primary: boolean }[];
  technician: { id: string; name: string; status: string; current_location?: { lat: number; lng: number } | null } | null;
  currentLocation?: { lat: number; lng: number } | null;
  todayJobCount: number;
}

export interface JobPinData {
  id: string;
  title: string;
  lat: number;
  lng: number;
  assignedVanId: string | null;
  status: string;
  customerName: string | null;
  scheduledTime: string;
}

interface Props {
  vans: VanMapData[];
  jobs?: JobPinData[];
  height?: string;
}

// ─── Geocode cache (module-level, survives re-renders) ───────────────────────
const geocodeCache = new Map<string, [number, number]>();

async function geocodeZip(zip: string, token: string): Promise<[number, number] | null> {
  if (geocodeCache.has(zip)) return geocodeCache.get(zip)!;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zip)}.json?access_token=${token}&country=US&types=postcode&limit=1`
    );
    const data = await res.json();
    if (data.features?.length > 0) {
      const coords: [number, number] = [data.features[0].center[0], data.features[0].center[1]];
      geocodeCache.set(zip, coords);
      return coords;
    }
  } catch { /* skip */ }
  return null;
}

// Convex hull using Graham scan
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Per-van color palette
const VAN_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

// ─── Component ───────────────────────────────────────────────────────────────

export const FleetCommandMap = ({ vans, jobs = [], height = "h-[600px]" }: Props) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layer visibility toggles
  const [showTerritories, setShowTerritories] = useState(true);
  const [showVanLocations, setShowVanLocations] = useState(true);
  const [showTechLocations, setShowTechLocations] = useState(true);
  const [showJobs, setShowJobs] = useState(true);

  const [selectedEntity, setSelectedEntity] = useState<{ type: "van" | "tech" | "job"; id: string } | null>(null);

  // Build the map
  const buildMap = useCallback(async () => {
    if (!mapContainer.current) return;
    setLoading(true);
    setError(null);

    let token: string;
    try { token = requireMapboxToken(); } catch (e: any) {
      setError("Mapbox token not configured. Set VITE_MAPBOX_PUBLIC_TOKEN to enable the command map.");
      setLoading(false);
      return;
    }

    // Gather all zip codes across all vans
    const allZips = [...new Set(vans.flatMap(v => v.zipCodes.map(z => z.zip_code)))];

    // Batch geocode
    await Promise.all(allZips.map(zip => geocodeZip(zip, token)));

    // Clean up existing map
    if (map.current) { map.current.remove(); map.current = null; }
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Compute bounds (only from renderable coordinates)
    const allCoords: [number, number][] = [];
    vans.forEach(van => {
      van.zipCodes.forEach(z => {
        const c = geocodeCache.get(z.zip_code);
        if (c && isValidLngLat(c[0], c[1])) allCoords.push(c);
      });
      const vanLoc = normalizeLatLng(van.currentLocation);
      if (vanLoc) allCoords.push([vanLoc.lng, vanLoc.lat]);
      const techLoc = normalizeLatLng(van.technician?.current_location);
      if (techLoc) allCoords.push([techLoc.lng, techLoc.lat]);
    });
    jobs.forEach(j => { if (isValidLngLat(j.lng, j.lat)) allCoords.push([Number(j.lng), Number(j.lat)]); });


    mapboxgl.accessToken = token;

    if (allCoords.length === 0) {
      // No data yet — just render centered map
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-98.5795, 39.8283],
        zoom: 4,
      });
      setLoading(false);
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    allCoords.forEach(c => bounds.extend(c));

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds,
      fitBoundsOptions: { padding: 60, maxZoom: 11 },
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      if (!map.current) return;

      // ── Territory polygons per van ──
      vans.forEach((van, idx) => {
        const color = VAN_COLORS[idx % VAN_COLORS.length];
        const coords: [number, number][] = van.zipCodes
          .map(z => geocodeCache.get(z.zip_code))
          .filter(Boolean) as [number, number][];

        if (coords.length >= 3) {
          const hull = convexHull(coords);
          hull.push(hull[0]); // close polygon

          const sourceId = `territory-${van.id}`;
          map.current!.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: { vanName: van.name },
              geometry: { type: "Polygon", coordinates: [hull] },
            },
          });

          if (showTerritories) {
            map.current!.addLayer({
              id: `fill-${van.id}`,
              type: "fill",
              source: sourceId,
              paint: { "fill-color": color, "fill-opacity": 0.12 },
            });
            map.current!.addLayer({
              id: `outline-${van.id}`,
              type: "line",
              source: sourceId,
              paint: { "line-color": color, "line-width": 2, "line-dasharray": [3, 2] },
            });
          }
        }

        // ── Van GPS marker ──
        const vanMarkerLoc = normalizeLatLng(van.currentLocation);
        if (showVanLocations && vanMarkerLoc) {
          const el = document.createElement("div");
          el.style.cssText = `width:32px;height:32px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;`;
          el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M1 3h15l2 5h5v8h-3a3 3 0 0 1-6 0H8a3 3 0 0 1-6 0H1V3z"/></svg>`;

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([vanMarkerLoc.lng, vanMarkerLoc.lat])
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(
              `<div style="padding:4px"><strong>${van.name}</strong><br/><span style="color:${color};font-size:11px">${van.status}</span><br/><span style="font-size:11px;color:#666">${van.technician?.name || "No technician"}</span></div>`
            ))
            .addTo(map.current!);
          markersRef.current.push(marker);
        }

        // ── Technician GPS marker ──
        const loc = normalizeLatLng(van.technician?.current_location);
        if (showTechLocations && van.technician && loc) {
          const el = document.createElement("div");
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:pointer;`;
          el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(
              `<div style="padding:4px"><strong>${van.technician.name}</strong><br/><span style="font-size:11px;color:#666">Status: ${van.technician.status}</span><br/><span style="font-size:11px;color:#666">Van: ${van.name}</span></div>`
            ))
            .addTo(map.current!);
          markersRef.current.push(marker);
        }
      });

      // ── Job pins ──
      if (showJobs) {
        jobs.forEach(job => {
          if (!isValidLngLat(job.lng, job.lat)) return;
          const vanIdx = vans.findIndex(v => v.id === job.assignedVanId);
          const color = job.assignedVanId && vanIdx >= 0 ? VAN_COLORS[vanIdx % VAN_COLORS.length] : "#ef4444";
          const el = document.createElement("div");
          el.style.cssText = `width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:1.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;`;
          el.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/></svg>`;
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([job.lng, job.lat])
            .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(
              `<div style="padding:4px"><strong>${job.title}</strong><br/><span style="font-size:11px;color:#666">${job.customerName || ""}</span><br/><span style="font-size:11px;color:#666">${job.scheduledTime}</span><br/><span style="font-size:11px;color:${color}">${job.assignedVanId ? "Assigned" : "⚠ Unassigned"}</span></div>`
            ))
            .addTo(map.current!);
          markersRef.current.push(marker);
        });
      }
    });

    setLoading(false);
  }, [vans, jobs, showTerritories, showVanLocations, showTechLocations, showJobs]);

  useEffect(() => {
    buildMap();
    return () => {
      map.current?.remove();
      map.current = null;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [buildMap]);

  if (error) {
    return (
      <div className={`${height} rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground`}>
        <MapPin className="h-8 w-8 opacity-40" />
        <p className="text-sm text-center max-w-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${height} rounded-lg overflow-hidden border border-border`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Navigation className="h-6 w-6 animate-pulse text-primary" />
            <p className="text-sm">Loading fleet map…</p>
          </div>
        </div>
      )}

      <div ref={mapContainer} className="absolute inset-0" />

      {/* Layer Toggle Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        {[
          { label: "Territories", icon: Layers, state: showTerritories, toggle: setShowTerritories },
          { label: "Van Locations", icon: Truck, state: showVanLocations, toggle: setShowVanLocations },
          { label: "Tech Locations", icon: Users, state: showTechLocations, toggle: setShowTechLocations },
          { label: "Active Jobs", icon: MapPin, state: showJobs, toggle: setShowJobs },
        ].map(({ label, icon: Icon, state, toggle }) => (
          <button
            key={label}
            onClick={() => toggle(!state)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm border transition-all ${
              state
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background/90 text-muted-foreground border-border backdrop-blur-sm"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur-sm rounded-md border border-border px-3 py-2 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Van Coverage</p>
        <div className="space-y-1">
          {vans.slice(0, 6).map((van, idx) => (
            <div key={van.id} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm border border-white/30"
                style={{ backgroundColor: VAN_COLORS[idx % VAN_COLORS.length] }}
              />
              <span className="text-[10px] text-foreground truncate max-w-[100px]">{van.name}</span>
              {van.todayJobCount > 0 && (
                <span className="text-[10px] text-muted-foreground">({van.todayJobCount} jobs)</span>
              )}
            </div>
          ))}
          {vans.length > 6 && (
            <p className="text-[10px] text-muted-foreground">+{vans.length - 6} more</p>
          )}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-3 right-12 z-10 flex gap-2">
        <div className="bg-background/90 backdrop-blur-sm rounded-md border border-border px-2.5 py-1.5 text-xs shadow-sm">
          <span className="font-semibold text-primary">{vans.length}</span>
          <span className="text-muted-foreground ml-1">vans</span>
        </div>
        <div className="bg-background/90 backdrop-blur-sm rounded-md border border-border px-2.5 py-1.5 text-xs shadow-sm">
          <span className="font-semibold text-primary">{jobs.filter(j => !j.assignedVanId).length}</span>
          <span className="text-muted-foreground ml-1">unassigned</span>
        </div>
      </div>
    </div>
  );
};

export { VAN_COLORS };
