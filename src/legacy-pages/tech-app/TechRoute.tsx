/**
 * TechRoute — Mapbox-powered route planner for technicians
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Navigation,
  MapPin,
  Clock,
  RefreshCw,
  AlertTriangle,
  Route,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from "@/lib/mapbox";
import { getDrivingRoute } from "@/application/queries/mapbox";
import { fetchTechRouteStopsForCurrentUserToday } from "@/application/queries/tech-app.query";
import { useTechContext } from "./TechAppLayout";

interface RouteStop {
  id: string;
  source: "appointment" | "fleet_work_order";
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number;
  dispatch_status: string;
  status: string;
  job_priority: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  customers: { name: string } | null;
  service_catalog: { name: string } | null;
  is_fleet?: boolean;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
}

const getEffectiveStatus = (stop: Pick<RouteStop, "status" | "dispatch_status">) =>
  stop.status === "completed" ? "completed" : stop.dispatch_status;

export default function TechRoute() {
  const navigate = useNavigate();
  const { identity } = useTechContext();
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [routeMeters, setRouteMeters] = useState(0);
  const [routeSeconds, setRouteSeconds] = useState(0);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const mappableStops = useMemo(
    () => stops.filter((s) => s.location_lat != null && s.location_lng != null),
    [stops]
  );

  const fetchData = useCallback(async () => {
    if (!identity) return;
    const data = await fetchTechRouteStopsForCurrentUserToday(identity);
    setStops((data || []) as unknown as RouteStop[]);
    setLoading(false);
  }, [identity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Route refreshed");
  };

  const nextNavigableStop = useMemo(
    () => mappableStops.find((stop) => !["completed", "cancelled"].includes(getEffectiveStatus(stop))),
    [mappableStops]
  );

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    try {
      mapboxgl.accessToken = requireMapboxToken();
    } catch {
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: mapNodeRef.current,
      style: MAPBOX_DEFAULT_STYLE,
      center: [-95.7129, 37.0902],
      zoom: 3,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      mapRef.current?.once("load", () => {
        setStops((prev) => [...prev]);
      });
      return;
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const sourceId = "tech-route-source";
    const layerId = "tech-route-line";

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (!mappableStops.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    mappableStops.forEach((stop, idx) => {
      const lng = stop.location_lng as number;
      const lat = stop.location_lat as number;
      bounds.extend([lng, lat]);

      const el = document.createElement("div");
      el.className = "h-8 w-8 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center border-2 border-white shadow";
      el.textContent = String(idx + 1);

      const stopPopup = document.createElement("div");
      const customerName = document.createElement("strong");
      customerName.textContent = stop.customers?.name || "Customer";
      const serviceName = document.createElement("span");
      serviceName.style.display = "block";
      serviceName.textContent = stop.service_catalog?.name || "Service";
      stopPopup.append(customerName, serviceName);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setDOMContent(stopPopup))
        .addTo(map);
      markersRef.current.push(marker);
    });

    map.fitBounds(bounds, { padding: 48, maxZoom: 13 });

    const drawRoute = async () => {
      if (mappableStops.length < 2) {
        setRouteMeters(0);
        setRouteSeconds(0);
        return;
      }

      try {
        const routeResults = await Promise.all(
          mappableStops.slice(0, -1).map((current, idx) => {
            const next = mappableStops[idx + 1];
            return getDrivingRoute({
              origin: { lat: current.location_lat as number, lng: current.location_lng as number },
              destination: { lat: next.location_lat as number, lng: next.location_lng as number },
            });
          })
        );

        const coords: number[][] = [];
        let meters = 0;
        let seconds = 0;

        routeResults.forEach((result, idx) => {
          meters += result.distanceMeters;
          seconds += result.durationSeconds;
          const segment = result.geometry?.coordinates || [];
          if (segment.length === 0) return;
          if (idx === 0) coords.push(...segment);
          else coords.push(...segment.slice(1));
        });

        setRouteMeters(meters);
        setRouteSeconds(seconds);

        if (coords.length > 1) {
          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            },
          });
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#2563eb",
              "line-width": 4,
              "line-opacity": 0.85,
            },
          });
        }
      } catch (err) {
        console.warn("[TechRoute] Failed to build route geometry", err);
      }
    };

    drawRoute();
  }, [mappableStops]);

  const formatDuration = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-background z-10 p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Route</h1>
            <p className="text-sm text-muted-foreground">
              {stops.length} stop{stops.length !== 1 ? "s" : ""} • {Math.round(routeMeters / 1609.34)} mi • {formatDuration(routeSeconds)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
            </Button>
            {nextNavigableStop && (
              <Button onClick={() => navigate(`/tech-app/navigate/${nextNavigableStop.id}`)}>
                <Navigation className="h-4 w-4 mr-2" />
                Start guidance
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 pb-2">
        <div ref={mapNodeRef} className="h-56 rounded-xl border overflow-hidden bg-muted" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-3">
        {stops.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Route className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No route stops for today</p>
          </div>
        ) : (
          stops.map((stop, index) => {
            const effectiveStatus = getEffectiveStatus(stop);
            const isActive = ["en_route", "arrived", "in_progress"].includes(effectiveStatus);
            const isCompleted = effectiveStatus === "completed";

            return (
              <Card
                key={stop.id}
                className={cn(
                  "cursor-pointer transition-all",
                  isActive && "border-primary bg-primary/5",
                  isCompleted && "opacity-60",
                  stop.job_priority === "urgent" && "border-l-4 border-l-destructive"
                )}
                onClick={() => navigate(`/tech-app/jobs/${stop.id}`)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <span className="text-sm font-medium">
                          {formatTimeLabel(stop.scheduled_time, "h:mm a")}
                        </span>
                        <Badge variant={isCompleted ? "secondary" : isActive ? "default" : "outline"} className="text-[10px]">
                          {effectiveStatus.replace("_", " ")}
                        </Badge>
                        {stop.fleet_job_number && (
                          <Badge variant="secondary" className="text-[10px]">
                            {stop.fleet_job_number} · {stop.fleet_vehicle_count} veh
                          </Badge>
                        )}
                        {stop.job_priority === "urgent" && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertTriangle className="h-3 w-3 mr-1" />Urgent
                          </Badge>
                        )}
                      </div>

                      <p className="font-medium truncate">{stop.customers?.name || "Customer"}</p>
                      <p className="text-xs text-muted-foreground truncate">{stop.service_catalog?.name || "Service"}</p>

                      {stop.location_address && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{stop.location_address}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/tech-app/navigate/${stop.id}`);
                        }}
                      >
                        <Navigation className="h-3.5 w-3.5 mr-1" />
                        Guide
                      </Button>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />{stop.estimated_duration_minutes || 60}m
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
