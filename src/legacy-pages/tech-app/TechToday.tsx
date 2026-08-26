/**
 * TechToday — Technician landing screen.
 *
 * Mission-first layout: the next job with live Mapbox ETA, a route map, the rest
 * of today's schedule, and progress tiles. The primary action moves the job
 * through the real dispatch lifecycle: NAVIGATE (en route) → START APPOINTMENT
 * (in progress) → job workspace.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Car,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Gauge,
  MapPin,
  Mail,
  Navigation,
  Play,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { countIssueJobs } from "@/lib/tech-job-state";
import {
  fetchTechInventoryDataForCurrentUser,
  fetchTechNotificationSettingsForCurrentUser,
  fetchTechnicianSession,
  type TechSessionJob,
} from "@/application/queries/tech-app.query";
import { updateTechJobDispatchStatus, sendTechnicianEtaEmail } from "@/application/commands/tech-app.command";
import { buildTechMissionBoard, getTechMissionEffectiveStatus } from "@/lib/tech-mission-board";
import { readTechMissionBoardCache, saveTechMissionBoardCache, saveTechContextCache } from "@/lib/tech-offline-cache";
import { buildTechDataQualityAlerts, type TechDataQualityAlert } from "@/lib/tech-data-quality";
import {
  trackTechDataQualityAlert,
  trackTechJobTransition,
  trackTechNavigation,
  trackTechShiftTransition,
  trackTechSyncFailure,
} from "@/lib/tech-telemetry";
import { TechMissionMap, type MapStop } from "@/components/tech-app/TechMissionMap";
import { TechPresenceActionBar, type TechPresenceAction } from "@/components/tech-app/TechPresenceActionBar";
import { TechMissionAlerts } from "@/components/tech-app/TechMissionAlerts";
import { useTechJobEta } from "@/hooks/useTechJobEta";
import { useTechShiftManagement } from "@/hooks/useTechShiftManagement";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTechContext } from "./TechAppLayout";

interface TechJob {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number;
  dispatch_status: string;
  status: string;
  job_priority: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  notes: string | null;
  title: string;
  customers: { name: string; phone: string | null } | null;
  vehicles: { year: number; make: string; model: string; color: string | null } | null;
  service_catalog: { name: string } | null;
  is_fleet?: boolean;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
  fleet_children?: TechJob[];
}

interface DashboardStats {
  todayJobs: number;
  hoursLogged: number;
  partsInVan: number;
  openIssues: number;
}

const ACCENT = "#1439cc";
const SURFACE = "#f6f7f9";
const TEXT = "#0d0d0f";
const MUTED = "#5c5f68";

const STATUS_COPY: Record<string, string> = {
  assigned: "ASSIGNED",
  scheduled: "SCHEDULED",
  en_route: "EN ROUTE",
  arrived: "ARRIVED",
  in_progress: "IN PROGRESS",
  completed: "COMPLETED",
  delayed: "DELAYED",
  cancelled: "CANCELLED",
};

const EN_ROUTE_STATES = new Set(["en_route", "arrived", "in_progress"]);

const formatJobTime = (time?: string | null) => {
  if (!time) return "--:--";
  try {
    return formatTimeLabel(time, "hh:mm a");
  } catch {
    return time.slice(0, 5);
  }
};

const vehicleLabel = (job?: TechJob | null) => {
  if (!job?.vehicles) return job?.title || "Work Order";
  const { year, make, model } = job.vehicles;
  return [year || null, make, model].filter(Boolean).join(" ") || job.title || "Work Order";
};

const serviceLabel = (job?: TechJob | null) => job?.service_catalog?.name || job?.title || "Service appointment";

/** Canonical session job -> mission board job shape used by the map, ETA, and schedule. */
const mapSessionJob = (job: TechSessionJob): TechJob => ({
  id: job.id,
  scheduled_date: job.scheduled_date,
  scheduled_time: job.scheduled_time || "",
  estimated_duration_minutes: job.estimated_duration_minutes ?? 60,
  dispatch_status: job.dispatch_status || job.status,
  status: job.status,
  job_priority: job.job_priority || "normal",
  location_address: job.location_address,
  location_lat: job.location_lat,
  location_lng: job.location_lng,
  notes: job.notes,
  title: job.title,
  customers: job.customer_name ? { name: job.customer_name, phone: job.customer_phone } : null,
  vehicles: job.vehicle_make
    ? { year: job.vehicle_year ?? 0, make: job.vehicle_make, model: job.vehicle_model ?? "", color: null }
    : null,
  service_catalog: job.service_name ? { name: job.service_name } : null,
  is_fleet: job.is_fleet,
});

export default function TechToday() { 
  const navigate = useNavigate();
  const { identity, loading: identityLoading } = useTechContext();
  const [loading, setLoading] = useState(true);
  const [allJobs, setAllJobs] = useState<TechJob[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ todayJobs: 0, hoursLogged: 0, partsInVan: 0, openIssues: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [actionPending, setActionPending] = useState<"navigate" | "start" | "eta" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [presencePending, setPresencePending] = useState<TechPresenceAction | null>(null);
  const [dataQualityAlerts, setDataQualityAlerts] = useState<TechDataQualityAlert[]>([]);

  const [shift, setShift] = useState<{ isOnShift: boolean; isOnBreak: boolean }>({ isOnShift: false, isOnBreak: false });
  const { clockIn, clockOut, startBreak, endBreak } = useTechShiftManagement(identity?.techId);

  const fetchData = useCallback(async () => {
    if (!identity) return;

    const today = format(new Date(), "yyyy-MM-dd");
    try {
      // Mission Control is the retail appointment board. Fleet work orders have
      // their own scheduler and remain isolated on the Fleet tab.
      const [session, inventoryData, notificationPrefs] = await Promise.all([
        fetchTechnicianSession(),
        fetchTechInventoryDataForCurrentUser(),
        fetchTechNotificationSettingsForCurrentUser(),
      ]);

      const jobs = (session.jobs || []).filter((job) => job.job_source === "appointment").map(mapSessionJob);
      setAllJobs(jobs);
      setShift({ isOnShift: Boolean(session.is_on_shift), isOnBreak: Boolean(session.is_on_break) });

      const todayJobs = jobs.filter((job) => job.scheduled_date === today);
      const partsInVan =
        (inventoryData.items as Array<{ quantity?: number }> | undefined)?.reduce((sum, item) => sum + (item.quantity ?? 0), 0) ?? 0;

      const shiftStart = session.shift?.clock_in ? new Date(session.shift.clock_in).getTime() : null;
      const hoursLogged = shiftStart ? Math.round(((Date.now() - shiftStart) / 3_600_000) * 10) / 10 : 0;

      setStats({
        todayJobs: todayJobs.length,
        hoursLogged,
        partsInVan,
        openIssues: countIssueJobs(jobs),
      });

      // Phase 4 — data-quality alerts: surface routing/contact gaps instead of empty screens.
      const alerts = buildTechDataQualityAlerts({
        accessState: session.access_state,
        jobs: todayJobs,
        dataFreshAt: session.data_fresh_at,
      });
      setDataQualityAlerts(alerts);
      alerts.forEach((alert) =>
        trackTechDataQualityAlert({
          code: alert.code,
          severity: alert.severity,
          count: alert.count,
          workspace_user_id: session.workspace_user_id,
        }),
      );

      if (notificationPrefs.offlineCacheEnabled) {
        saveTechMissionBoardCache(identity.userId, buildTechMissionBoard(jobs as any[], today), jobs as any[]);
        saveTechContextCache(identity.userId, {
          access_state: session.access_state,
          workspace_user_id: session.workspace_user_id,
          technician_id: session.technician_id,
          is_on_shift: session.is_on_shift,
          is_on_break: session.is_on_break,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mission board could not be loaded";
      const cached = readTechMissionBoardCache(identity.userId);
      trackTechSyncFailure({ scope: "mission_board", error: message, served_from_cache: Boolean(cached) });
      if (cached) {
        setAllJobs(cached.jobs as unknown as TechJob[]);
        toast.warning("Showing cached mission board while offline");
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    if (identity) fetchData();
  }, [identity, fetchData]);

  // Live mission board: dispatch reassignments and status changes land without a
  // manual pull. Channel name is stable and torn down on unmount to avoid leaks.
  useEffect(() => {
    if (!identity?.businessUserId) return;

    const channel = supabase
      .channel(`tech-mission-board-${identity.businessUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `user_id=eq.${identity.businessUserId}` },
        () => fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_work_orders", filter: `user_id=eq.${identity.businessUserId}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [identity?.businessUserId, fetchData]);

  const today = format(new Date(), "yyyy-MM-dd");

  const todaysJobs = useMemo(
    () =>
      allJobs
        .filter((job) => job.scheduled_date === today)
        .sort((a, b) => `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`)),
    [allJobs, today],
  );

  const missionBoard = useMemo(() => buildTechMissionBoard(allJobs as any[], today), [allJobs, today]);

  const currentJob =
    (missionBoard.currentJob as TechJob | null) ??
    todaysJobs.find((job) => EN_ROUTE_STATES.has(getTechMissionEffectiveStatus(job as any))) ??
    todaysJobs.find((job) => getTechMissionEffectiveStatus(job as any) !== "completed") ??
    null;

  const eta = useTechJobEta(
    currentJob
      ? {
          lat: currentJob.location_lat,
          lng: currentJob.location_lng,
          address: currentJob.location_address,
        }
      : null,

  );

  const scheduleJobs = todaysJobs.filter((job) => job.id !== currentJob?.id);
  const currentStatus = currentJob ? getTechMissionEffectiveStatus(currentJob as any) : identity?.presenceState || "off_shift";
  const completeCount = todaysJobs.filter((job) => getTechMissionEffectiveStatus(job as any) === "completed").length;
  const remainingCount = Math.max(0, todaysJobs.length - completeCount);
  const dailyGoal = todaysJobs.length > 0 ? Math.round((completeCount / todaysJobs.length) * 100) : 0;
  const firstName = identity?.name?.split(" ")[0] || "Tech";

  // Once the tech has taken directions, the primary action becomes "start appointment".
  const hasDeparted = currentStatus ? EN_ROUTE_STATES.has(currentStatus) : false;
  const isStarted = currentStatus === "in_progress";

  const mapStops: MapStop[] = useMemo(
    () =>
      todaysJobs
        .filter((job) => job.location_lat != null && job.location_lng != null)
        .map((job) => ({
          id: job.id,
          lat: job.location_lat as number,
          lng: job.location_lng as number,
          label: job.customers?.name?.split(" ")[0] || formatJobTime(job.scheduled_time),
          active: job.id === currentJob?.id,
        })),
    [todaysJobs, currentJob?.id],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    eta.refresh();
    setRefreshing(false);
    toast.success("Schedule refreshed");
  };

  /** Opens in-app turn-by-turn guidance instead of handing off to an external maps app. */
  const openDirections = (job: TechJob) => {
    if (job.location_lat == null && job.location_lng == null && !job.location_address) {
      toast.error("This job has no location to navigate to");
      return;
    }
    navigate(`/tech-app/navigate/${job.id}`);
  };

  // NAVIGATE → marks en route (dispatch lifecycle) and opens turn-by-turn directions.
  const handleNavigate = async () => {
    if (!currentJob || actionPending) return;
    setActionPending("navigate");
    setActionError(null);
    try {
      if (!EN_ROUTE_STATES.has(currentStatus)) {
        const { error } = await updateTechJobDispatchStatus(
          currentJob.id,
          "en_route",
          undefined,
          Boolean(currentJob.is_fleet),
          // Stable key: repeated taps / offline replays resolve to one transition.
          { idempotencyKey: `tech_mission:${currentJob.id}:en_route` },
        );
        if (error) {
          setActionError(error);
          toast.error(error);
          return;
        }
        await fetchData();
      }
      openDirections(currentJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not mark you en route";
      setActionError(message);
      toast.error(message);
    } finally {
      setActionPending(null);
    }
  };

  // START APPOINTMENT → same backend transition the appointment start button performs
  // (update_dispatch_status → in_progress), guarded by the same idempotency lock.
  const handleStartAppointment = async () => {
    if (!currentJob || actionPending) return;
    setActionPending("start");
    setActionError(null);
    try {
      if (!isStarted) {
        const { error } = await updateTechJobDispatchStatus(
          currentJob.id,
          "in_progress",
          undefined,
          Boolean(currentJob.is_fleet),
          { idempotencyKey: `tech_mission:${currentJob.id}:in_progress` },
        );
        if (error) {
          setActionError(error);
          toast.error(error);
          return;
        }
        toast.success("Appointment started");
        await fetchData();
      }
      navigate(`/tech-app/jobs/${currentJob.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the appointment";
      setActionError(message);
      toast.error(message);
    } finally {
      setActionPending(null);
    }
  };

  // Phase 3 — one presence + job state ladder. Every field transition goes through
  // this handler so shift and job state can never disagree.
  const handlePresenceAction = async (action: TechPresenceAction) => {
    if (presencePending) return;
    setPresencePending(action);
    setActionError(null);
    try {
      if (action === "clock_in" || action === "clock_out" || action === "break_start" || action === "break_end") {
        if (action === "clock_out") {
          navigate("/tech-app/shift-review");
          return;
        }
        if (action === "clock_in") await clockIn();
        if (action === "break_start") await startBreak();
        if (action === "break_end") await endBreak();
        trackTechShiftTransition({ action, technician_id: identity?.techId, succeeded: true });
        await fetchData();
        return;
      }

      if (!currentJob) return;

      if (action === "open_job" || action === "complete") {
        // Completion requires evidence — it is enforced in the job workspace.
        navigate(`/tech-app/jobs/${currentJob.id}`);
        return;
      }

      if (action === "en_route") {
        await handleNavigate();
        trackTechNavigation({
          job_id: currentJob.id,
          action: "directions_opened",
          distance_miles: eta.distanceMiles,
          duration_minutes: eta.durationMinutes,
          succeeded: true,
        });
        return;
      }

      const targetStatus = action === "arrived" ? "arrived" : "in_progress";
      const { error } = await updateTechJobDispatchStatus(
        currentJob.id,
        targetStatus,
        undefined,
        Boolean(currentJob.is_fleet),
        { idempotencyKey: `tech_mission:${currentJob.id}:${targetStatus}` },
      );
      trackTechJobTransition({
        job_id: currentJob.id,
        job_source: currentJob.is_fleet ? "fleet_work_order" : "appointment",
        from_status: currentStatus,
        to_status: targetStatus,
        succeeded: !error,
        error: error ?? null,
        idempotency_key: `tech_mission:${currentJob.id}:${targetStatus}`,
      });
      if (error) {
        setActionError(error);
        toast.error(error);
        return;
      }
      await fetchData();
      if (targetStatus === "in_progress") navigate(`/tech-app/jobs/${currentJob.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update your status";
      setActionError(message);
      toast.error(message);
    } finally {
      setPresencePending(null);
    }
  };




  // EMAIL ETA → shop-branded customer email with the live traffic ETA.
  const handleEmailEta = async () => {
    if (!currentJob || actionPending) return;
    if (currentJob.is_fleet) {
      toast.error("Fleet work orders have no customer email");
      return;
    }
    setActionPending("eta");
    setActionError(null);
    try {
      const { deduped } = await sendTechnicianEtaEmail({
        appointmentId: currentJob.id,
        etaMinutes: eta.durationMinutes,
        etaLabel: eta.etaLabel,
        distanceMiles: eta.distanceMiles,
      });
      toast.success(deduped ? "ETA already sent moments ago" : "ETA emailed to the customer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not email the ETA";
      setActionError(message);
      toast.error(message);
    } finally {
      setActionPending(null);
    }
  };

  if (loading || identityLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-6 md:max-w-5xl md:px-8" style={{ backgroundColor: SURFACE }}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-24" style={{ backgroundColor: SURFACE, color: TEXT }}>
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 md:max-w-5xl md:px-8">
        <section className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">Good day, {firstName}</h1>
            <p className="text-sm" style={{ color: MUTED }}>
              {format(new Date(), "EEEE, MMMM d")}
              {" • "}
              <span className="font-semibold" style={{ color: shift.isOnShift ? ACCENT : MUTED }}>
                {shift.isOnBreak ? "On break" : shift.isOnShift ? "On shift" : "Off shift"}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl border-black/10 bg-white"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh schedule"
          >
            <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} style={{ color: ACCENT }} />
          </Button>
        </section>

        <TechPresenceActionBar
          accent={ACCENT}
          muted={MUTED}
          isOnShift={shift.isOnShift}
          isOnBreak={shift.isOnBreak}
          jobStatus={currentJob ? currentStatus : null}
          hasJob={Boolean(currentJob)}
          pendingAction={presencePending}
          errorMessage={actionError}
          onAction={handlePresenceAction}
        />

        {/* UP NEXT */}
        <section className="space-y-2">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: MUTED }}>
            Up Next
          </h2>

          {currentJob ? (
            <div
              className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              style={{ borderLeft: `6px solid ${ACCENT}` }}
            >
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-extrabold leading-tight">{currentJob.customers?.name || "Customer"}</h3>
              <p className="mt-1 text-base" style={{ color: MUTED }}>
                {currentJob.fleet_job_number ? `${currentJob.fleet_job_number} · ` : ""}{serviceLabel(currentJob)}
              </p>
                  </div>
                  <span
                    className="rounded-lg px-3 py-1.5 font-mono text-xs font-extrabold"
                    style={{ backgroundColor: "#e7ecff", color: ACCENT }}
                  >
                    {formatJobTime(currentJob.scheduled_time)}
                  </span>
                </div>

                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3 font-mono text-sm"
                  style={{ borderColor: "#e6e7ea", color: MUTED }}
                >
                  <span className="flex items-center gap-2">
                    <Car className="h-4 w-4" /> {vehicleLabel(currentJob)}
                  </span>
                  <span className="flex items-center gap-2" style={{ color: ACCENT }}>
                    <MapPin className="h-4 w-4" />
                    {eta.distanceMiles != null ? `${eta.distanceMiles.toFixed(1)} mi` : "-- mi"}
                  </span>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: MUTED }}>
                      Status
                    </p>
                    <p className="text-xl font-extrabold" style={{ color: ACCENT }}>
                      {isStarted
                        ? STATUS_COPY[currentStatus] || currentStatus
                        : eta.etaLabel
                          ? `ETA: ${eta.etaLabel}`
                          : eta.loading
                            ? "Calculating ETA…"
                            : STATUS_COPY[currentStatus] || currentStatus.replace(/_/g, " ")}
                    </p>
                    {eta.durationMinutes != null && !isStarted && (
                      <p className="text-xs" style={{ color: MUTED }}>
                        {Math.round(eta.durationMinutes)} min drive · live traffic
                      </p>
                    )}
                    {eta.error && (
                      <p className="text-xs" style={{ color: MUTED }}>
                        {eta.error}
                      </p>
                    )}
                    {actionError && (
                      <p className="mt-1 max-w-[260px] text-xs font-semibold text-red-600">{actionError}</p>
                    )}
                  </div>

                  {hasDeparted ? (
                    <Button
                      className="h-14 min-w-[190px] rounded-xl text-base font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-70"
                      style={{ backgroundColor: ACCENT }}
                      onClick={handleStartAppointment}
                      disabled={actionPending !== null}
                    >
                      {actionPending === "start" ? (
                        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-5 w-5" />
                      )}
                      {actionPending === "start"
                        ? "Starting…"
                        : isStarted
                          ? "Open Appointment"
                          : "Start Appointment"}
                    </Button>
                  ) : (
                    <Button
                      className="h-14 min-w-[190px] rounded-xl text-base font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-70"
                      style={{ backgroundColor: ACCENT }}
                      onClick={handleNavigate}
                      disabled={actionPending !== null}
                    >
                      {actionPending === "navigate" ? (
                        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Navigation className="mr-2 h-5 w-5" />
                      )}
                      {actionPending === "navigate" ? "Marking en route…" : "Navigate"}
                    </Button>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl border-black/10 bg-white text-sm font-extrabold uppercase tracking-[0.08em]"
                  style={{ color: ACCENT }}
                  onClick={handleEmailEta}
                  disabled={actionPending !== null || Boolean(currentJob.is_fleet)}
                >
                  {actionPending === "eta" ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {actionPending === "eta" ? "Sending ETA…" : "Email ETA to customer"}
                </Button>

              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-8 text-center shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
              <ClipboardList className="mx-auto mb-3 h-10 w-10" style={{ color: MUTED }} />
              <h3 className="text-xl font-extrabold">No jobs assigned</h3>
              <p className="mt-1 text-sm" style={{ color: MUTED }}>
                Dispatch will assign your next job shortly.
              </p>
            </div>
          )}
        </section>

        {/* MAP */}
        <section className="space-y-2">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: MUTED }}>
            Route Map
          </h2>
          <TechMissionMap
            stops={mapStops}
            origin={eta.origin}
            routeGeometry={eta.geometry}
            accent={ACCENT}
            onExpand={() => navigate("/tech-app/route")}
          />
        </section>

        {/* SCHEDULE */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold">Today's Following</h2>
            <span className="font-mono text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              {remainingCount} remaining
            </span>
          </div>
          <div className="space-y-3">
            {scheduleJobs.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                <p className="font-bold">No more jobs today</p>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  Check Jobs for upcoming work.
                </p>
              </div>
        ) : (
          scheduleJobs.map((job) => {
            const groupChildren = job.fleet_children ?? [];
            const isGroup = groupChildren.length > 0 && Boolean(job.fleet_job_id);
            const groupKey = job.fleet_job_id ?? job.id;
            const expanded = expandedGroups.has(groupKey);

            return (
              <div key={groupKey} className="space-y-2">
                <button
                  className="grid w-full grid-cols-[76px_1fr_20px] items-center gap-2 text-left"
                  onClick={() => (isGroup ? toggleGroup(groupKey) : navigate(`/tech-app/jobs/${job.id}`))}
                >
                  <span className="font-mono text-sm font-extrabold leading-tight">{formatJobTime(job.scheduled_time)}</span>
                  <span className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                    <span>
                      <span className="block text-lg font-bold leading-snug">{job.customers?.name || "Customer"}</span>
                      <span className="mt-0.5 block text-sm leading-snug" style={{ color: MUTED }}>
                        {vehicleLabel(job)} · {serviceLabel(job)}
                      </span>
                    </span>
                    {isGroup && expanded ? (
                      <ChevronDown className="h-5 w-5 flex-shrink-0" style={{ color: MUTED }} />
                    ) : (
                      <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: MUTED }} />
                    )}
                  </span>
                </button>
                {isGroup && expanded && (
                  <div className="ml-[76px] space-y-2 border-l-2 pl-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    {groupChildren.map((child, childIndex) => {
                      const childVehicle = vehicleLabel(child);
                      return (
                        <button
                          key={child.id}
                          className="flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3 text-left shadow-[0_1px_6px_rgba(0,0,0,0.06)]"
                          onClick={() => navigate(`/tech-app/jobs/${child.id}`)}
                        >
                          <span>
                            <span className="block text-sm font-bold leading-snug">
                              {childVehicle === "Vehicle TBD" ? `Vehicle ${childIndex + 1}` : childVehicle}
                            </span>
                            <span className="block text-xs leading-snug" style={{ color: MUTED }}>
                              {serviceLabel(child)}
                            </span>
                          </span>
                          <span
                            className="rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize"
                            style={{ background: "rgba(0,0,0,0.06)", color: MUTED }}
                          >
                            {getTechMissionEffectiveStatus(child).replace(/_/g, " ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
          </div>
        </section>

        {/* MISSION BOARD — blockers, schedule changes, evidence, parts + data quality */}
        <TechMissionAlerts
          accent={ACCENT}
          muted={MUTED}
          missionBoard={missionBoard}
          dataQualityAlerts={dataQualityAlerts}
          partsInVan={stats.partsInVan}
          onOpenJob={(jobId) => navigate(`/tech-app/jobs/${jobId}`)}
        />

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
            <span className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              <Wrench className="h-4 w-4" style={{ color: ACCENT }} /> Done
            </span>
            <p className="text-xl font-extrabold">
              {completeCount}/{todaysJobs.length}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
            <span className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              <Gauge className="h-4 w-4" style={{ color: ACCENT }} /> Goal
            </span>
            <p className="text-xl font-extrabold">{dailyGoal}%</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              Hours
            </span>
            <p className={cn("text-xl font-extrabold", stats.openIssues > 0 && "")}>{stats.hoursLogged}</p>
          </div>
        </section>

        <Button
          variant="outline"
          className="h-12 w-full rounded-xl border-black/10 bg-white text-sm font-extrabold uppercase tracking-[0.08em]"
          style={{ color: ACCENT }}
          onClick={() => navigate("/tech-app/shift-review")}
        >
          End of shift review
        </Button>
      </main>
    </div>
  );
}
