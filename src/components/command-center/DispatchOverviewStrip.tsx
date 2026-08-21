/**
 * DispatchOverviewStrip
 *
 * Compact command-center header strip that adds the pieces the raw
 * left-map / right-queue layout was missing:
 *
 *   1. Fleet status indicators — headcount by technician state.
 *   2. Lifecycle-stage counters (Scheduled / En Route / On Site / Completed).
 *   3. Emergency / high-priority pinned queue — urgent unassigned jobs.
 *   4. Today's appointment timeline (7am–8pm axis, dots colored by stage).
 *
 * All data is derived; no extra fetches. Callbacks let the parent decide
 * what happens on click (open dispatch panel, navigate to detail, etc.).
 */
import { useMemo } from "react";
import { AlertTriangle, Truck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type LifecycleState =
  | "unassigned"
  | "assigned"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface DispatchStripJob {
  id: string;
  title: string;
  scheduled_time: string; // "HH:MM:SS" or "HH:MM"
  duration_minutes: number;
  customer_name: string | null;
  guest_name: string | null;
  job_priority: string | null;
  assigned_technician_id: string | null;
  technician_name: string | null;
  lifecycleState: LifecycleState;
}

export interface DispatchStripTech {
  id: string;
  name: string;
  status: string;
}

interface Props {
  jobs: DispatchStripJob[];
  techs: DispatchStripTech[];
  onOpenJob: (jobId: string) => void;
  onDispatchJob: (jobId: string) => void;
}

const STAGE_COLOR: Record<LifecycleState, string> = {
  unassigned: "hsl(var(--warning))",
  assigned: "hsl(var(--secondary))",
  dispatched: "hsl(var(--warning))",
  in_progress: "hsl(var(--primary))",
  completed: "hsl(var(--success))",
  cancelled: "hsl(var(--muted-foreground))",
};

const STAGE_BUCKET: Record<LifecycleState, "scheduled" | "en_route" | "on_site" | "completed" | "other"> = {
  unassigned: "scheduled",
  assigned: "scheduled",
  dispatched: "en_route",
  in_progress: "on_site",
  completed: "completed",
  cancelled: "other",
};

// Timeline window (local hours): 7am → 8pm
const HOUR_START = 7;
const HOUR_END = 20;

function parseHour(time: string): number | null {
  if (!time) return null;
  const [hh, mm] = time.split(":");
  const h = Number(hh);
  const m = Number(mm ?? "0");
  if (Number.isNaN(h)) return null;
  return h + (Number.isNaN(m) ? 0 : m / 60);
}

function displayName(j: DispatchStripJob): string {
  return j.customer_name || j.guest_name || "Walk-in";
}

export function DispatchOverviewStrip({ jobs, techs, onOpenJob, onDispatchJob }: Props) {
  const fleet = useMemo(() => {
    const acc = { available: 0, en_route: 0, on_site: 0, on_break: 0, offline: 0 };
    for (const t of techs) {
      const s = t.status;
      if (s === "available") acc.available += 1;
      else if (s === "en_route") acc.en_route += 1;
      else if (s === "on_site" || s === "on_job") acc.on_site += 1;
      else if (s === "on_break") acc.on_break += 1;
      else acc.offline += 1;
    }
    return acc;
  }, [techs]);

  const stages = useMemo(() => {
    const acc = { scheduled: 0, en_route: 0, on_site: 0, completed: 0 };
    for (const j of jobs) {
      const bucket = STAGE_BUCKET[j.lifecycleState];
      if (bucket === "scheduled") acc.scheduled += 1;
      else if (bucket === "en_route") acc.en_route += 1;
      else if (bucket === "on_site") acc.on_site += 1;
      else if (bucket === "completed") acc.completed += 1;
    }
    return acc;
  }, [jobs]);

  const urgent = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.job_priority === "urgent" &&
          (j.lifecycleState === "unassigned" || !j.assigned_technician_id) &&
          j.lifecycleState !== "completed" &&
          j.lifecycleState !== "cancelled",
      ),
    [jobs],
  );

  const timeline = useMemo(() => {
    const span = HOUR_END - HOUR_START;
    return jobs
      .map((j) => {
        const h = parseHour(j.scheduled_time);
        if (h === null) return null;
        const clamped = Math.max(HOUR_START, Math.min(HOUR_END, h));
        const leftPct = ((clamped - HOUR_START) / span) * 100;
        return { job: j, leftPct };
      })
      .filter((x): x is { job: DispatchStripJob; leftPct: number } => x !== null)
      .sort((a, b) => a.leftPct - b.leftPct);
  }, [jobs]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = HOUR_START; h <= HOUR_END; h += 1) ticks.push(h);
    return ticks;
  }, []);

  return (
    <div className="mb-3 space-y-3">
      {/* Row 1: Fleet + Lifecycle stages */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {/* Fleet status */}
        <Card>
          <CardContent className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Truck className="h-3 w-3" /> Fleet status
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill label="Available" count={fleet.available} dotClass="bg-[hsl(var(--success))]" />
              <StatusPill label="En route" count={fleet.en_route} dotClass="bg-[hsl(var(--warning))]" />
              <StatusPill label="On site" count={fleet.on_site} dotClass="bg-[hsl(var(--primary))]" />
              {fleet.on_break > 0 && (
                <StatusPill label="Break" count={fleet.on_break} dotClass="bg-[hsl(var(--secondary))]" />
              )}
              {fleet.offline > 0 && (
                <StatusPill label="Offline" count={fleet.offline} dotClass="bg-muted-foreground" />
              )}
              {techs.length === 0 && (
                <span className="text-xs text-muted-foreground">No active technicians</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lifecycle stages */}
        <Card>
          <CardContent className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Today's jobs by stage
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StagePill label="Scheduled" count={stages.scheduled} color={STAGE_COLOR.assigned} />
              <StagePill label="En route" count={stages.en_route} color={STAGE_COLOR.dispatched} />
              <StagePill label="On site" count={stages.on_site} color={STAGE_COLOR.in_progress} />
              <StagePill label="Completed" count={stages.completed} color={STAGE_COLOR.completed} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Emergency queue */}
      {urgent.length > 0 && (
        <Card className="border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.04)]">
          <CardContent className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--destructive))]">
              <AlertTriangle className="h-3 w-3" /> Emergency / high-priority · {urgent.length}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {urgent.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => onDispatchJob(j.id)}
                  className="group inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--destructive)/0.4)] bg-background px-2 py-1 text-xs hover:bg-[hsl(var(--destructive)/0.08)]"
                >
                  <Badge variant="destructive" className="px-1 py-0 text-[9px]">urgent</Badge>
                  <span className="font-mono tabular-nums text-[11px]">{j.scheduled_time?.slice(0, 5)}</span>
                  <span className="max-w-[140px] truncate font-medium">{displayName(j)}</span>
                  <Zap className="h-3 w-3 text-[hsl(var(--destructive))] opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 3: Appointment timeline */}
      <Card>
        <CardContent className="px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Appointment timeline
            </span>
            <span className="text-[10px] text-muted-foreground">
              {timeline.length} scheduled · {HOUR_START}:00 – {HOUR_END}:00
            </span>
          </div>
          <TooltipProvider delayDuration={100}>
            <div className="relative h-10 select-none">
              {/* Axis line */}
              <div className="absolute left-0 right-0 top-5 h-px bg-border" />
              {/* Hour ticks */}
              {hourTicks.map((h) => {
                const leftPct = ((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100;
                return (
                  <div
                    key={h}
                    className="absolute top-3 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${leftPct}%` }}
                  >
                    <div className="h-2 w-px bg-border" />
                    {h % 2 === 0 && (
                      <span className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">
                        {h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* Job dots */}
              {timeline.map(({ job, leftPct }) => {
                const color = STAGE_COLOR[job.lifecycleState] ?? STAGE_COLOR.assigned;
                const isUrgent = job.job_priority === "urgent";
                return (
                  <Tooltip key={job.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onOpenJob(job.id)}
                        className={cn(
                          "absolute top-[14px] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-background transition-transform hover:scale-125",
                          isUrgent ? "h-3.5 w-3.5 ring-2 ring-[hsl(var(--destructive)/0.5)]" : "h-2.5 w-2.5",
                        )}
                        style={{ left: `${leftPct}%`, backgroundColor: color }}
                        aria-label={`${job.scheduled_time?.slice(0, 5)} — ${displayName(job)}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-mono tabular-nums">{job.scheduled_time?.slice(0, 5)}</div>
                      <div className="font-medium">{displayName(job)}</div>
                      <div className="text-muted-foreground">{job.title}</div>
                      <div className="text-muted-foreground">
                        {job.technician_name ?? "Unassigned"} · {job.lifecycleState.replace("_", " ")}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
          {/* Legend */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <LegendDot color={STAGE_COLOR.assigned} label="Scheduled" />
            <LegendDot color={STAGE_COLOR.dispatched} label="En route" />
            <LegendDot color={STAGE_COLOR.in_progress} label="On site" />
            <LegendDot color={STAGE_COLOR.completed} label="Completed" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ label, count, dotClass }: { label: string; count: number; dotClass: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
      <span className={cn("h-2 w-2 rounded-md", dotClass)} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

function StagePill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
      <span className="h-2 w-2 rounded-md" style={{ backgroundColor: color }} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-md" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
