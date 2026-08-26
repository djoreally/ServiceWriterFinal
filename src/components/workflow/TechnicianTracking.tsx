/**
 * TechnicianTracking - Real-time team location & status tracking
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  fetchTrackingTechnicians,
  fetchActiveDispatchJobs,
  fetchTechLocationHistory,
  subscribeToTrackingChanges,
} from "@/application/queries/technician-tracking.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Loader2,
  Signal,
  MapPinOff,
  User,
  Phone,
  Car,
  History,
  Target,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Coffee,
  SignalZero,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from "@/lib/mapbox";
import { getDrivingRoute, type RouteResult } from "@/application";
import type { Database, Json } from "@/integrations/supabase/types";

interface Technician {
  id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  status: "available" | "busy" | "on_job" | "on_break" | "offline";
  current_location: { lat: number; lng: number } | null;
  location_updated_at: string | null;
  current_job_id: string | null;
  skills: string[];
  vehicle_info: { make?: string; model?: string; plate?: string } | null;
}

interface Job {
  id: string;
  customer_name: string;
  vehicle_info: string;
  service_type: string;
  location: { lat: number; lng: number; address?: string } | null;
  dispatch_status: string;
  scheduled_time: string;
  assigned_technician_id: string | null;
}

interface LocationHistory {
  id: string;
  lat: number;
  lng: number;
  recorded_at: string;
  speed: number | null;
  heading: number | null;
}

type TechnicianRow = Database["public"]["Tables"]["technicians"]["Row"];
type LocationHistoryRow = Database["public"]["Tables"]["location_history"]["Row"];
type TrackingTechnicianRow = TechnicianRow & {
  current_job_id?: string | null;
  vehicle_info?: Technician["vehicle_info"];
};
type DispatchJobRow = {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  dispatch_status: string | null;
  assigned_technician_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  customer: { name: string | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null } | null;
  service_catalog: { name: string | null } | null;
};
type JsonObject = { [key: string]: Json | undefined };

function isJsonObject(value: Json | null): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLocation(value: Json | null): Technician["current_location"] {
  if (!isJsonObject(value)) return null;

  const lat = value.lat;
  const lng = value.lng;

  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

function normalizeStatus(status: string): Technician["status"] {
  switch (status) {
    case "available":
    case "busy":
    case "on_job":
    case "on_break":
    case "offline":
      return status;
    default:
      return "offline";
  }
}

function toTechnician(row: TrackingTechnicianRow): Technician {
  return {
    id: row.id,
    user_id: row.user_id,
    display_name: row.display_name ?? row.name,
    phone: row.phone,
    email: row.email,
    avatar_url: row.avatar_url,
    status: normalizeStatus(row.status),
    current_location: parseLocation(row.current_location),
    location_updated_at: row.last_location_update,
    current_job_id: row.current_job_id ?? null,
    skills: row.skills ?? [],
    vehicle_info: row.vehicle_info ?? null,
  };
}

const STATUS_CONFIG: Record<Technician["status"], { label: string; color: string }> = {
  available: { label: "Available", color: "bg-gray-500" },
  busy: { label: "Busy", color: "bg-yellow-500" },
  on_job: { label: "On Job", color: "bg-blue-500" },
  on_break: { label: "On Break", color: "bg-orange-500" },
  offline: { label: "Offline", color: "bg-gray-400" },
};

const STATUS_COLORS: Record<Technician["status"], string> = {
  available: "#666666",
  busy: "#eab308",
  on_job: "#3b82f6",
  on_break: "#f97316",
  offline: "#9ca3af",
};

const ROUTE_SOURCE_ID = "technician-route";
const ROUTE_LAYER_ID = "technician-route-line";

export function TechnicianTracking() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationHistory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mapCenter, setMapCenter] = useState({ lat: 39.8283, lng: -98.5795 });
  const [mapReady, setMapReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLabel, setRouteLabel] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const techMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const jobMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: techData, error: techError } = await fetchTrackingTechnicians();

      if (techError) throw techError;
      const technicians = ((techData ?? []) as TrackingTechnicianRow[]).map(toTechnician);
      setTechnicians(technicians);

      const withLocations = technicians.filter((tech) => tech.current_location);
      if (withLocations.length > 0) {
        const avgLat = withLocations.reduce((sum, tech) => sum + (tech.current_location?.lat ?? 0), 0) / withLocations.length;
        const avgLng = withLocations.reduce((sum, tech) => sum + (tech.current_location?.lng ?? 0), 0) / withLocations.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }

      const { data: jobData } = await fetchActiveDispatchJobs();

      if (jobData) {
        setJobs(((jobData as DispatchJobRow[]) ?? []).map((job) => ({
          id: job.id,
          customer_name: job.customer?.name || "Unknown",
          vehicle_info: job.vehicles
            ? `${job.vehicles.year ?? ""} ${job.vehicles.make ?? ""} ${job.vehicles.model ?? ""}`.trim()
            : "Unknown",
          service_type: job.service_catalog?.name || "Service",
          location: job.location_lat != null && job.location_lng != null ? {
            lat: job.location_lat,
            lng: job.location_lng,
            address: job.location_address || undefined,
          } : null,
          dispatch_status: job.dispatch_status || "assigned",
          scheduled_time: job.scheduled_time,
          assigned_technician_id: job.assigned_technician_id || null,
        })) as Job[]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      if (!silent) toast.error("Failed to load tracking data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const { unsubscribe } = subscribeToTrackingChanges(
      () => fetchData(true),
      () => { if (selectedTech) fetchLocationHistoryData(selectedTech.id); }
    );

    return () => { unsubscribe(); };
  }, [fetchData, selectedTech]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    try {
      mapboxgl.accessToken = requireMapboxToken();
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_DEFAULT_STYLE,
        center: [mapCenter.lng, mapCenter.lat],
        zoom: 3,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current.on("load", () => setMapReady(true));
    } catch (err) {
      console.error("Failed to initialize map", err);
      toast.error("Map failed to load. Check Mapbox token.");
    }
  }, [mapCenter]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.flyTo({ center: [mapCenter.lng, mapCenter.lat], zoom: 8, duration: 600 });
  }, [mapCenter, mapReady]);

  const fetchLocationHistoryData = async (technicianId: string) => {
    const { data } = await fetchTechLocationHistory(technicianId);

    if (data) {
      setLocationHistory((data as LocationHistoryRow[]).map((location) => ({
        id: location.id,
        lat: location.latitude,
        lng: location.longitude,
        recorded_at: location.recorded_at,
        speed: location.speed,
        heading: location.heading,
      })));
    }
  };

  const filteredTechnicians = useMemo(() => {
    return technicians.filter((tech) => {
      const matchesSearch = tech.display_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || tech.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [technicians, searchQuery, statusFilter]);

  const getStatusBadge = (status: Technician["status"]) => {
    const config = STATUS_CONFIG[status];
    return (
      <Badge variant="outline" className={cn("gap-1", `bg-${status === "available" ? "green" : status === "on_job" ? "blue" : status === "on_break" ? "orange" : "gray"}-50`)}>
        <span className={cn("w-2 h-2 rounded-md", config.color)} />
        {config.label}
      </Badge>
    );
  };

  const getLocationAge = (updatedAt: string | null) => {
    if (!updatedAt) return "Never updated";
    return formatDistanceToNow(parseISO(updatedAt), { addSuffix: true });
  };

  const removeRouteLayer = useCallback(() => {
    if (!mapRef.current) return;
    if (mapRef.current.getLayer(ROUTE_LAYER_ID)) mapRef.current.removeLayer(ROUTE_LAYER_ID);
    if (mapRef.current.getSource(ROUTE_SOURCE_ID)) mapRef.current.removeSource(ROUTE_SOURCE_ID);
  }, []);

  const drawRoute = useCallback((geometry: RouteResult["geometry"]) => {
    if (!mapRef.current || !geometry) return;
    removeRouteLayer();

    mapRef.current.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: { type: "Feature", geometry, properties: {} } as GeoJSON.Feature });
    mapRef.current.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.8 },
    });
  }, [removeRouteLayer]);

  const updateTechMarkers = useCallback(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const nextIds = new Set(technicians.map((t) => t.id));

    Object.entries(techMarkersRef.current).forEach(([id, marker]) => {
      if (!nextIds.has(id)) {
        marker.remove();
        delete techMarkersRef.current[id];
      }
    });

    technicians.forEach((tech) => {
      if (!tech.current_location) return;
      const baseColor = STATUS_COLORS[tech.status] || "#6b7280";
      const el = techMarkersRef.current[tech.id]?.getElement() || document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = baseColor;
      el.style.border = "2px solid white";
      el.style.boxShadow = selectedTech?.id === tech.id ? "0 0 0 4px rgba(37,99,235,0.25)" : "0 2px 4px rgba(0,0,0,0.25)";

      const existing = techMarkersRef.current[tech.id];
      if (existing) {
        existing.setLngLat([tech.current_location.lng, tech.current_location.lat]);
      } else {
        techMarkersRef.current[tech.id] = new mapboxgl.Marker({ element: el })
          .setLngLat([tech.current_location.lng, tech.current_location.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`<strong>${tech.display_name}</strong><br/>${tech.status.replace("_", " ")}`))
          .addTo(map);
      }
    });
  }, [mapReady, technicians, selectedTech]);

  const updateJobMarkers = useCallback(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const nextIds = new Set(jobs.filter((j) => j.location).map((j) => j.id));

    Object.entries(jobMarkersRef.current).forEach(([id, marker]) => {
      if (!nextIds.has(id)) {
        marker.remove();
        delete jobMarkersRef.current[id];
      }
    });

    jobs.forEach((job) => {
      if (!job.location) return;
      const el = jobMarkersRef.current[job.id]?.getElement() || document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "4px";
      el.style.backgroundColor = "#111827";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.25)";

      const existing = jobMarkersRef.current[job.id];
      if (existing) {
        existing.setLngLat([job.location.lng, job.location.lat]);
      } else {
        jobMarkersRef.current[job.id] = new mapboxgl.Marker({ element: el })
          .setLngLat([job.location.lng, job.location.lat])
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`<strong>${job.customer_name}</strong><br/>${job.service_type}`))
          .addTo(map);
      }
    });
  }, [jobs, mapReady]);

  const findNextJobForTech = useCallback((techId: string) => {
    const assigned = jobs.find((j) => j.assigned_technician_id === techId && j.location);
    if (assigned) return assigned;
    return jobs.find((j) => j.location) || null;
  }, [jobs]);

  const buildRouteToNextJob = useCallback(async (tech: Technician) => {
    if (!tech.current_location) {
      setRouteResult(null);
      setRouteLabel(null);
      removeRouteLayer();
      return;
    }

    const nextJob = findNextJobForTech(tech.id);
    if (!nextJob || !nextJob.location) {
      setRouteResult(null);
      setRouteLabel(null);
      removeRouteLayer();
      return;
    }

    setRouteLoading(true);
    setRouteLabel(nextJob.location.address || "Next appointment");

    try {
      const route = await getDrivingRoute({ origin: tech.current_location, destination: nextJob.location });
      setRouteResult(route);
      drawRoute(route.geometry);

      if (mapRef.current) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([tech.current_location.lng, tech.current_location.lat]);
        bounds.extend([nextJob.location.lng, nextJob.location.lat]);
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
      }
    } catch (err) {
      console.error("Failed to build route", err);
      toast.error("Could not load route. Try again.");
      setRouteResult(null);
      removeRouteLayer();
    } finally {
      setRouteLoading(false);
    }
  }, [drawRoute, findNextJobForTech, removeRouteLayer]);

  useEffect(() => {
    if (!mapReady) return;
    updateTechMarkers();
  }, [mapReady, technicians, selectedTech, updateTechMarkers]);

  useEffect(() => {
    if (!mapReady) return;
    updateJobMarkers();
  }, [mapReady, jobs, updateJobMarkers]);

  useEffect(() => {
    if (!mapReady) return;
    if (!selectedTech) {
      setRouteResult(null);
      setRouteLabel(null);
      removeRouteLayer();
      return;
    }
    buildRouteToNextJob(selectedTech);
  }, [mapReady, selectedTech, jobs, buildRouteToNextJob, removeRouteLayer]);

  const handleSelectTechnician = (tech: Technician) => {
    setSelectedTech(tech);
    setRouteResult(null);
    setRouteLabel(null);
    fetchLocationHistoryData(tech.id);
    if (tech.current_location) setMapCenter({ lat: tech.current_location.lat, lng: tech.current_location.lng });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const techsWithLocation = technicians.filter((t) => t.current_location).length;
  const techsOnline = technicians.filter((t) => t.status !== "offline").length;
  const etaMinutes = routeResult ? Math.max(1, Math.round(routeResult.durationSeconds / 60)) : null;
  const distanceMiles = routeResult ? routeResult.distanceMeters / 1609.34 : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Live Team Map
              </CardTitle>
              <CardDescription>
                {techsWithLocation} of {technicians.length} technicians with location data
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-lg h-[420px] border border-border overflow-hidden">
            <div ref={mapContainerRef} className="absolute inset-0" />

            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Signal className="h-4 w-4 text-gray-500" />
                  <span>{techsOnline} Online</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <span>{techsWithLocation} Located</span>
                </div>
              </div>
            </div>

            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="shadow"
                onClick={() => selectedTech && buildRouteToNextJob(selectedTech)}
                disabled={!selectedTech || routeLoading}
              >
                {routeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                <span className="ml-2">Refresh Route</span>
              </Button>
            </div>

            <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg p-3 shadow-lg max-w-md">
              {selectedTech ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={selectedTech.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {selectedTech.display_name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    {selectedTech.display_name}
                  </p>
                  {routeLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Calculating route...
                    </div>
                  )}
                  {etaMinutes && distanceMiles !== null ? (
                    <div className="flex items-center gap-3 text-sm">
                      <Navigation className="h-4 w-4 text-blue-500" />
                      <span>{etaMinutes} min ETA</span>
                      <span className="text-muted-foreground">•</span>
                      <span>{distanceMiles.toFixed(1)} mi</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Select a job with a saved location to see ETA.</p>
                  )}
                  {routeLabel && <p className="text-xs text-muted-foreground truncate">{routeLabel}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a technician to plot their route to the next appointment.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className={cn("w-3 h-3 rounded-md", config.color)} />
                <span className="text-muted-foreground">{config.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Team Members
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[450px]">
            <div className="divide-y">
              {filteredTechnicians.map((tech) => (
                <div
                  key={tech.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                    selectedTech?.id === tech.id && "bg-muted"
                  )}
                  onClick={() => handleSelectTechnician(tech)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={tech.avatar_url || undefined} />
                        <AvatarFallback>{tech.display_name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-md border-2 border-background",
                          STATUS_CONFIG[tech.status].color
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{tech.display_name}</p>
                        {getStatusBadge(tech.status)}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        {tech.current_location ? (
                          <>
                            <MapPin className="h-3 w-3" />
                            <span>{getLocationAge(tech.location_updated_at)}</span>
                          </>
                        ) : (
                          <>
                            <MapPinOff className="h-3 w-3" />
                            <span>No location</span>
                          </>
                        )}
                      </div>
                      {tech.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tech.skills.slice(0, 3).map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {skill}
                            </Badge>
                          ))}
                          {tech.skills.length > 3 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              +{tech.skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTechnicians.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No technicians found</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Sheet open={!!selectedTech} onOpenChange={() => setSelectedTech(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selectedTech && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedTech.avatar_url || undefined} />
                    <AvatarFallback className="text-xl">
                      {selectedTech.display_name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle>{selectedTech.display_name}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2">
                      {getStatusBadge(selectedTech.status)}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Contact</h4>
                  {selectedTech.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${selectedTech.phone}`} className="hover:underline">
                        {selectedTech.phone}
                      </a>
                    </div>
                  )}
                  {selectedTech.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedTech.email}</span>
                    </div>
                  )}
                </div>

                {selectedTech.vehicle_info && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Vehicle</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {selectedTech.vehicle_info.make} {selectedTech.vehicle_info.model}
                        {selectedTech.vehicle_info.plate && ` (${selectedTech.vehicle_info.plate})`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Current Location</h4>
                  {selectedTech.current_location ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {selectedTech.current_location.lat.toFixed(4)}, {selectedTech.current_location.lng.toFixed(4)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Last updated {getLocationAge(selectedTech.location_updated_at)}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedTech.current_location!.lat},${selectedTech.current_location!.lng}`, "_blank")}
                      >
                        <Target className="h-4 w-4" />
                        Navigate to Location
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No location data available</p>
                  )}
                </div>

                {locationHistory.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Location History
                    </h4>
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {locationHistory.slice(0, 10).map((loc) => (
                          <div key={loc.id} className="flex items-center justify-between text-sm py-1">
                            <span className="text-muted-foreground">
                              {format(parseISO(loc.recorded_at), "h:mm:ss a")}
                            </span>
                            <span className="font-mono text-xs">
                              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {selectedTech.skills.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Skills & Certifications</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTech.skills.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
