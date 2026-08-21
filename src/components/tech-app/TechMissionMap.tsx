/**
 * TechMissionMap — Mapbox map for the technician landing screen.
 *
 * Renders today's stops, the technician's live position, and the driving route
 * to the active job. Purely presentational: all data comes in via props.
 */

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Maximize2, LocateFixed } from "lucide-react";
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from "@/lib/mapbox";
import type { LineString } from "geojson";

export interface MapStop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  active?: boolean;
}

interface TechMissionMapProps {
  stops: MapStop[];
  origin: { lat: number; lng: number } | null;
  routeGeometry: LineString | null;
  onExpand?: () => void;
  accent?: string;
}

export function TechMissionMap({ stops, origin, routeGeometry, onExpand, accent = "#1439cc" }: TechMissionMapProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const readyRef = useRef(false);

  // Initialize once
  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    try {
      mapboxgl.accessToken = requireMapboxToken();
    } catch (err) {
      console.error(err);
      return;
    }

    const map = new mapboxgl.Map({
      container: nodeRef.current,
      style: MAPBOX_DEFAULT_STYLE,
      center: [origin?.lng ?? stops[0]?.lng ?? -98.5, origin?.lat ?? stops[0]?.lat ?? 39.8],
      zoom: origin || stops.length ? 11 : 3.5,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => {
      readyRef.current = true;
      map.addSource("tech-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tech-route-line",
        type: "line",
        source: "tech-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent, "line-width": 5, "line-opacity": 0.85 },
      });
    });
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stops.forEach((stop) => {
      const el = document.createElement("div");
      el.className = "flex flex-col items-center";
      el.innerHTML = `
        <span style="background:${stop.active ? accent : "#ffffff"};color:${stop.active ? "#ffffff" : "#111111"};border:2px solid ${accent};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">${stop.label}</span>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (origin) {
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:9999px;background:${accent};border:3px solid #fff;box-shadow:0 0 0 4px ${accent}33`;
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([origin.lng, origin.lat]).addTo(map));
    }
  }, [stops, origin, accent]);

  // Route line + fit
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("tech-route") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(
        routeGeometry
          ? { type: "Feature", properties: {}, geometry: routeGeometry }
          : { type: "FeatureCollection", features: [] },
      );
      fitBounds();
    };

    const fitBounds = () => {
      const points: Array<[number, number]> = [];
      if (origin) points.push([origin.lng, origin.lat]);
      stops.forEach((s) => points.push([s.lng, s.lat]));
      if (routeGeometry) routeGeometry.coordinates.forEach((c) => points.push([c[0], c[1]] as [number, number]));
      if (!points.length) return;
      if (points.length === 1) {
        map.easeTo({ center: points[0], zoom: 13 });
        return;
      }
      const bounds = points.reduce((b, p) => b.extend(p), new mapboxgl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 600 });
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routeGeometry, stops, origin]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (origin) map.easeTo({ center: [origin.lng, origin.lat], zoom: 13 });
    else if (stops[0]) map.easeTo({ center: [stops[0].lng, stops[0].lat], zoom: 13 });
  };

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-black/10 bg-[#e9e9ec] md:h-72">
      <div ref={nodeRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={recenter}
        aria-label="Recenter map"
        className="absolute right-3 top-3 flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-bold uppercase tracking-[0.08em] shadow-md"
        style={{ color: accent }}
      >
        <LocateFixed className="h-4 w-4" /> Recenter
      </button>
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Open full route"
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-md"
          style={{ color: accent }}
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
