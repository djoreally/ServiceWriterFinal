/**
 * DispatchBoard - the dispatcher's day at a glance.
 *
 * Axis commitment (minc): precision leads. An instrument panel that reads
 * like a foreman talks: unassigned work first, tech lanes below, status
 * visible on every job without opening anything.
 *
 * Cognitive-load rules enforced here:
 * - Unassigned jobs live in ONE place (the tray), never duplicated on the timeline.
 * - Every job block/card carries its status pill + mono time + customer phone.
 * - Assign in two taps: open job -> pick tech chip -> Assign.
 * - Accent (primary) budget: active segmented controls, dialog CTA, focus rings.
 *   Status is carried by pastel semantic pills, never the signal color.
 * - Type scale: H1 30 / H2 24 / H3 18 / body 16 / compact 14 / caption 12 / mono 14.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchDispatchBoardData,
  subscribeToDispatchChanges,
  type DispatchTechnician as Technician,
  type DispatchVan as Van,
  type DispatchJob as Job,
} from "@/application/queries";
import {
  assignTechnician,
  assignVan as assignVanCmd,
  unassignAppointment,
} from "@/application/commands";
import { validateAssignment } from "@/lib/dispatch-guardrails";
import { CommitButton } from "@/components/ui/commit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarView, type CalendarAppointment } from "@/components/appointments/CalendarView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  RefreshCw,
  Send,
  Truck,
  User,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  isClosedDispatchJob,
  normalizeTechnicianStatus,
  type TechnicianOperationalStatus,
} from "@/lib/dispatch-state";
import {
  logUnknownOperationalStateForTriage,
} from "@/lib/command-center-state";
import { isVisibleInActiveDispatchLanes } from "@/lib/dispatch-board-visibility";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { useAuth } from "@packages/auth";
import { emitDispatchCommandVisibilityDelta } from "@/lib/dispatch-telemetry";
import { getSemanticStatus } from "@/lib/semantic-status";

// ─── Types ─────────────────────────────────────────────────────────────────

// Types imported from application layer - see dispatch.query.ts

const TECHNICIAN_STATUS_ICONS: Record<TechnicianOperationalStatus, typeof CheckCircle2> = {
  available: CheckCircle2,
  busy: Clock,
  en_route: Truck,
  on_site: User,
  on_job: Wrench,
  on_break: Coffee,
  offline: XCircle,
  unavailable: XCircle,
};

const STATUS_CONFIG = Object.fromEntries(
  (Object.keys(TECHNICIAN_STATUS_ICONS) as TechnicianOperationalStatus[]).map((status) => {
    const semantic = getSemanticStatus("technician", status);
    return [status, {
      label: semantic.label,
      color: semantic.dotClass,
      icon: TECHNICIAN_STATUS_ICONS[status],
    }];
  }),
) as Record<TechnicianOperationalStatus, { label: string; color: string; icon: typeof CheckCircle2 }>;

// Timeline hours: 08:00 – 20:00
const TIMELINE_START = 8;
const TIMELINE_END = 20;
const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END - TIMELINE_START + 1 },
  (_, i) => TIMELINE_START + i
);

// ─── Helpers ───────────────────────────────────────────────────────────────

function timeToPercent(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMinutes = (h - TIMELINE_START) * 60 + (m || 0);
  const rangeMinutes = (TIMELINE_END - TIMELINE_START) * 60;
  return Math.max(0, Math.min(100, (totalMinutes / rangeMinutes) * 100));
}

function durationToPercent(minutes: number): number {
  const rangeMinutes = (TIMELINE_END - TIMELINE_START) * 60;
  return Math.max(2, (minutes / rangeMinutes) * 100);
}

function getCustomerName(job: Job): string {
  return job.customer?.name || job.guest_name || "—";
}

function getJobStatus(job: Job) {
  // dispatch_status is the operational truth; fall back to status.
  const raw = job.dispatch_status && job.dispatch_status !== "scheduled"
    ? job.dispatch_status
    : job.status;
  return getSemanticStatus("appointment", raw);
}

function isPriorityJob(job: Job): boolean {
  const p = (job.job_priority || "").toLowerCase();
  return p === "high" || p === "urgent" || p === "emergency";
}

// ─── Small presentational pieces ───────────────────────────────────────────

function StatusPill({ job, className }: { job: Job; className?: string }) {
  const semantic = getJobStatus(job);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        semantic.badgeClass,
        className
      )}
    >
      {semantic.label}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h2 className="text-2xl font-semibold tracking-tight mt-0.5">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number;
  accent?: "amber" | "neutral" | "success";
  sub?: string;
}) {
  return (
    <Card className={cn(
      "overflow-hidden",
      accent === "amber" && "border-l-4 border-l-amber-400",
      accent === "success" && "border-l-4 border-l-emerald-500/60",
    )}>
      <CardContent className="p-4">
        <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Timeline Job Block ─────────────────────────────────────────────────────

function TimelineJobBlock({
  job,
  isDragging,
  onDragStart,
  onDragEnd,
  onSelect,
  formatTime,
}: {
  job: Job;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onSelect?: () => void;
  formatTime: (t: string) => string;
}) {
  const left  = timeToPercent(job.scheduled_time);
  const width = durationToPercent(job.estimated_duration_minutes || 60);
  const timeLabel = formatTime(job.scheduled_time.substring(0, 5));
  const isCompleted = isClosedDispatchJob(job);
  const semantic = getJobStatus(job);

  return (
    <div
      draggable={!isCompleted}
      onDragStart={(e) => {
        if (isCompleted) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("jobId", job.id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "absolute top-1 bottom-1 rounded-md flex items-start px-2 py-1 text-xs font-medium overflow-hidden border transition-all",
        !isCompleted && "cursor-grab active:cursor-grabbing hover:opacity-90",
        isCompleted
          ? "bg-muted/60 border-border text-muted-foreground opacity-60 cursor-default"
          : "bg-card border-border text-foreground shadow-sm",
        isDragging && "opacity-40"
      )}
      style={{ left: `${left}%`, width: `${width}%`, minWidth: "72px" }}
      title={`${timeLabel} — ${job.service_catalog?.name || job.title} (${getCustomerName(job)}) — ${semantic.label}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
    >
      <div className="leading-tight min-w-0 w-full space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", semantic.dotClass)} />
          <span className="font-mono text-xs font-semibold">{timeLabel}</span>
        </div>
        <p className="truncate font-semibold">{job.service_catalog?.name || job.title}</p>
        <p className="truncate text-xs text-muted-foreground">{getCustomerName(job)}</p>
      </div>
    </div>
  );
}

// ─── Timeline Grid ──────────────────────────────────────────────────────────

interface TimelineLane {
  id: string;
  label: string;
  sublabel?: string;
  dotColor?: string;
  jobs: Job[];
  noTech?: boolean;
  acceptDrop?: boolean; // whether this lane can receive drops
}

function TimelineGrid({
  lanes,
  draggedJobId,
  dropTargetId,
  onDragStartJob,
  onDragEndJob,
  onDragOverLane,
  onDragLeaveLane,
  onDropLane,
  onSelectJob,
  formatTime,
}: {
  lanes: TimelineLane[];
  draggedJobId: string | null;
  dropTargetId: string | null;
  onDragStartJob: (jobId: string) => void;
  onDragEndJob: () => void;
  onDragOverLane: (laneId: string, e: React.DragEvent) => void;
  onDragLeaveLane: () => void;
  onDropLane: (laneId: string, e: React.DragEvent) => void;
  onSelectJob: (job: Job) => void;
  formatTime: (t: string) => string;
}) {
  // Format hour labels using the same formatTime helper (pass "HH:00")
  const hourLabel = (h: number) =>
    formatTime(`${h.toString().padStart(2, "0")}:00`);

  return (
    <div className="border rounded-lg overflow-hidden overflow-x-auto bg-card">
      {/* Column headers */}
      <div className="flex border-b bg-muted/40 min-w-[640px]">
        <div className="w-48 shrink-0 border-r px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tech / Van
        </div>
        <div className="flex-1">
          <div className="flex">
            {TIMELINE_HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0 font-mono"
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      {lanes.map((lane, idx) => {
        const isDropTarget = dropTargetId === lane.id && lane.acceptDrop;
        return (
          <div
            key={lane.id}
            className={cn(
              "flex border-b last:border-b-0 min-w-[640px] transition-colors",
              idx % 2 === 1 && "bg-muted/10",
              isDropTarget && "bg-primary/5 ring-2 ring-inset ring-primary/40"
            )}
            onDragOver={lane.acceptDrop ? (e) => onDragOverLane(lane.id, e) : undefined}
            onDragLeave={lane.acceptDrop ? onDragLeaveLane : undefined}
            onDrop={lane.acceptDrop ? (e) => onDropLane(lane.id, e) : undefined}
          >
            {/* Lane label */}
            <div className="w-48 shrink-0 border-r px-4 py-3 flex items-center gap-2">
              {lane.dotColor && (
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", lane.dotColor)} />
              )}
              <div className="min-w-0">
                <p className={cn(
                  "text-sm font-semibold truncate",
                  lane.noTech && "text-muted-foreground"
                )} title={lane.label}>
                  {lane.label}
                </p>
                {lane.sublabel && (
                  <p className="text-xs text-muted-foreground truncate" title={lane.sublabel}>{lane.sublabel}</p>
                )}
              </div>
            </div>

            {/* Timeline area */}
            <div className="flex-1 relative py-2" style={{ minHeight: "60px" }}>
              {/* Grid lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {TIMELINE_HOURS.map((h) => (
                  <div key={h} className="flex-1 border-r last:border-r-0 border-border/30" />
                ))}
              </div>

              {/* Jobs or empty state */}
              {lane.jobs.length === 0 ? (
                <p className={cn(
                  "absolute inset-0 flex items-center justify-center text-xs",
                  isDropTarget ? "text-primary font-medium" : "text-muted-foreground/60"
                )}>
                  {isDropTarget ? "Drop to assign here" : "—"}
                </p>
              ) : (
                lane.jobs.map((job) => (
                  <TimelineJobBlock
                    key={job.id}
                    job={job}
                    isDragging={draggedJobId === job.id}
                    onDragStart={() => onDragStartJob(job.id)}
                    onDragEnd={onDragEndJob}
                    onSelect={() => onSelectJob(job)}
                    formatTime={formatTime}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Unassigned Job Card ────────────────────────────────────────────────────

function UnassignedJobCard({
  job,
  onAssign,
  onDragStart,
  onDragEnd,
  isDragging,
  formatTime,
}: {
  job: Job;
  onAssign: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  formatTime: (t: string) => string;
}) {
  const timeLabel = formatTime(job.scheduled_time.substring(0, 5));
  const priority = isPriorityJob(job);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("jobId", job.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onAssign}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onAssign();
      }}
      className={cn(
        "border rounded-lg p-4 bg-card w-full sm:w-[320px] cursor-pointer transition-all select-none",
        "hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        priority && "border-l-4 border-l-amber-400",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums">{timeLabel}</span>
        <div className="flex items-center gap-1.5">
          {priority && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Priority
            </span>
          )}
          <StatusPill job={job} />
        </div>
      </div>

      <p className="text-base font-semibold mt-2 leading-snug" title={job.service_catalog?.name || job.title}>
        {job.service_catalog?.name || job.title}
      </p>
      <p className="text-sm text-muted-foreground mt-0.5 truncate" title={getCustomerName(job)}>
        {getCustomerName(job)}
      </p>

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="min-w-0 text-xs text-muted-foreground space-y-0.5">
          {job.customer?.phone && (
            <p className="font-mono text-sm truncate" title={job.customer.phone}>{job.customer.phone}</p>
          )}
          {job.vehicle && (
            <p className="truncate">
              {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAssign();
          }}
        >
          Assign
        </Button>
      </div>
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function DispatchBoardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading dispatch board">
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-card animate-pulse" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      </div>
      <div className="h-72 rounded-lg border bg-card animate-pulse" />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DispatchBoard() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { formatTime } = useRegionalSettings();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [vans, setVans] = useState<Van[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "all">("day");
  const [dispatchView, setDispatchView] = useState<"timeline" | "calendar">("timeline");
  const [viewType, setViewType] = useState<"van" | "team">("van");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedTech, setSelectedTech] = useState<string>("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  // Drag-and-drop state
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchDispatchBoardData(selectedDate, viewMode);
      setTechnicians(data.technicians);
      setVans(data.vans);
      setJobs(data.jobs);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dispatch jobs";
      console.error("Failed to load dispatch jobs", error);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, viewMode]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
    let cleanup: (() => void) | null = null;
    void Promise.resolve().then(() => subscribeToDispatchChanges(fetchData).then((fn) => {
      cleanup = fn;
    }));
    return () => {
      cleanup?.();
    };
  }, [fetchData]);

  // ── Technician email notification helper ───────────────────────────────────

  const sendTechnicianAssignmentEmail = async (job: Job, techId: string) => {
    // ENTERPRISE: Technician assignment emails are now event-driven via DB triggers.
    // When assigned_technician_id is updated on the appointments table,
    // the trigger auto-enqueues a technician_assignment email.
    // No client-side email dispatch needed.
    console.info("[DispatchBoard] Technician email will be sent via event-driven queue");
  };

  // ── Assign dialog ──────────────────────────────────────────────────────────

  /**
   * CommitButton-compatible assign: throws on failure so the error renders
   * on the button. Idempotency key accepted for future server support —
   * the API has no dedupe endpoint yet.
   */
  const commitAssignJob = async (_idempotencyKey: string) => {
    if (!selectedJob || !selectedTech) throw new Error("Pick a technician first.");
    setAssigning(true);
    try {
      // ── Guardrail: validate before assigning ──
      const validation = await validateAssignment(
        selectedTech,
        selectedJob.scheduled_date,
        selectedJob.scheduled_time,
        selectedJob.estimated_duration_minutes || 60,
        selectedJob.id
      );

      if (!validation.valid) {
        throw new Error(validation.errors[0] || "Cannot assign job");
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(w => toast.warning(w));
      }

      await assignTechnician(selectedJob.id, selectedTech, dispatchNotes || null);
      await sendTechnicianAssignmentEmail(selectedJob, selectedTech);
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignSuccess = () => {
    const techName = technicians.find(t => t.id === selectedTech)?.name || "technician";
    const jobLabel = selectedJob?.service_catalog?.name || selectedJob?.title || "Job";
    toast.success(`Assigned to ${techName}`, {
      description: `${jobLabel} — ${selectedJob ? formatTime(selectedJob.scheduled_time.substring(0, 5)) : ""}`,
    });
    setAssignDialogOpen(false);
    setSelectedJob(null);
    setSelectedTech("");
    setDispatchNotes("");
    fetchData();
  };

  const openAssignDialog = (job: Job) => {
    setSelectedJob(job);
    setSelectedTech(job.assigned_technician_id || "");
    setDispatchNotes(job.dispatch_notes || "");
    setAssignDialogOpen(true);
  };

  const handleUnassignJob = async () => {
    if (!selectedJob) return;
    setUnassigning(true);
    try {
      await unassignAppointment(selectedJob.id);
      toast.success("Job moved back to unassigned queue");
      setAssignDialogOpen(false);
      setSelectedJob(null);
      setSelectedTech("");
      setDispatchNotes("");
      fetchData();
    } catch {
      toast.error("Failed to unassign job");
    } finally {
      setUnassigning(false);
    }
  };

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragStartJob = (jobId: string) => {
    setDraggedJobId(jobId);
  };

  const handleDragEndJob = () => {
    if (dragTimeout.current) clearTimeout(dragTimeout.current);
    dragTimeout.current = setTimeout(() => {
      setDraggedJobId(null);
      setDropTargetId(null);
    }, 100);
  };

  const handleDragOverLane = (laneId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(laneId);
  };

  const handleDragLeaveLane = () => {
    // Slight delay to avoid flicker when moving between child elements
    dragTimeout.current = setTimeout(() => setDropTargetId(null), 50);
  };

  const handleDropLane = async (laneId: string, e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("jobId") || draggedJobId;
    setDraggedJobId(null);
    setDropTargetId(null);

    if (!jobId || laneId.startsWith("__")) return;

    const job = jobs.find(j => j.id === jobId);
    if (!job || isClosedDispatchJob(job)) return;

    try {
      // Determine if lane is a technician or a van
      const isTech = technicians.some(t => t.id === laneId);
      if (isTech) {
        // ── Guardrail: validate before assigning ──
        const validation = await validateAssignment(
          laneId,
          job.scheduled_date,
          job.scheduled_time,
          job.estimated_duration_minutes || 60,
          job.id // exclude self in case of reassignment
        );

        if (!validation.valid) {
          toast.error(validation.errors[0] || "Cannot assign job");
          return;
        }

        if (validation.warnings.length > 0) {
          validation.warnings.forEach(w => toast.warning(w));
        }

        await assignTechnician(jobId, laneId);
        await sendTechnicianAssignmentEmail(job, laneId);
        const techName = technicians.find(t => t.id === laneId)?.name || "technician";
        toast.success(`Assigned to ${techName}`);
      } else {
        await assignVanCmd(jobId, laneId);
        const vanName = vans.find(v => v.id === laneId)?.name || "van";
        toast.success(`Assigned to ${vanName}`);
      }
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign job via drag");
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  useEffect(() => {
    jobs.forEach((job) => {
      logUnknownOperationalStateForTriage(
        { jobId: job.id, tenantId: userId, status: job.status, dispatch_status: job.dispatch_status },
        "dispatch_board"
      );
    });
  }, [jobs, userId]);

  // ALL jobs visible — dispatch never loses sight of anything
  const allJobs = jobs;
  const activeJobs = allJobs.filter((job) => isVisibleInActiveDispatchLanes(job));
  const completedJobs = allJobs.filter((job) => isClosedDispatchJob(job) && (job.status === "completed" || job.dispatch_status === "completed"));
  const cancelledJobs = allJobs.filter((job) => job.status === "cancelled" || job.status === "canceled" || job.dispatch_status === "cancelled");

  useEffect(() => {
    emitDispatchCommandVisibilityDelta({
      tenantId: userId,
      source: "dispatch_board",
      activeCount: activeJobs.length,
    });
  }, [activeJobs.length, userId]);

  const unassignedJobs = activeJobs.filter(j => !j.assigned_technician_id && !j.assigned_van_id);
  const assignedActiveJobs = activeJobs.filter(j => j.assigned_technician_id || j.assigned_van_id);

  // Build timeline lanes — unassigned jobs live in the tray above, never duplicated here.
  const buildLanes = (): TimelineLane[] => {
    const lanes: TimelineLane[] = [];

    if (viewType === "van") {
      vans.forEach(van => {
        const techName = technicians.find(t => t.id === van.assigned_technician_id)?.name;
        const vanJobs = allJobs.filter((j) => {
          // Primary: explicitly assigned to this van
          if (j.assigned_van_id === van.id) return true;

          // Fallback: if job is assigned to the technician currently assigned to this van,
          // show it on the van lane even when assigned_van_id is not explicitly set.
          return (
            !j.assigned_van_id &&
            !!van.assigned_technician_id &&
            j.assigned_technician_id === van.assigned_technician_id
          );
        });
        lanes.push({
          id: van.id,
          label: van.name,
          sublabel: techName ? `${techName} • ${vanJobs.length} job${vanJobs.length !== 1 ? "s" : ""}` : `${vanJobs.length} job${vanJobs.length !== 1 ? "s" : ""}`,
          dotColor: van.status === "active" ? "bg-emerald-500" : "bg-muted-foreground",
          jobs: vanJobs,
          acceptDrop: true,
        });
      });
    } else {
      technicians.forEach(tech => {
        const normalizedStatus = normalizeTechnicianStatus(tech.status);
        const statusConfig = STATUS_CONFIG[normalizedStatus];
        const techJobs = allJobs.filter(j => j.assigned_technician_id === tech.id);
        lanes.push({
          id: tech.id,
          label: tech.name,
          sublabel: `${statusConfig.label} • ${techJobs.length} job${techJobs.length !== 1 ? "s" : ""}`,
          dotColor: statusConfig.color,
          jobs: techJobs,
          acceptDrop: true,
        });
      });
    }

    // No-tech row
    const noTechJobs = activeJobs.filter(j => !j.assigned_technician_id && j.assigned_van_id);
    if (noTechJobs.length > 0 || (technicians.length === 0 && vans.length === 0)) {
      lanes.push({
        id: "__no_tech__",
        label: "No technician assigned",
        dotColor: undefined,
        jobs: noTechJobs,
        noTech: true,
        acceptDrop: false,
      });
    }

    // Completed lane — full visibility, never hidden
    if (completedJobs.length > 0) {
      lanes.push({
        id: "__completed__",
        label: "Completed",
        sublabel: `${completedJobs.length} done`,
        dotColor: "bg-emerald-500",
        jobs: completedJobs,
        acceptDrop: false,
      });
    }

    // Cancelled lane — audit trail
    if (cancelledJobs.length > 0) {
      lanes.push({
        id: "__cancelled__",
        label: "Cancelled",
        sublabel: `${cancelledJobs.length} cancelled`,
        dotColor: "bg-muted-foreground",
        jobs: cancelledJobs,
        acceptDrop: false,
      });
    }

    return lanes;
  };

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <DispatchBoardSkeleton />;
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatch</p>
          <h1 className="text-[30px] font-semibold tracking-tight mt-0.5">Dispatch Board</h1>
        </div>
        <Card>
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-5 w-5 text-destructive" />
            </span>
            <div>
              <p className="text-lg font-semibold">Couldn&apos;t load the dispatch board</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {loadError} Your jobs are safe — this is a loading problem, not a data problem.
              </p>
            </div>
            <Button onClick={retryLoad} className="gap-2 mt-1">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lanes = buildLanes();
  const calendarAppointments: CalendarAppointment[] = allJobs.map((job) => ({
    id: job.id,
    title: job.service_catalog?.name || job.title,
    scheduled_date: job.scheduled_date,
    scheduled_time: job.scheduled_time,
    duration_minutes: job.estimated_duration_minutes || 60,
    status: job.status || "scheduled",
    customer: job.customer ? { name: job.customer.name } : (job.guest_name ? { name: job.guest_name } : null),
    vehicle: job.vehicle,
    service_catalog: job.service_catalog,
  }));

  const defaultBusinessHours = {
    opening_time: "08:00",
    closing_time: "20:00",
    working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  };

  const dateLabel = isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMM d");
  const attentionLabel = unassignedJobs.length === 0
    ? "everything's covered"
    : `${unassignedJobs.length} job${unassignedJobs.length !== 1 ? "s" : ""} need${unassignedJobs.length !== 1 ? "" : "s"} a tech`;

  return (
    <div className="space-y-8">
      {/* ── Header: one H1, one control bar ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatch</p>
          <h1 className="text-[30px] font-semibold tracking-tight mt-0.5">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {dateLabel} · {attentionLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
            Today
          </Button>
          <div className="flex border rounded-md overflow-hidden" role="group" aria-label="Date range">
            <Button
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("day")}
            >
              Day
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-l"
              onClick={() => setViewMode("week")}
            >
              Week
            </Button>
            <Button
              variant={viewMode === "all" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-l"
              onClick={() => setViewMode("all")}
            >
              All
            </Button>
          </div>
          <div className="flex border rounded-md overflow-hidden" role="group" aria-label="Board view">
            <Button
              variant={dispatchView === "timeline" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setDispatchView("timeline")}
            >
              Timeline
            </Button>
            <Button
              variant={dispatchView === "calendar" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-l gap-1"
              onClick={() => setDispatchView("calendar")}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </Button>
          </div>
          {dispatchView === "timeline" && (
            <div className="flex border rounded-md overflow-hidden" role="group" aria-label="Group lanes by">
              <Button
                variant={viewType === "van" ? "default" : "ghost"}
                size="sm"
                className="rounded-none gap-1"
                onClick={() => setViewType("van")}
              >
                <Truck className="h-3.5 w-3.5" /> Vans
              </Button>
              <Button
                variant={viewType === "team" ? "default" : "ghost"}
                size="sm"
                className="rounded-none gap-1 border-l"
                onClick={() => setViewType("team")}
              >
                <Users className="h-3.5 w-3.5" /> Team
              </Button>
            </div>
          )}
          <Button variant="outline" size="icon" onClick={retryLoad} title="Refresh" aria-label="Refresh dispatch board">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── KPI strip: the day in four numbers ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Today's dispatch summary">
        <KpiCard label="Need a tech" value={unassignedJobs.length} accent="amber" />
        <KpiCard label="Assigned" value={assignedActiveJobs.length} accent="neutral" />
        <KpiCard label="Completed" value={completedJobs.length} accent="success" />
        <KpiCard label="Total jobs" value={allJobs.length} accent="neutral" />
      </div>

      {/* ── Unassigned tray: the dispatcher's work queue ── */}
      <section aria-label="Unassigned jobs">
        <SectionHeader
          eyebrow="Needs attention"
          title="Unassigned jobs"
          action={draggedJobId ? (
            <p className="text-xs font-medium text-primary">Drop onto a tech or van lane below</p>
          ) : undefined}
        />
        {unassignedJobs.length === 0 ? (
          <div className="flex items-center gap-3 border rounded-lg p-5 bg-muted/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Every job has a tech. Nothing waiting in the queue{isToday(selectedDate) ? " today" : ` for ${format(selectedDate, "MMM d")}`}.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {unassignedJobs.map(job => (
              <UnassignedJobCard
                key={job.id}
                job={job}
                onAssign={() => openAssignDialog(job)}
                onDragStart={() => handleDragStartJob(job.id)}
                onDragEnd={handleDragEndJob}
                isDragging={draggedJobId === job.id}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Timeline ── */}
      <section aria-label="Dispatch timeline">
        <SectionHeader eyebrow="The day" title="Today's routes" />
        {dispatchView === "timeline" ? (
          lanes.length === 0 ? (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-base font-semibold">No lanes to show</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a van or technician to start building routes.
              </p>
            </div>
          ) : (
            <>
              <TimelineGrid
                lanes={lanes}
                draggedJobId={draggedJobId}
                dropTargetId={dropTargetId}
                onDragStartJob={handleDragStartJob}
                onDragEndJob={handleDragEndJob}
                onDragOverLane={handleDragOverLane}
                onDragLeaveLane={handleDragLeaveLane}
                onDropLane={handleDropLane}
                onSelectJob={openAssignDialog}
                formatTime={formatTime}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Drag a job onto a tech or van lane to assign it. Tap a job to see details and reassign.
              </p>
            </>
          )
        ) : (
          <CalendarView
            appointments={calendarAppointments}
            currentDate={selectedDate}
            onDateChange={setSelectedDate}
            onAppointmentClick={(appointment) => {
              const targetJob = jobs.find((j) => j.id === appointment.id);
              if (targetJob) openAssignDialog(targetJob);
            }}
            onDrop={() => toast.info("Use the timeline view to reassign technicians by drag-and-drop.")}
            onSlotClick={(date, time) => {
              toast.info(`Dispatch calendar slot selected: ${format(date, "MMM d, yyyy")} ${time}`);
            }}
            businessHours={defaultBusinessHours}
          />
        )}
      </section>

      {/* ── Assign dialog: tap a tech, hit assign — two taps ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">Assign job</DialogTitle>
            <DialogDescription>
              {selectedJob?.service_catalog?.name || selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {selectedJob && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm">{formatTime(selectedJob.scheduled_time.substring(0, 5))}</span>
                  <StatusPill job={selectedJob} className="ml-auto" />
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{getCustomerName(selectedJob)}</span>
                  {selectedJob.customer?.phone && (
                    <span className="font-mono text-sm text-muted-foreground ml-auto">{selectedJob.customer.phone}</span>
                  )}
                </div>
                {selectedJob.vehicle && (
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {selectedJob.vehicle.year} {selectedJob.vehicle.make} {selectedJob.vehicle.model}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label id="assign-tech-label">Pick a technician</Label>
              {technicians.length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-lg p-4">
                  No technicians on the roster. Add one in team settings to start assigning.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1" role="radiogroup" aria-labelledby="assign-tech-label">
                  {technicians.map((tech) => {
                    const normalizedStatus = normalizeTechnicianStatus(tech.status);
                    const cfg = STATUS_CONFIG[normalizedStatus];
                    const jobCount = jobs.filter(
                      j =>
                        j.assigned_technician_id === tech.id &&
                        isVisibleInActiveDispatchLanes(j)
                    ).length;
                    const atCapacity = tech.max_jobs_per_day > 0 && jobCount >= tech.max_jobs_per_day;
                    const isSelected = selectedTech === tech.id;
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedTech(tech.id)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          isSelected
                            ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                            : "hover:border-primary/40"
                        )}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", cfg?.color || "bg-muted")} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold truncate">{tech.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {cfg?.label} · {jobCount} active{atCapacity ? " · at capacity" : ""}
                          </span>
                        </span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dispatch-notes">Dispatch notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="dispatch-notes"
                placeholder="Gate code, parking notes, anything the tech needs…"
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setAssignDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              {(selectedJob?.assigned_technician_id || selectedJob?.assigned_van_id) && (
                <Button
                  variant="outline"
                  onClick={handleUnassignJob}
                  disabled={assigning || unassigning}
                  className="flex-1"
                >
                  Unassign
                </Button>
              )}
              <CommitButton
                onCommit={commitAssignJob}
                onSuccess={handleAssignSuccess}
                disabled={!selectedTech || unassigning}
                className="flex-1 gap-2"
              >
                <Send className="h-4 w-4" />
                Assign
              </CommitButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
