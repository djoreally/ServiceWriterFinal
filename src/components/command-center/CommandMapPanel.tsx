/**
 * CommandMapPanel — Mapbox GL map for the Command Center.
 *
 * Shows technician GPS pins (colored by status), job pins (colored by assignment),
 * and driving route lines between en-route techs and their assigned jobs.
 *
 * Performance:
 * - Re-uses module-level marker arrays to avoid DOM leaks on re-render.
 * - Route lines rendered as GeoJSON sources/layers (GPU-accelerated).
 * - Marker updates are batched per render cycle.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { requireMapboxToken } from "@/lib/mapbox";
import { isValidLngLat } from "@/lib/coords";

import { MapPin, Navigation } from "lucide-react";

interface JobPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  status: string;
  assignedTechId: string | null;
}

interface TechPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
}

interface RouteLineData {
  techId: string;
  jobId: string;
  geometry: GeoJSON.LineString;
}

interface Props {
  jobs: JobPin[];
  techs: TechPin[];
  /** Optional route lines between techs and jobs (Phase 4) */
  routes?: RouteLineData[];
}

const STATUS_COLORS: Record<string, string> = {
  available: "#10b981",
  en_route: "#3b82f6",
  on_site: "#8b5cf6",
  on_break: "#f59e0b",
  offline: "#6b7280",
};

const ROUTE_SOURCE_ID = "command-routes";
const ROUTE_LAYER_ID = "command-route-lines";
const ROUTE_LAYER_GLOW_ID = "command-route-glow";

const CommandMapPanel = ({ jobs, techs, routes = [] }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Remove all existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let token: string;
    try {
      token = requireMapboxToken();
    } catch {
      void Promise.resolve().then(() => setError("Mapbox token not configured."));
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.58, 39.83],
      zoom: 4,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Pre-create the route source + layers so we can update data without re-adding
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Glow layer (wider, semi-transparent) for depth effect
      map.addLayer({
        id: ROUTE_LAYER_GLOW_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        paint: {
          "line-color": "#3b82f6",
          "line-width": 6,
          "line-opacity": 0.25,
          "line-blur": 3,
        },
      });

      // Main route line
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        paint: {
          "line-color": "#3b82f6",
          "line-width": 3,
          "line-opacity": 0.85,
          "line-dasharray": [2, 1],
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      clearMarkers();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [clearMarkers]);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    // Tech markers — circular pins colored by status
    techs.forEach((tech) => {
      if (!isValidLngLat(tech.lng, tech.lat)) return;
      const color = STATUS_COLORS[tech.status] || STATUS_COLORS.offline;
      const el = document.createElement("div");
      el.className = "command-tech-marker";
      el.style.cssText = `
        width: 30px; height: 30px; border-radius: 50%;
        background: ${color}; border: 2.5px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: transform 0.15s;
      `;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
      el.onmouseenter = () => { el.style.transform = "scale(1.2)"; };
      el.onmouseleave = () => { el.style.transform = "scale(1)"; };

      const techPopup = document.createElement("div");
      techPopup.style.padding = "4px";
      const techName = document.createElement("strong");
      techName.textContent = tech.name;
      const techStatus = document.createElement("span");
      techStatus.style.cssText = `display:block;font-size:11px;color:${color}`;
      techStatus.textContent = tech.status.replace("_", " ");
      techPopup.append(techName, techStatus);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([Number(tech.lng), Number(tech.lat)])
        .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setDOMContent(techPopup))
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
      bounds.extend([Number(tech.lng), Number(tech.lat)]);
      hasPoints = true;
    });

    // Job markers — smaller pins, red if unassigned, blue if assigned
    jobs.forEach((job) => {
      if (!isValidLngLat(job.lng, job.lat)) return;
      const isAssigned = !!job.assignedTechId;
      const color = isAssigned ? "#3b82f6" : "#ef4444";
      const el = document.createElement("div");
      el.className = "command-job-marker";
      el.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%;
        background: ${color}; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer; transition: transform 0.15s;
      `;
      el.onmouseenter = () => { el.style.transform = "scale(1.3)"; };
      el.onmouseleave = () => { el.style.transform = "scale(1)"; };

      const jobPopup = document.createElement("div");
      jobPopup.style.padding = "4px";
      const jobTitle = document.createElement("strong");
      jobTitle.textContent = job.title;
      const jobState = document.createElement("span");
      jobState.style.cssText = `display:block;font-size:11px;color:${color}`;
      jobState.textContent = isAssigned ? "Assigned" : "Unassigned";
      jobPopup.append(jobTitle, jobState);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([Number(job.lng), Number(job.lat)])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setDOMContent(jobPopup))
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
      bounds.extend([Number(job.lng), Number(job.lat)]);
      hasPoints = true;
    });

    // Fit bounds if we have data
    if (hasPoints && mapRef.current && !bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 800 });
    }
  }, [jobs, techs, clearMarkers, mapReady]);


  // Keep map canvas sized correctly inside resizable layout panels.
  // Without this, Mapbox can render a gray/blank canvas after panel resizes.
  useEffect(() => {
    if (!mapRef.current || !containerRef.current || !mapReady) return;

    const resizeMap = () => mapRef.current?.resize();

    // Ensure a post-load resize after layout settles
    const timer = setTimeout(resizeMap, 120);

    const observer = new ResizeObserver(() => {
      resizeMap();
    });
    observer.observe(containerRef.current);
    window.addEventListener("resize", resizeMap);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", resizeMap);
    };
  }, [mapReady]);

  // Update route lines when routes change (Phase 4)
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const source = mapRef.current.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = routes.map((r) => ({
      type: "Feature" as const,
      properties: { techId: r.techId, jobId: r.jobId },
      geometry: r.geometry,
    }));

    // Batch update — single GPU repaint for all routes
    source.setData({ type: "FeatureCollection", features });
  }, [routes, mapReady]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
        <MapPin className="h-8 w-8 opacity-40" />
        <p className="text-sm text-center max-w-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Floating legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur-sm rounded-md border border-border px-3 py-2 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Status</p>
        <div className="space-y-0.5">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-md" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-foreground capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
        {routes.length > 0 && (
          <>
            <div className="border-t border-border my-1" />
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-blue-500 rounded" />
              <span className="text-[10px] text-foreground">Active route</span>
            </div>
          </>
        )}
      </div>

      {/* Live indicator */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm rounded-md border border-border px-2.5 py-1.5 shadow-sm">
        <Navigation className="h-3 w-3 text-gray-500 animate-pulse" />
        <span className="text-[10px] font-medium text-muted-foreground">LIVE</span>
        <span className="text-[10px] text-muted-foreground">
          {techs.length} techs · {jobs.length} jobs
          {routes.length > 0 && ` · ${routes.length} routes`}
        </span>
      </div>
    </div>
  );
};

export default CommandMapPanel;
