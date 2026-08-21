/**
 * Service Writer Command Center — Phase 1+2: Split panels + One-click dispatch
 *
 * Left panel: Live Mapbox fleet map with technician/van/job pins
 * Right panel: Job queue workspace with tabs (Queue / Active / Done)
 *              Clicking an unassigned job opens the AI dispatch panel.
 *
 * Performance: Uses resizable panels to avoid re-mounting on resize.
 * Map component is lazy-loaded to keep initial bundle lean.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { errorMessage } from "@/lib/error-message";
import { isValidLngLat, normalizeLatLng } from "@/lib/coords";

import { useNavigate } from "react-router-dom";
import { fetchTodayJobs, fetchActiveTechnicians } from "@/application/queries/command-center.query";
import { fetchLifecycleSurfaceParity, type OperationalJobRow } from "@/application/queries/operational-jobs.query";
import { useAuth } from "@packages/auth";
import { useRealtimeWorkflow } from "@/hooks/useRealtimeWorkflow";
import { useRealtimeTechLocations } from "@/hooks/useRealtimeTechLocations";
import { getDrivingRoute } from "@/application/queries/mapbox";
import { AppLayout } from "@/components/layout/AppLayout";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkflowStatusIndicator } from "@/components/workflow/WorkflowStatusIndicator";
import {
  Radio, Clock, MapPin, Truck, ChevronRight,
  AlertTriangle, CheckCircle2, Loader2, Plus, Zap, Receipt,
} from "lucide-react";
import { format, isToday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatMoney } from "@/lib/financialMath";
import { deriveCommandCenterState, logUnknownOperationalStateForTriage } from "@/lib/command-center-state";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";
import {
  emitCommandCenterStateDegradedCount,
  emitDispatchCommandVisibilityDelta,
} from "@/lib/dispatch-telemetry";

// Lazy-load the map to avoid blocking initial render
import { lazy, Suspense } from "react";
const CommandMapPanel = lazy(() => import("@/components/command-center/CommandMapPanel"));
import { QuickDispatchPanel } from "@/components/command-center/QuickDispatchPanel";
import { DispatchOverviewStrip, type DispatchStripJob } from "@/components/command-center/DispatchOverviewStrip";
import { InlineServiceWriter } from "@/components/command-center/InlineServiceWriter";
import { CommandCenterWeatherBanner } from "@/components/command-center/CommandCenterWeatherBanner";
import { LocationQualityQueue } from "@/components/command-center/LocationQualityQueue";
import { fetchUpcomingAtRisk } from "@/application/queries/weather-guard.query";
import { useQuery } from "@tanstack/react-query";

// ─── Types ─────────────────────────────────────────────────────────────────

interface QueueJob {
  id: string;
  title: string;
  status: string;
  dispatch_status: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  guest_name: string | null;
  guest_phone: string | null;
  customer_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  assigned_technician_id: string | null;
  assigned_van_id: string | null;
  technician_name: string | null;
  van_name: string | null;
  estimated_cost: number | null;
  job_priority: string | null;
  source: "appointment" | "fleet_work_order" | string | null;
}

type CommandCenterTab = "queue" | "active" | "completed" | "cancelled";

type ActiveTechnicianRow = {
  id: string;
  name: string;
  status: string;
  avatar_url: string | null;
  current_location: { lat: number; lng: number } | null;
};

interface TechStatus {
  id: string;
  name: string;
  status: string;
  avatar_url: string | null;
  current_location: { lat: number; lng: number } | null;
  van_name: string | null;
  jobs_today: number;
}

interface DerivedQueueJob {
  job: QueueJob;
  lifecycleState: ReturnType<typeof deriveCommandCenterState>["lifecycleState"];
  isActive: boolean;
  isCompleted: boolean;
  hasUnknownMapping: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

type CommandCenterProps = {
  embedded?: boolean;
};

const CommandCenter = ({ embedded = false }: CommandCenterProps) => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [techs, setTechs] = useState<TechStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CommandCenterTab>("queue");
  const [selectedJobForDispatch, setSelectedJobForDispatch] = useState<QueueJob | null>(null);
  const [showServiceWriter, setShowServiceWriter] = useState(false);
  const [routeLines, setRouteLines] = useState<Array<{ techId: string; jobId: string; geometry: GeoJSON.LineString }>>([]);
  const [parityAligned, setParityAligned] = useState<boolean | null>(null);

  // Ref to latest techs/jobs for realtime callbacks (avoids stale closures)
  const techsRef = useRef(techs);
  techsRef.current = techs;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // Real-time workflow updates (appointments/services)
  const { isConnected } = useRealtimeWorkflow({
    userId,
    onEvent: () => fetchData(),
    showToasts: false,
    enabled: !!userId,
  });

  // Real-time technician GPS + status streaming (Phase 3)
  useRealtimeTechLocations({
    userId,
    enabled: !!userId,
    onLocationUpdate: useCallback((update) => {
      // Merge location update into tech state without full refetch
      setTechs(prev => prev.map(t =>
        t.id === update.techId
          ? { ...t, current_location: { lat: update.lat, lng: update.lng }, ...(update.status ? { status: update.status } : {}) }
          : t
      ));
    }, []),
    onStatusChange: useCallback((techId, newStatus) => {
      setTechs(prev => prev.map(t =>
        t.id === techId ? { ...t, status: newStatus } : t
      ));
    }, []),
  });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // Parallel fetch: today's jobs + active techs
      const [jobsRes, techsRes] = await Promise.all([
        fetchTodayJobs(userId, today),
        fetchActiveTechnicians(userId),
      ]);
      const parity = await fetchLifecycleSurfaceParity(userId, today);
      setParityAligned(parity.isAligned);

      if (jobsRes.data) {
        setJobs(
          (jobsRes.data as OperationalJobRow[]).map((j) => ({
            ...j,
            id: j.job_id,
            status: j.status ?? "pending",
            dispatch_status: j.dispatch_status ?? "unassigned",
            duration_minutes: j.duration_minutes ?? j.estimated_duration_minutes ?? 60,
            customer_name: j.customer_name ?? null,
            technician_name: j.assigned_technician_name ?? null,
            van_name: j.assigned_van_name ?? null,
          }))
        );
      }

      if (techsRes.data) {
        // Enrich with today's job count
        const techJobs = new Map<string, number>();
        (jobsRes.data as OperationalJobRow[] | null)?.forEach((j) => {
          if (j.assigned_technician_id) {
            techJobs.set(j.assigned_technician_id, (techJobs.get(j.assigned_technician_id) || 0) + 1);
          }
        });

        setTechs(
          (techsRes.data as unknown as ActiveTechnicianRow[]).map((t) => ({
            ...t,
            current_location: t.current_location as { lat: number; lng: number } | null,
            van_name: null as string | null, // Will enrich in Phase 2
            jobs_today: techJobs.get(t.id) || 0,
          }))
        );
      }
    } catch (err) {
      console.error("Command Center fetch error:", err);
      toast.error("Failed to load command center data", {
        description: errorMessage(err, "The backend did not return dispatch data."),
      });
      setParityAligned(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Phase 4: Fetch driving routes for en_route techs with assigned jobs
  useEffect(() => {
    const fetchRoutes = async () => {
      // Find en_route techs with location and their assigned job locations
      const enRouteTechs = techs.filter(t => t.status === "en_route" && normalizeLatLng(t.current_location));
      if (enRouteTechs.length === 0) {
        setRouteLines([]);
        return;
      }

      const routePromises = enRouteTechs.map(async (tech) => {
        // Find the assigned job for this tech
        const assignedJob = jobs.find(
          j =>
            j.assigned_technician_id === tech.id &&
            isValidLngLat(j.location_lng, j.location_lat) &&
            deriveCommandCenterState({ status: j.status, dispatch_status: j.dispatch_status }).isActive
        );
        const origin = normalizeLatLng(tech.current_location);
        if (!assignedJob || !origin) return null;

        try {
          const result = await getDrivingRoute({
            origin,
            destination: { lat: Number(assignedJob.location_lat), lng: Number(assignedJob.location_lng) },

            profile: "driving-traffic",
          });
          if (result.geometry) {
            return { techId: tech.id, jobId: assignedJob.id, geometry: result.geometry };
          }
        } catch (err) {
          console.warn("Route fetch failed for tech:", tech.name, err);
        }
        return null;
      });

      const results = (await Promise.all(routePromises)).filter(Boolean) as Array<{ techId: string; jobId: string; geometry: GeoJSON.LineString }>;
      setRouteLines(results);
    };

    // Debounce route fetching to avoid excessive API calls
    const timer = setTimeout(fetchRoutes, 1500);
    return () => clearTimeout(timer);
  }, [techs, jobs]);

  // Derived data
  const derivedJobs = useMemo<DerivedQueueJob[]>(
    () =>
      jobs.map((job) => {
        const derived = deriveCommandCenterState({ status: job.status, dispatch_status: job.dispatch_status });
        return {
          job,
          lifecycleState: derived.lifecycleState,
          isActive: derived.isActive,
          isCompleted: derived.isCompleted,
          hasUnknownMapping: derived.hasUnknownMapping,
        };
      }),
    [jobs]
  );

  const buckets = useMemo(() => buildCommandCenterBuckets(jobs), [jobs]);
  const unassignedJobs = buckets.queue;
  const activeJobs = buckets.active;
  const completedJobs = buckets.completed;
  const cancelledJobs = buckets.cancelled;

  const hasDataCompletenessRisk = useMemo(() => derivedJobs.some((d) => d.hasUnknownMapping), [derivedJobs]);
  const filterFreezeActive = hasDataCompletenessRisk;

  // Weather Guard — surface decisions on visible jobs
  const weatherRiskQuery = useQuery({
    queryKey: ["command-center", "weather-risk"],
    queryFn: fetchUpcomingAtRisk,
    refetchInterval: 60_000,
  });
  const weatherByJob = useMemo(() => {
    const map = new Map<string, { score: number | null; decision: string | null }>();
    (weatherRiskQuery.data ?? []).forEach((j) => {
      map.set(j.id, { score: j.weather_risk_score, decision: j.weather_decision });
    });
    return map;
  }, [weatherRiskQuery.data]);

  useEffect(() => {
    derivedJobs.forEach(({ job, hasUnknownMapping }) => {
      if (!hasUnknownMapping) return;
      logUnknownOperationalStateForTriage(
        { jobId: job.id, tenantId: userId, status: job.status, dispatch_status: job.dispatch_status },
        "command_center"
      );
    });
  }, [derivedJobs, userId]);

  useEffect(() => {
    const degradedCount = derivedJobs.filter((d) => d.hasUnknownMapping).length;
    emitCommandCenterStateDegradedCount({
      tenantId: userId,
      degradedCount,
    });
  }, [derivedJobs, userId]);

  useEffect(() => {
    emitDispatchCommandVisibilityDelta({
      tenantId: userId,
      source: "command_center",
      activeCount: activeJobs.length,
    });
  }, [activeJobs.length, userId]);

  useEffect(() => {
    if (filterFreezeActive && activeTab !== "active") {
      setActiveTab("active");
    }
  }, [filterFreezeActive, activeTab]);

  const queueForTab = filterFreezeActive
    ? activeJobs
    : activeTab === "queue"
      ? unassignedJobs
      : activeTab === "active"
        ? activeJobs
        : activeTab === "cancelled"
          ? cancelledJobs
          : completedJobs;

  /**
   * Status colors — Navy, Steel, Green, Amber (NO orange)
   */
  const statusBgColor = (status: string) => {
    switch (status) {
      case "available": return "bg-[hsl(var(--success))]";
      case "en_route": return "bg-[hsl(var(--warning))]";
      case "on_site": case "on_job": return "bg-[hsl(var(--primary))]";
      case "on_break": return "bg-[hsl(var(--secondary))]";
      default: return "bg-muted-foreground";
    }
  };

  // Map data for the left panel
  const mapJobs = useMemo(
    () =>
      derivedJobs
        .filter((d) => d.isActive && isValidLngLat(d.job.location_lng, d.job.location_lat))
        .map((d) => {
          const job = d.job;
          const normalizedStatus = d.lifecycleState === "dispatched" ? "en_route" : d.lifecycleState;
          return {
            id: job.id,
            lat: Number(job.location_lat),
            lng: Number(job.location_lng),
            title: job.title,
            status: normalizedStatus,
            assignedTechId: job.assigned_technician_id,
          };
        }),
    [derivedJobs]
  );

  const mapTechs = useMemo(() =>
    techs
      .map((t) => ({ tech: t, loc: normalizeLatLng(t.current_location) }))
      .filter((entry): entry is { tech: typeof entry.tech; loc: { lat: number; lng: number } } => entry.loc !== null)
      .map(({ tech, loc }) => ({
        id: tech.id,
        name: tech.name,
        lat: loc.lat,
        lng: loc.lng,
        status: tech.status,
      })),
    [techs]
  );


  const stripJobs = useMemo<DispatchStripJob[]>(
    () =>
      derivedJobs.map((d) => ({
        id: d.job.id,
        title: d.job.title,
        scheduled_time: d.job.scheduled_time,
        duration_minutes: d.job.duration_minutes,
        customer_name: d.job.customer_name,
        guest_name: d.job.guest_name,
        job_priority: d.job.job_priority,
        assigned_technician_id: d.job.assigned_technician_id,
        technician_name: d.job.technician_name,
        lifecycleState: d.lifecycleState,
      })),
    [derivedJobs],
  );

  const content = (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <WorkflowStatusIndicator isConnected={isConnected} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-gray-500 animate-pulse" />
            <span>Live</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/fleet-os/work-orders/invoicing")}>
            <Receipt className="h-3.5 w-3.5" />
            Work orders & invoices
          </Button>
          {parityAligned !== null && (
            <Badge variant={parityAligned ? "outline" : "destructive"} className="text-xs">
              Lifecycle parity: {parityAligned ? "aligned" : "mismatch"}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))]">
            <Truck className="h-3 w-3 mr-1" />
            {techs.filter(t => t.status === "available").length} available
          </Badge>
          <Badge variant="outline" className="text-xs border-[hsl(var(--warning)/0.4)] text-[hsl(var(--warning))]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {unassignedJobs.length} unassigned
          </Badge>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowServiceWriter(true); setSelectedJobForDispatch(null); }}>
            <Plus className="h-3.5 w-3.5" />
            New Job
          </Button>
        </div>
      </div>

      {hasDataCompletenessRisk && (
        <Card className="mb-3 border-amber-300 bg-amber-50/70 dark:bg-amber-950/20">
          <CardContent className="py-2.5 px-3 text-xs flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Data completeness degraded; using safe fallback filters.
          </CardContent>
        </Card>
      )}

      <CommandCenterWeatherBanner
        jobIds={jobs.map((j) => j.id)}
        onActionApplied={() => {
          fetchData();
          weatherRiskQuery.refetch();
        }}
      />

      <DispatchOverviewStrip
        jobs={stripJobs}
        techs={techs.map((t) => ({ id: t.id, name: t.name, status: t.status }))}
        onOpenJob={(jobId) => {
          const target = jobs.find((j) => j.id === jobId);
          navigate(target?.source === "fleet_work_order" ? `/fleet-os/work-orders/${jobId}` : `/appointments/${jobId}`);
        }}
        onDispatchJob={(jobId) => {
          const target = jobs.find((j) => j.id === jobId);
          if (target) setSelectedJobForDispatch(target);
        }}
      />


      <div className="h-[calc(100vh-180px)] rounded-lg border border-border overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* LEFT: Live Map */}
          <ResizablePanel defaultSize={55} minSize={30}>
            <Suspense fallback={
              <div className="h-full flex items-center justify-center bg-muted/30">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Loading map…</span>
                </div>
              </div>
            }>
              <CommandMapPanel jobs={mapJobs} techs={mapTechs} routes={routeLines} />
            </Suspense>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT: Job Queue Workspace */}
          <ResizablePanel defaultSize={45} minSize={25}>
            <div className="h-full flex flex-col bg-background">
              {/* Tabs header */}
              <div className="border-b border-border px-4 pt-3 pb-0">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Work queue</h2>
                    <p className="text-xs text-muted-foreground">Today · {format(new Date(), "MMM d")}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{jobs.length} total</Badge>
                    <Badge variant={unassignedJobs.length > 0 ? "destructive" : "secondary"} className="text-[10px]">
                      {unassignedJobs.length} unassigned
                    </Badge>
                    <Badge variant={jobs.some((job) => job.job_priority === "urgent") ? "destructive" : "outline"} className="text-[10px]">
                      {jobs.filter((job) => job.job_priority === "urgent").length} urgent
                    </Badge>
                  </div>
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CommandCenterTab)}>
                  <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-0">
                    <TabsTrigger
                      value="queue"
                      disabled={filterFreezeActive}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2"
                    >
                      Queue
                      {unassignedJobs.length > 0 && (
                        <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">
                          {unassignedJobs.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="active"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2"
                    >
                      Active
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                        {activeJobs.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="completed"
                      disabled={filterFreezeActive}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2"
                    >
                      Done
                      <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px]">
                        {completedJobs.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="cancelled"
                      disabled={filterFreezeActive}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2"
                    >
                      Cancelled
                      {cancelledJobs.length > 0 && (
                        <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px]">
                          {cancelledJobs.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {filterFreezeActive && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 py-2">
                    Queue/Completed filters are temporarily disabled to prevent false negatives.
                  </p>
                )}
              </div>

              {!showServiceWriter && !selectedJobForDispatch && (
                <LocationQualityQueue onResolved={fetchData} />
              )}

              {/* Job list OR Dispatch panel OR Service Writer */}
              {showServiceWriter ? (
                <InlineServiceWriter
                  onBack={() => setShowServiceWriter(false)}
                  onJobCreated={() => {
                    setShowServiceWriter(false);
                    fetchData();
                  }}
                />
              ) : selectedJobForDispatch ? (
                <QuickDispatchPanel
                  job={selectedJobForDispatch}
                  onBack={() => setSelectedJobForDispatch(null)}
                  onAssigned={() => {
                    setSelectedJobForDispatch(null);
                    fetchData();
                  }}
                />
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                      ))
                    ) : queueForTab.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <CheckCircle2 className="h-10 w-10 mb-2 opacity-30" />
                        <p className="text-sm font-medium">
                          {activeTab === "queue" ? "No unassigned jobs" : activeTab === "completed" ? "No completed jobs yet" : activeTab === "cancelled" ? "No cancelled jobs" : "No active jobs"}
                        </p>
                      </div>
                    ) : (
                      queueForTab.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          onClick={() => {
                            if (job.source === "fleet_work_order") {
                              navigate(`/fleet-os/scheduler`);
                            } else if (!job.assigned_technician_id && activeTab === "queue") {
                              setSelectedJobForDispatch(job);
                            } else {
                              navigate(`/appointments/${job.id}`);
                            }
                          }}
                          showDispatchHint={job.source !== "fleet_work_order" && !job.assigned_technician_id && activeTab === "queue"}
                          weather={weatherByJob.get(job.id)}
                        />
                      ))
                    )}
                  </div>

                  {/* Tech status strip */}
                  <div className="border-t border-border px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                      Technicians ({techs.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {techs.map((tech) => (
                        <button
                          key={tech.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card text-xs whitespace-nowrap hover:border-[hsl(var(--accent)/0.4)] hover:bg-[hsl(var(--accent)/0.05)] transition-colors"
                          onClick={() => navigate(`/technician/${tech.id}`)}
                        >
                          <span className={cn("h-2 w-2 rounded-md", statusBgColor(tech.status))} />
                          <span className="font-medium truncate max-w-[80px]" title={tech.name}>{tech.name}</span>
                          <span className="text-muted-foreground">({tech.jobs_today})</span>
                        </button>
                      ))}
                      {techs.length === 0 && (
                        <span className="text-xs text-muted-foreground">No active technicians</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );

  if (embedded) return content;

  return <AppLayout title="Today">{content}</AppLayout>;
};

// ─── Job Card ──────────────────────────────────────────────────────────────

function JobCard({ job, onClick, showDispatchHint = false, weather }: { job: QueueJob; onClick: () => void; showDispatchHint?: boolean; weather?: { score: number | null; decision: string | null } }) {
  const displayName = job.customer_name || job.guest_name || "Walk-in";
  const timeStr = job.scheduled_time?.slice(0, 5);
  const assignedLabel = job.technician_name || job.van_name || (job.assigned_technician_id || job.assigned_van_id ? "Assigned" : "Unassigned");

  return (
    <Card
      className="cursor-pointer border-l-4 hover:bg-[hsl(var(--accent)/0.06)] transition-colors"
      style={{
        borderLeftColor: job.assigned_technician_id
          ? "hsl(var(--success))"           /* Green — assigned */
          : job.job_priority === "urgent"
          ? "hsl(var(--destructive))"        /* Red — urgent */
          : "hsl(var(--warning))",            /* Amber — unassigned */
      }}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums">{timeStr}</span>
              <span className="truncate text-sm font-semibold" title={displayName}>{displayName}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={job.title}>{job.title}</p>
          </div>
          <Badge variant={job.assigned_technician_id || job.assigned_van_id ? "secondary" : "outline"} className="shrink-0 text-[10px]">
            {assignedLabel}
          </Badge>
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{job.duration_minutes} min</span>
          {job.estimated_cost != null && job.estimated_cost > 0 && (
            <span>· Est. ${formatMoney(job.estimated_cost)}</span>
          )}
        </div>

        {job.location_address && (
          <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground" title={job.location_address}>
            <MapPin className="h-3 w-3 shrink-0" />
            {job.location_address}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {job.job_priority === "urgent" && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">urgent</Badge>
            )}
            {job.source === "ai_intake" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />AI
              </Badge>
            )}
            {weather?.decision === "BLOCK" && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0" title={`Weather risk ${weather.score ?? "—"}`}>
                Weather block
              </Badge>
            )}
            {weather?.decision === "SUGGEST_RESCHEDULE" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-700 dark:text-amber-300" title={`Weather risk ${weather.score ?? "—"}`}>
                Reschedule?
              </Badge>
            )}
            {weather?.decision === "WARN" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0" title={`Weather risk ${weather.score ?? "—"}`}>
                Weather warn
              </Badge>
            )}
          </div>

          {showDispatchHint ? (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary">
              <Zap className="h-3 w-3" /> Dispatch
            </span>
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CommandCenter;
