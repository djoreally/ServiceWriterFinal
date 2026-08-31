/**
 * TechNavigation — in-app turn-by-turn guidance for technicians.
 *
 * Replaces the old hand-off to Google/Apple Maps. Guidance data comes from the
 * location-service `get_route_preview` action (normalized Mapbox maneuvers) and
 * every state transition is written back through navigation session events so the
 * dispatcher live map and drive-vs-work segments stay accurate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, Volume2, VolumeX, Navigation, ListOrdered, Crosshair, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from "@/lib/mapbox";
import {
  createNavigationSession,
  getRoutePreview,
  ingestLocationBatch,
  recordNavigationEvent,
} from "@/application/commands/location-service.command";
import type {
  GuidanceRoute,
  GuidanceStep,
  NavigationEventType,
  NavigationSessionStatus,
} from "@/application/location/location-service.contracts";
import { fetchTechRouteStopsForCurrentUserToday } from "@/application/queries/tech-app.query";
import { useTechContext } from "./TechAppLayout";

const VOICE_PREFERENCE_KEY = "tech-navigation-voice-muted";
const TELEMETRY_INTERVAL_MS = 20_000;
const REROUTE_DISTANCE_METERS = 90;

type GuidancePhase = "loading" | "en_route" | "arrived" | "working" | "paused" | "complete";

interface NavigationStop {
  id: string;
  source: "appointment" | "fleet_work_order";
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  customers: { name: string } | null;
  service_catalog: { name: string } | null;
}

const metersToMiles = (meters: number) => meters / 1609.34;

const formatDistance = (meters: number) => {
  if (meters < 160) return `${Math.max(10, Math.round(meters / 10) * 10)} ft`;
  const miles = metersToMiles(meters);
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
};

const formatEta = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** Haversine distance in meters — used for step advancement and off-route detection. */
const distanceMeters = (a: [number, number], b: [number, number]) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export default function TechNavigation() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { identity } = useTechContext();

  const [stop, setStop] = useState<NavigationStop | null>(null);
  const [route, setRoute] = useState<GuidanceRoute | null>(null);
  const [phase, setPhase] = useState<GuidancePhase>("loading");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem(VOICE_PREFERENCE_KEY) === "true");
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const vehicleMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastTelemetryAtRef = useRef(0);
  const spokenStepsRef = useRef<Set<number>>(new Set());
  const rerouteAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const originRef = useRef<[number, number] | null>(null);

  const steps = route?.steps ?? [];
  const currentStep: GuidanceStep | null = steps[stepIndex] ?? null;

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const speak = useCallback((text: string | null) => {
    if (!text || muted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, [muted]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(VOICE_PREFERENCE_KEY, String(next));
      if (next && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  };

  /** Ask the browser for a single high-accuracy fix. */
  const getCurrentPosition = useCallback(() => new Promise<[number, number] | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  }), []);

  const loadRoute = useCallback(async (
    destination: { latitude: number; longitude: number },
    origin: [number, number],
    isReroute = false,
  ) => {
    const { routes } = await getRoutePreview({
      origin: { latitude: origin[1], longitude: origin[0] },
      destination,
      profile: "driving-traffic",
    });
    const nextRoute = routes[0];
    if (!nextRoute) throw new Error("No drivable route to this job");

    setRoute(nextRoute);
    setStepIndex(0);
    setRemainingMeters(nextRoute.distanceMeters);
    setRemainingSeconds(nextRoute.durationSeconds);
    spokenStepsRef.current = new Set();

    if (isReroute && sessionIdRef.current) {
      void recordNavigationEvent({
        navigationSessionId: sessionIdRef.current,
        eventType: "rerouted",
        payload: {
          plannedDistanceMeters: Math.round(nextRoute.distanceMeters),
          plannedDurationSeconds: Math.round(nextRoute.durationSeconds),
        },
      }).catch((): void => {});
    }
    return nextRoute;
  }, []);

  // Boot: resolve the stop, open the navigation session, then build the route.
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!identity || !jobId) return;
      try {
        const stops = (await fetchTechRouteStopsForCurrentUserToday(identity)) as unknown as NavigationStop[];
        const match = (stops || []).find((candidate) => candidate.id === jobId) ?? null;
        if (cancelled) return;

        if (!match) {
          setError("This job is not on your route for today.");
          setPhase("en_route");
          return;
        }
        if (match.location_lat == null || match.location_lng == null) {
          setStop(match);
          setError("This job has no verified coordinates yet. Ask dispatch to verify the address.");
          setPhase("en_route");
          return;
        }
        setStop(match);

        const origin = (await getCurrentPosition()) ?? [match.location_lng, match.location_lat];
        if (cancelled) return;
        originRef.current = origin;

        const { navigationSession } = await createNavigationSession({
          jobId: match.id,
          jobSource: match.source,
          guidanceMode: "web",
        });
        if (cancelled) return;

        const status = navigationSession.status as NavigationSessionStatus;
        if (status === "created") {
          await recordNavigationEvent({ navigationSessionId: navigationSession.id, eventType: "acknowledged" });
          await recordNavigationEvent({ navigationSessionId: navigationSession.id, eventType: "navigation_started" });
        }
        setSessionId(navigationSession.id);
        sessionIdRef.current = navigationSession.id;

        const built = await loadRoute(
          { latitude: match.location_lat, longitude: match.location_lng },
          origin,
        );
        if (cancelled) return;

        setPhase(status === "arrived" || status === "arrived_pending" ? "arrived" : "en_route");
        speak(built.steps[0]?.voiceInstruction ?? built.steps[0]?.instruction ?? null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to start guidance";
        if (message.includes("navigation_requires_verified_location")) {
          setError("Dispatcher verification is required before navigation can begin.");
        } else if (message.includes("navigation_guidance_not_enabled_for_workspace")) {
          setError("In-app guidance is not enabled for this workspace yet.");
        } else {
          setError(message);
        }
        setPhase("en_route");
      }
    };

    void boot();
    return () => { cancelled = true; };

  }, [getCurrentPosition, identity, jobId, loadRoute, speak]);

  // Initialize the map once.
  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    try {
      mapboxgl.accessToken = requireMapboxToken();
    } catch {
      void Promise.resolve().then(() => setError("Mapping is not configured for this workspace."));
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: mapNodeRef.current,
      style: MAPBOX_DEFAULT_STYLE,
      center: [-95.7129, 37.0902],
      zoom: 3,
      attributionControl: false,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      vehicleMarkerRef.current = null;
    };
  }, []);

  // Draw route line + destination pin whenever the route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || !stop?.location_lat || !stop?.location_lng) return;

    const render = () => {
      const sourceId = "tech-navigation-route";
      const layerId = "tech-navigation-route-line";
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route.geometry },
      });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0a84ff", "line-width": 6, "line-opacity": 0.9 },
      });

      const destination: [number, number] = [stop.location_lng as number, stop.location_lat as number];
      new mapboxgl.Marker({ color: "#0a84ff" }).setLngLat(destination).addTo(map);

      const bounds = route.geometry.coordinates.reduce(
        (acc, coordinate) => acc.extend(coordinate as [number, number]),
        new mapboxgl.LngLatBounds(destination, destination),
      );
      map.fitBounds(bounds, { padding: 64, maxZoom: 15 });
    };

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [route, stop]);

  // Live position: follow camera, step advancement, voice, telemetry, reroute.
  useEffect(() => {
    if (!route || !stop?.location_lat || !stop?.location_lng) return;
    if (!navigator.geolocation) return;
    if (phase !== "en_route") return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const here: [number, number] = [position.coords.longitude, position.coords.latitude];
        const map = mapRef.current;

        if (map) {
          if (!vehicleMarkerRef.current) {
            const el = document.createElement("div");
            el.className = "h-4 w-4 rounded-full bg-primary border-2 border-background shadow-lg";
            vehicleMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(here).addTo(map);
          } else {
            vehicleMarkerRef.current.setLngLat(here);
          }
          map.easeTo({
            center: here,
            zoom: Math.max(map.getZoom(), 15),
            bearing: position.coords.heading ?? map.getBearing(),
            duration: 600,
          });
        }

        // Advance to the next maneuver once the current one is behind us.
        const activeStep = route.steps[stepIndex];
        if (activeStep?.location) {
          const toManeuver = distanceMeters(here, activeStep.location);
          setDistanceToManeuver(toManeuver);

          const upcoming = route.steps[stepIndex + 1];
          const trigger = activeStep.voiceTriggerMeters ?? 200;
          if (toManeuver <= trigger && !spokenStepsRef.current.has(activeStep.stepIndex)) {
            spokenStepsRef.current.add(activeStep.stepIndex);
            speak(activeStep.voiceInstruction ?? activeStep.instruction);
          }
          if (toManeuver <= 30 && upcoming) {
            setStepIndex(stepIndex + 1);
          }
        }

        // Remaining distance/ETA from the tail of the step list.
        const tail = route.steps.slice(stepIndex);
        const tailMeters = tail.reduce((sum, step) => sum + step.distanceMeters, 0);
        const tailSeconds = tail.reduce((sum, step) => sum + step.durationSeconds, 0);
        setRemainingMeters(tailMeters);
        setRemainingSeconds(tailSeconds);

        // Off-route detection against the planned geometry.
        const closest = route.geometry.coordinates.reduce((min, coordinate) => {
          const d = distanceMeters(here, coordinate as [number, number]);
          return d < min ? d : min;
        }, Number.POSITIVE_INFINITY);
        if (closest > REROUTE_DISTANCE_METERS && Date.now() - rerouteAtRef.current > 30_000) {
          rerouteAtRef.current = Date.now();
          void loadRoute(
            { latitude: stop.location_lat as number, longitude: stop.location_lng as number },
            here,
            true,
          ).catch((): void => {});
        }

        // Throttled telemetry so dispatch sees live position.
        const now = Date.now();
        if (now - lastTelemetryAtRef.current >= TELEMETRY_INTERVAL_MS) {
          lastTelemetryAtRef.current = now;
          void ingestLocationBatch([{
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            altitudeMeters: position.coords.altitude,
            headingDegrees: position.coords.heading,
            speedMps: position.coords.speed,
            source: "web",
            capturedAt: new Date(position.timestamp).toISOString(),
            idempotencyKey: crypto.randomUUID(),
            navigationSessionId: sessionIdRef.current ?? undefined,
            qualityFlags: ["in_app_guidance"],
          }]).catch((): void => {});
        }
      },
      (positionError) => {
        console.warn("[TechNavigation] Browser location unavailable", positionError.code);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [route, stop, stepIndex, phase, speak, loadRoute]);

  const transition = async (eventType: NavigationEventType, nextPhase: GuidancePhase) => {
    if (!sessionId) {
      toast.error("Guidance session is not active");
      return;
    }
    setBusy(true);
    try {
      await recordNavigationEvent({ navigationSessionId: sessionId, eventType });
      setPhase(nextPhase);
      if (eventType === "work_completed" || eventType === "navigation_ended") {
        if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update this job");
    } finally {
      setBusy(false);
    }
  };

  const recenter = async () => {
    const here = await getCurrentPosition();
    if (!here) {
      toast.error("Location permission is required to recenter");
      return;
    }
    mapRef.current?.easeTo({ center: here, zoom: 15, duration: 600 });
  };

  const headline = useMemo(() => {
    if (error) return error;
    if (phase === "arrived") return "You have arrived";
    if (phase === "working") return "Work in progress";
    if (phase === "paused") return "Work paused";
    if (phase === "complete") return "Job complete";
    return currentStep?.bannerPrimary ?? currentStep?.instruction ?? "Building your route";
  }, [error, phase, currentStep]);

  if (phase === "loading" && !error) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[50vh] w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-primary text-primary-foreground">
        <div className="flex items-start gap-3 p-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
            onClick={() => navigate(jobId ? `/tech-app/jobs/${jobId}` : "/tech-app/route")}
            aria-label="Back to job"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide opacity-80">
              {stop?.customers?.name || "Next stop"}
            </p>
            <p className="text-lg font-bold leading-tight">{headline}</p>
            {currentStep?.bannerSecondary && phase === "en_route" && !error && (
              <p className="text-sm opacity-90 truncate">{currentStep.bannerSecondary}</p>
            )}
            {distanceToManeuver != null && phase === "en_route" && !error && (
              <p className="text-sm font-semibold">in {formatDistance(distanceToManeuver)}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
            onClick={toggleMute}
            aria-label={muted ? "Unmute voice guidance" : "Mute voice guidance"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        </div>
        <div className="flex items-center gap-3 px-3 pb-3 text-sm">
          <Badge variant="secondary" className="gap-1">
            <Navigation className="h-3 w-3" />
            {remainingSeconds != null ? formatEta(remainingSeconds) : "—"}
          </Badge>
          <span className="opacity-90">{remainingMeters != null ? formatDistance(remainingMeters) : "—"}</span>
          {stop?.service_catalog?.name && (
            <span className="truncate opacity-80">{stop.service_catalog.name}</span>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-[45vh]">
        <div ref={mapNodeRef} className="absolute inset-0 bg-muted" />
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <Button size="icon" variant="secondary" onClick={recenter} aria-label="Recenter map">
            <Crosshair className="h-4 w-4" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="secondary" aria-label="All directions">
                <ListOrdered className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Directions</SheetTitle>
              </SheetHeader>
              <ol className="mt-4 space-y-3">
                {steps.map((step) => (
                  <li
                    key={step.stepIndex}
                    className={cn(
                      "rounded-md border p-3",
                      step.stepIndex === stepIndex && "border-primary bg-primary/5",
                      step.stepIndex < stepIndex && "opacity-50",
                    )}
                  >
                    <p className="text-sm font-medium">{step.bannerPrimary ?? step.instruction}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(step.distanceMeters)}
                      {step.name ? ` • ${step.name}` : ""}
                    </p>
                  </li>
                ))}
                {steps.length === 0 && (
                  <li className="text-sm text-muted-foreground">No directions available.</li>
                )}
              </ol>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="border-t p-3 space-y-2">
        {phase === "en_route" && (
          <Button className="w-full h-14 text-base" disabled={busy || !sessionId} onClick={() => transition("arrival_confirmed", "arrived")}>
            Arrived
          </Button>
        )}
        {phase === "arrived" && (
          <Button className="w-full h-14 text-base" disabled={busy} onClick={() => transition("work_started", "working")}>
            Start work
          </Button>
        )}
        {phase === "working" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-14" disabled={busy} onClick={() => transition("work_paused", "paused")}>
              Pause
            </Button>
            <Button className="h-14" disabled={busy} onClick={() => transition("work_completed", "complete")}>
              Complete
            </Button>
          </div>
        )}
        {phase === "paused" && (
          <Button className="w-full h-14 text-base" disabled={busy} onClick={() => transition("work_resumed", "working")}>
            Resume work
          </Button>
        )}
        {phase === "complete" && (
          <Button className="w-full h-14 text-base" onClick={() => navigate("/tech-app/route")}>
            Next stop
          </Button>
        )}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(jobId ? `/tech-app/jobs/${jobId}` : "/tech-app")}>
            Job details
          </Button>
          {stop?.location_address && (
            <a
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.location_address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Maps <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
