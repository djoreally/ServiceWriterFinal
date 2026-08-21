/**
 * WeatherMap — Live Mapbox map for the Weather Guard page.
 *
 * Shows the shop coordinates + a heat overlay representing the worst
 * forecasted risk over the next 48h, plus job pins colored by risk.
 *
 * Risk score is computed using the same formula as the edge function:
 *   risk = round(precip_probability * 0.6 + min(precip_mm * 10, 40) * 0.4)
 */

import { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { requireMapboxToken } from "@/lib/mapbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudRain, MapPin } from "lucide-react";
import type { AtRiskAppointment } from "@/application/queries/weather-guard.query";

interface Props {
  lat: number | null;
  lng: number | null;
  address: string | null;
  jobs: AtRiskAppointment[];
}

interface HourlyRisk {
  time: string;
  riskScore: number;
  prob: number;
  mm: number;
}

const RISK_FILL = (score: number): string => {
  if (score >= 80) return "hsl(0 84% 50%)";       // destructive
  if (score >= 60) return "hsl(25 95% 53%)";      // orange
  if (score >= 40) return "hsl(45 93% 47%)";      // yellow
  return "hsl(142 71% 40%)";                      // emerald
};

async function fetch48hRisk(lat: number, lng: number): Promise<HourlyRisk[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lng.toString());
  url.searchParams.set("hourly", "precipitation_probability,precipitation");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  const times: string[] = data?.hourly?.time ?? [];
  const probs: number[] = data?.hourly?.precipitation_probability ?? [];
  const mms: number[] = data?.hourly?.precipitation ?? [];

  const now = Date.now();
  const horizon = now + 48 * 3_600_000;

  return times
    .map((t, i) => {
      const prob = probs[i] ?? 0;
      const mm = mms[i] ?? 0;
      const score = Math.round(prob * 0.6 + Math.min(mm * 10, 40) * 0.4);
      return { time: t, riskScore: score, prob, mm };
    })
    .filter((h) => {
      const ts = new Date(h.time).getTime();
      return ts >= now - 30 * 60 * 1000 && ts <= horizon;
    });
}

const RING_SOURCE = "weather-risk-ring";
const RING_LAYER = "weather-risk-ring-layer";

export function WeatherMap({ lat, lng, address, jobs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const shopMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hourly, setHourly] = useState<HourlyRisk[]>([]);
  const [loadingForecast, setLoadingForecast] = useState(false);

  // Fetch the 48h risk profile for the shop location
  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    setLoadingForecast(true);
    fetch48hRisk(lat, lng)
      .then((data) => {
        if (!cancelled) setHourly(data);
      })
      .catch((e) => console.error("[WeatherMap] forecast error", e))
      .finally(() => {
        if (!cancelled) setLoadingForecast(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const worstRisk = useMemo(
    () => hourly.reduce((acc, h) => (h.riskScore > acc ? h.riskScore : acc), 0),
    [hourly],
  );

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (lat == null || lng == null) return;

    let token: string;
    try {
      token = requireMapboxToken();
    } catch {
      setError("Mapbox token not configured.");
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [lng, lat],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(RING_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: RING_LAYER,
        type: "circle",
        source: RING_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 25, 9, 60, 12, 120],
          "circle-color": ["get", "color"],
          "circle-opacity": ["get", "opacity"],
          "circle-blur": 0.6,
        },
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      shopMarkerRef.current?.remove();
      shopMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [lat, lng]);

  // Shop marker + risk ring at shop location
  useEffect(() => {
    if (!mapRef.current || !mapReady || lat == null || lng == null) return;

    shopMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.style.cssText = `
      width: 30px; height: 30px; border-radius: 50%;
      background: hsl(217 91% 60%); border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center; color: white;
      font-weight: 700; font-size: 14px;
    `;
    el.textContent = "🏪";
    shopMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
          `<div style="padding:4px"><strong>Shop</strong>${address ? `<br/><span style="font-size:11px;color:#666">${address}</span>` : ""}<br/><span style="font-size:11px">Worst 48h risk: <b>${worstRisk}</b></span></div>`,
        ),
      )
      .addTo(mapRef.current);

    // Update heat ring around the shop reflecting worst risk
    const source = mapRef.current.getSource(RING_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      const features: GeoJSON.Feature[] = worstRisk > 0
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: {
                color: RISK_FILL(worstRisk),
                opacity: Math.min(0.15 + (worstRisk / 100) * 0.45, 0.6),
              },
            },
          ]
        : [];
      source.setData({ type: "FeatureCollection", features });
    }
  }, [mapReady, lat, lng, address, worstRisk]);

  // Job markers colored by risk
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    jobs.forEach((j) => {
      // Need coords; appointments table doesn't expose lat/lng on AtRiskAppointment.
      // We fall back to a tiny offset around shop so users see them clustered.
      // (Real per-job geocoding can be added later.)
      if (lat == null || lng == null) return;
      const offsetLat = lat + (Math.random() - 0.5) * 0.02;
      const offsetLng = lng + (Math.random() - 0.5) * 0.02;
      const score = j.weather_risk_score ?? 0;
      const color = RISK_FILL(score);

      const el = document.createElement("div");
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 50%;
        background: ${color}; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
      `;

      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([offsetLng, offsetLat])
        .setPopup(
          new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
            `<div style="padding:4px;min-width:140px">
              <strong>${j.guest_name ?? j.title}</strong>
              <div style="font-size:11px;color:#666">${j.scheduled_date} · ${j.scheduled_time}</div>
              <div style="font-size:11px;margin-top:4px">Risk: <b>${score}</b> · ${j.weather_decision ?? "—"}</div>
            </div>`,
          ),
        )
        .addTo(mapRef.current!);
      markersRef.current.push(m);
    });
  }, [jobs, mapReady, lat, lng]);

  // Resize handling for resizable layouts
  useEffect(() => {
    if (!mapRef.current || !containerRef.current || !mapReady) return;
    const resize = () => mapRef.current?.resize();
    const t = setTimeout(resize, 120);
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [mapReady]);

  if (lat == null || lng == null) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CloudRain className="h-4 w-4" /> Live Weather Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center text-sm text-muted-foreground gap-2 bg-muted/30 rounded-md border border-dashed">
            <MapPin className="h-6 w-6 opacity-50" />
            <p>Verify your business address in Settings to enable the live weather map.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <CloudRain className="h-4 w-4" /> Live Weather Map
        </CardTitle>
        <div className="flex items-center gap-2">
          {loadingForecast ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: RISK_FILL(worstRisk), color: RISK_FILL(worstRisk) }}
            >
              Worst 48h risk: {worstRisk}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-md">
            {error}
          </div>
        ) : (
          <div className="relative h-72 w-full overflow-hidden rounded-md border">
            <div ref={containerRef} className="absolute inset-0" />
            <div className="absolute bottom-2 left-2 z-10 bg-background/90 backdrop-blur-sm rounded-md border px-2.5 py-1.5 shadow-sm text-[10px]">
              <p className="uppercase tracking-wide font-semibold text-muted-foreground mb-1">Risk legend</p>
              <div className="flex items-center gap-2">
                {[
                  { lbl: "low", c: RISK_FILL(20) },
                  { lbl: "med", c: RISK_FILL(50) },
                  { lbl: "high", c: RISK_FILL(70) },
                  { lbl: "extreme", c: RISK_FILL(90) },
                ].map((x) => (
                  <span key={x.lbl} className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-md" style={{ background: x.c }} />
                    <span>{x.lbl}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 48h hourly strip */}
        {hourly.length > 0 && (
          <div className="mt-3 flex gap-0.5 h-6 rounded overflow-hidden border" title="Risk per hour over the next 48h">
            {hourly.map((h) => (
              <div
                key={h.time}
                className="flex-1 min-w-[3px]"
                style={{ background: RISK_FILL(h.riskScore), opacity: 0.35 + (h.riskScore / 100) * 0.65 }}
                title={`${h.time.replace("T", " ")} — risk ${h.riskScore} (prob ${Math.round(h.prob)}%, ${h.mm.toFixed(1)}mm)`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WeatherMap;
