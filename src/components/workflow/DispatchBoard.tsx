/**
 * DispatchBoard - Real-time job dispatching with timeline Gantt view
 *
 * Features:
 * - Drag-and-drop job assignment onto technician/van lanes
 * - Completed jobs excluded from assignment flows
 * - Time format consistent with regional settings (12h / 24h)
 * - Timeline Gantt rows per van/tech
 * - Bottom stats: Fleet Stats | Inventory Summary | Service Coverage
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarView, type CalendarAppointment } from "@/components/appointments/CalendarView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clock,
  Wrench,
  Car,
  CalendarDays,
  CheckCircle2,
  Coffee,
  XCircle,
  Truck,
  Plus,
  Package,
  User,
  Send,
  Loader2,
  RefreshCw,
  MapPin,
  Users,
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
import { useNavigate } from "react-router-dom";
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
  on_site: MapPin,
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

// ─── Timeline Job Block ─────────────────────────────────────────────────────

function TimelineJobBlock({
  job,
  isUnassigned,
  isDragging,
  onDragStart,
  onDragEnd,
  onSelect,
  formatTime,
}: {
  job: Job;
  isUnassigned?: boolean;
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
        "absolute top-1 bottom-1 rounded flex items-start px-2 py-1 text-xs font-medium overflow-hidden border transition-all",
        !isCompleted && "cursor-grab active:cursor-grabbing hover:opacity-90",
        isCompleted
          ? "bg-muted border-border text-muted-foreground opacity-60 cursor-default"
          : isUnassigned
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-primary/15 border-primary/30 text-primary",
        isDragging && "opacity-40"
      )}
      style={{ left: `${left}%`, width: `${width}%`, minWidth: "60px" }}
      title={`${timeLabel} — ${job.service_catalog?.name || job.title} (${getCustomerName(job)})${isCompleted ? " [Completed]" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <div className="leading-tight min-w-0 w-full">
        <p className="truncate font-semibold">{timeLabel} • {job.service_catalog?.name || job.title}</p>
        <p className="truncate text-[11px] opacity-90">{getCustomerName(job)}</p>
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
  isUnassigned?: boolean;
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
    <div className="border rounded-lg overflow-hidden overflow-x-auto">
      {/* Column headers */}
      <div className="flex border-b bg-muted/40 min-w-[640px]">
        <div className="w-44 shrink-0 border-r px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Team / Van
        </div>
        <div className="flex-1">
          <div className="flex">
            {TIMELINE_HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0"
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
            <div className="w-44 shrink-0 border-r px-4 py-4 flex items-center gap-2">
              {lane.dotColor && (
                <span className={cn("h-2.5 w-2.5 rounded-md shrink-0", lane.dotColor)} />
              )}
              <div className="min-w-0">
                <p className={cn(
                  "text-xs font-bold tracking-wide truncate",
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
            <div className="flex-1 relative py-2" style={{ minHeight: "56px" }}>
              {/* Grid lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {TIMELINE_HOURS.map((h) => (
                  <div key={h} className="flex-1 border-r last:border-r-0 border-border/30" />
                ))}
              </div>

              {/* Jobs or empty state */}
              {lane.jobs.length === 0 ? (
                <p className={cn(
                  "absolute inset-0 flex items-center justify-center text-xs italic",
                  isDropTarget ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  {isDropTarget ? "Drop to assign here" : "No routes scheduled for this window"}
                </p>
              ) : (
                lane.jobs.map((job) => (
                  <TimelineJobBlock
                    key={job.id}
                    job={job}
                    isUnassigned={lane.isUnassigned}
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
  onReassign,
  onDragStart,
  onDragEnd,
  isDragging,
  formatTime,
}: {
  job: Job;
  onReassign: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  formatTime: (t: string) => string;
}) {
  const timeLabel = formatTime(job.scheduled_time.substring(0, 5));
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("jobId", job.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-4 border rounded-lg p-4 bg-card min-w-[260px] flex-1 cursor-grab active:cursor-grabbing transition-opacity select-none",
        isDragging && "opacity-50"
      )}
    >
      <div className="text-center shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</p>
        <p className="text-lg font-bold">{timeLabel}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" title={job.service_catalog?.name || job.title}>{job.service_catalog?.name || job.title}</p>
        <p className="text-xs text-muted-foreground">Customer: {getCustomerName(job)}</p>
      </div>
      <Button size="sm" onClick={onReassign}>
        Reassign
      </Button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DispatchBoard() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { formatTime } = useRegionalSettings();

  const [loading, setLoading] = useState(true);
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
  const [inventoryCount, setInventoryCount] = useState(0);

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
      setInventoryCount(data.inventoryCount);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    fetchData();
    let cleanup: (() => void) | null = null;
    void subscribeToDispatchChanges(fetchData).then((fn) => {
      cleanup = fn;
    });
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

  const handleAssignJob = async () => {
    if (!selectedJob || !selectedTech) return;
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
        toast.error(validation.errors[0] || "Cannot assign job");
        setAssigning(false);
        return;
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(w => toast.warning(w));
      }

      await assignTechnician(selectedJob.id, selectedTech, dispatchNotes || null);
      await sendTechnicianAssignmentEmail(selectedJob, selectedTech);

      toast.success("Job assigned successfully");
      setAssignDialogOpen(false);
      setSelectedJob(null);
      setSelectedTech("");
      setDispatchNotes("");
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign job");
    } finally {
      setAssigning(false);
    }
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
  const activeVans = vans.filter(v => v.status === "active").length;
  const inactiveVans = vans.length - activeVans;
  const totalZipCodes = vans.reduce((sum, v) => sum + (v.territory_count || 0), 0);

  // Build timeline lanes — ALL states visible, never hidden
  const buildLanes = (): TimelineLane[] => {
    const lanes: TimelineLane[] = [];

    // Waitlist — unassigned active jobs
    lanes.push({
      id: "__waitlist__",
      label: "WAITLIST",
      sublabel: `${unassignedJobs.length} unassigned`,
      dotColor: "bg-amber-400",
      jobs: unassignedJobs,
      isUnassigned: true,
      acceptDrop: false,
    });

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
          label: van.name.toUpperCase(),
          sublabel: techName ? `${techName} • ${vanJobs.length} jobs` : `${vanJobs.length} jobs`,
          dotColor: van.status === "active" ? "bg-gray-500" : "bg-muted-foreground",
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
          label: tech.name.toUpperCase(),
          sublabel: `${statusConfig.label} • ${techJobs.length} jobs`,
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
        label: "NO TECHNICIAN ASSIGNED",
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
        label: "COMPLETED",
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
        label: "CANCELLED",
        sublabel: `${cancelledJobs.length} cancelled`,
        dotColor: "bg-muted-foreground",
        jobs: cancelledJobs,
        acceptDrop: false,
      });
    }

    return lanes;
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

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your fleet and daily job assignments in real-time.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
            Today
          </Button>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "all" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("all")}
            >
              All
            </Button>
            <Button
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              className="rounded-none border-l"
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
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="flex border rounded-md overflow-hidden">
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
        </div>
      </div>

      {/* ── Lifecycle Status Summary — Central Authority ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="p-3">
            <p className="text-2xl font-bold">{unassignedJobs.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Unassigned</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-2xl font-bold">{assignedActiveJobs.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Assigned / Active</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <p className="text-2xl font-bold">{completedJobs.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Completed</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-muted-foreground">
          <CardContent className="p-3">
            <p className="text-2xl font-bold">{cancelledJobs.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Cancelled</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-3">
            <p className="text-2xl font-bold">{allJobs.length}</p>
            <p className="text-xs text-muted-foreground font-medium">Total Jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Unassigned Jobs ── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Unassigned Jobs</h2>
            {unassignedJobs.length > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs px-2">
                {unassignedJobs.length} Job{unassignedJobs.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block">
            Today's Schedule: {allJobs.length} jobs • {assignedActiveJobs.length} assigned • {unassignedJobs.length} pending • {completedJobs.length} completed
          </span>
        </div>

        {draggedJobId && (
          <p className="text-xs text-primary mb-2 animate-pulse">
            Drag onto a lane below to assign
          </p>
        )}

        {unassignedJobs.length === 0 ? (
          <div className="flex items-center gap-3 border rounded-lg p-4 bg-muted/20">
            <CheckCircle2 className="h-5 w-5 text-gray-500 shrink-0" />
            <p className="text-sm text-muted-foreground">
              All jobs assigned for {isToday(selectedDate) ? "today" : format(selectedDate, "MMM d")}.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {unassignedJobs.map(job => (
              <UnassignedJobCard
                key={job.id}
                job={job}
                onReassign={() => openAssignDialog(job)}
                onDragStart={() => handleDragStartJob(job.id)}
                onDragEnd={handleDragEndJob}
                isDragging={draggedJobId === job.id}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── View type toggle ── */}
      {dispatchView === "timeline" && vans.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">View by:</span>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewType === "van" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1 text-xs"
              onClick={() => setViewType("van")}
            >
              <Truck className="h-3.5 w-3.5" /> Vans
            </Button>
            <Button
              variant={viewType === "team" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1 text-xs border-l"
              onClick={() => setViewType("team")}
            >
              <Users className="h-3.5 w-3.5" /> Team
            </Button>
          </div>
        </div>
      )}

      {/* ── Dispatch Views ── */}
      {dispatchView === "timeline" ? (
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

      {/* ── Bottom Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Fleet Stats */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet Stats</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-2xl font-bold">{vans.length}</p>
                <p className="text-xs text-muted-foreground">Total Vans</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeVans}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totalZipCodes}</p>
                <p className="text-xs text-muted-foreground">Zip Codes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{inactiveVans}</p>
                <p className="text-xs text-muted-foreground">Inactive</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2 gap-1 text-sm"
              onClick={() => navigate("/fleet")}
            >
              <Plus className="h-4 w-4" /> Add Van
            </Button>
          </CardContent>
        </Card>

        {/* Inventory Summary */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inventory Summary</p>
            <div className="text-center py-2">
              <p className="text-5xl font-bold text-primary">{inventoryCount}</p>
              <p className="text-sm text-muted-foreground mt-1">Items tracked across fleet</p>
            </div>
            <div className="flex gap-1">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={cn("h-1.5 flex-1 rounded-md", i === 0 ? "bg-primary" : "bg-muted")}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Service Coverage */}
        <Card className="bg-foreground text-background overflow-hidden relative">
          <CardContent className="p-5 relative z-10">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">
              Service Coverage
            </p>
            <p className="text-lg font-bold leading-snug mb-1">
              Maximize efficiency by analyzing your route density.
            </p>
            <p className="text-sm opacity-60 mb-4">
              Configure territories to see heatmaps and route suggestions.
            </p>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/fleet")}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Configure Territories
            </Button>
          </CardContent>
          <div className="absolute right-0 bottom-0 w-32 h-32 rounded-md bg-white/10 translate-x-8 translate-y-8 pointer-events-none" />
        </Card>
      </div>

      {/* ── Assign / Reassign Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Job</DialogTitle>
            <DialogDescription>
              {selectedJob?.service_catalog?.name || selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {selectedJob && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatTime(selectedJob.scheduled_time.substring(0, 5))}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{getCustomerName(selectedJob)}</span>
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
              <Label>Assign to Technician</Label>
              <Select value={selectedTech} onValueChange={setSelectedTech}>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => {
                    const normalizedStatus = normalizeTechnicianStatus(tech.status);
                    const cfg = STATUS_CONFIG[normalizedStatus];
                    const jobCount = jobs.filter(
                      j =>
                        j.assigned_technician_id === tech.id &&
                        isVisibleInActiveDispatchLanes(j)
                    ).length;
                    return (
                      <SelectItem key={tech.id} value={tech.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-md", cfg?.color || "bg-muted")} />
                          <span>{tech.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({jobCount} active job{jobCount !== 1 ? "s" : ""})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Dispatch Notes (Optional)</Label>
              <Textarea
                placeholder="Special instructions for the technician..."
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                rows={3}
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
                  {unassigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Unassign
                </Button>
              )}
              <Button
                onClick={handleAssignJob}
                disabled={!selectedTech || assigning || unassigning}
                className="flex-1"
              >
                {assigning
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Send className="h-4 w-4 mr-2" />}
                Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
