import { useState } from "react";
import { addDays, format, isSameDay, isSameMonth, parseISO } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, Clock3, MapPin, UserRound } from "lucide-react";
import type { FleetWorkOrderSummary } from "@/application";
import type { FleetJobGroup } from "@/lib/fleet-job-groups";
import type { FleetResourceCapacity } from "@/application/queries/fleet-resource-scheduling.query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FleetCalendarView = "month" | "week" | "day" | "timeline";

/** A calendar cell entry: either a standalone work order or a multi-vehicle job. */
export type FleetCalendarItem =
  | { kind: "order"; order: FleetWorkOrderSummary }
  | FleetJobGroup;

interface ViewProps {
  items: FleetCalendarItem[];
  anchorDate: string;
  onOpenOrder: (order: FleetWorkOrderSummary) => void;
  onOpenJob: (group: FleetJobGroup) => void;
}

interface TimelineProps extends ViewProps {
  resources: FleetResourceCapacity[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-400 bg-slate-500/10 text-slate-700 dark:text-slate-200",
  pending_review: "border-rose-400 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  scheduled: "border-blue-500 bg-blue-500/10 text-blue-800 dark:text-blue-200",
  assigned: "border-violet-500 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  in_progress: "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  completed: "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  invoiced: "border-cyan-500 bg-cyan-500/10 text-cyan-900 dark:text-cyan-200",
  paid: "border-green-500 bg-green-500/10 text-green-900 dark:text-green-200",
  cancelled: "border-slate-400 bg-slate-500/10 text-slate-500 dark:text-slate-300",
};

function orderDuration(order: FleetWorkOrderSummary) {
  const minutes = (order as FleetWorkOrderSummary & { scheduled_duration_minutes?: number | null }).scheduled_duration_minutes;
  return Number(minutes || 60);
}

function orderLabel(order: FleetWorkOrderSummary) {
  const unit = order.fleet_vehicles?.unit_number;
  return unit ? `Unit ${unit} · ${order.service_type || "Service"}` : order.service_type || order.order_number || "Fleet service";
}

function statusStyleFor(status: string, priority?: string | null) {
  if (priority === "urgent") return "border-red-500 bg-red-500/10 text-red-900 dark:text-red-200";
  return STATUS_STYLES[status] || STATUS_STYLES.draft;
}

function itemDate(item: FleetCalendarItem): string | null {
  return item.kind === "job" ? item.scheduledDate : item.order.scheduled_date;
}

function itemTime(item: FleetCalendarItem): string | null {
  return item.kind === "job" ? item.scheduledTime : item.order.scheduled_time;
}

function itemDuration(item: FleetCalendarItem): number {
  return item.kind === "job" ? item.durationMinutes : orderDuration(item.order);
}

function itemTechnicianId(item: FleetCalendarItem): string | null {
  return item.kind === "job" ? item.technicianId : item.order.assigned_technician_id;
}

function WorkOrderCard({ order, compact = false, onOpen }: { order: FleetWorkOrderSummary; compact?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full rounded-md border border-l-[3px] p-2 text-left transition hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        statusStyleFor(order.status, order.priority),
      )}
    >
      <p className={cn("truncate font-semibold", compact ? "text-[11px]" : "text-xs")}>{orderLabel(order)}</p>
      <p className="mt-0.5 truncate text-[10px] opacity-75">
        {order.scheduled_time?.slice(0, 5) || "Time pending"} · {orderDuration(order)}m
      </p>
      {!compact ? (
        <p className="mt-1 truncate text-[10px] opacity-80">{order.fleet_clients?.company_name || "Fleet service"}</p>
      ) : null}
    </button>
  );
}

function JobGroupCard({
  group,
  compact = false,
  onOpenJob,
  onOpenOrder,
}: {
  group: FleetJobGroup;
  compact?: boolean;
  onOpenJob: () => void;
  onOpenOrder: (order: FleetWorkOrderSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("rounded-md border border-l-[3px]", statusStyleFor(group.status, group.priority))}>
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? "Collapse job vehicles" : "Expand job vehicles"}
          aria-expanded={expanded}
          className="mt-0.5 shrink-0 rounded p-0.5 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={onOpenJob} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <p className={cn("truncate font-semibold", compact ? "text-[11px]" : "text-xs")}>
            {group.jobNumber || "Fleet job"} · {group.orders.length} vehicles
          </p>
          <p className="mt-0.5 truncate text-[10px] opacity-75">
            {group.scheduledTime?.slice(0, 5) || "Time pending"} · {group.durationMinutes}m · {group.serviceType}
          </p>
          {!compact ? <p className="mt-1 truncate text-[10px] opacity-80">{group.clientName || "Fleet client"}</p> : null}
        </button>
      </div>
      {expanded ? (
        <div className="space-y-0.5 border-t border-border/60 px-2 py-1.5">
          {group.orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => onOpenOrder(order)}
              className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"
            >
              <span className="truncate text-[10px] font-medium">
                {order.fleet_vehicles?.unit_number ? `Unit ${order.fleet_vehicles.unit_number}` : order.order_number || "Work order"}
              </span>
              <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px] capitalize">{order.status.replace(/_/g, " ")}</Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalendarItemCard({
  item,
  compact = false,
  onOpenOrder,
  onOpenJob,
}: {
  item: FleetCalendarItem;
  compact?: boolean;
  onOpenOrder: (order: FleetWorkOrderSummary) => void;
  onOpenJob: (group: FleetJobGroup) => void;
}) {
  if (item.kind === "job") {
    return <JobGroupCard group={item} compact={compact} onOpenJob={() => onOpenJob(item)} onOpenOrder={onOpenOrder} />;
  }
  return <WorkOrderCard order={item.order} compact={compact} onOpen={() => onOpenOrder(item.order)} />;
}

export function FleetMonthView({ items, anchorDate, onOpenOrder, onOpenJob }: ViewProps) {
  const month = parseISO(anchorDate);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="border-r px-2 py-3 text-center text-xs font-semibold text-muted-foreground last:border-r-0">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayItems = items.filter((item) => itemDate(item) === dateKey);
          return (
            <div key={dateKey} className={cn("min-h-28 border-b border-r p-1.5 md:min-h-36", !isSameMonth(day, month) && "bg-muted/20 text-muted-foreground")}>
              <div className={cn("mb-1 ml-auto flex h-6 w-6 items-center justify-center rounded-md text-xs", isSameDay(day, new Date()) && "bg-primary font-bold text-primary-foreground")}>
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map((item) => (
                  <CalendarItemCard key={item.kind === "job" ? item.jobId : item.order.id} item={item} compact onOpenOrder={onOpenOrder} onOpenJob={onOpenJob} />
                ))}
                {dayItems.length > 3 ? <p className="px-1 text-[10px] font-medium text-muted-foreground">+{dayItems.length - 3} more</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FleetWeekView({ items, anchorDate, onOpenOrder, onOpenJob }: ViewProps) {
  const start = parseISO(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <div className="grid min-w-[920px] grid-cols-7 overflow-hidden rounded-lg border bg-card">
      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const dayItems = items
          .filter((item) => itemDate(item) === dateKey)
          .sort((a, b) => String(itemTime(a)).localeCompare(String(itemTime(b))));
        return (
          <section key={dateKey} className="min-h-[560px] border-r last:border-r-0">
            <header className={cn("border-b px-3 py-3 text-center", isSameDay(day, new Date()) && "bg-primary/5")}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{format(day, "EEE")}</p>
              <p className="mt-1 text-lg font-bold">{format(day, "d")}</p>
            </header>
            <div className="space-y-2 p-2">
              {dayItems.map((item) => (
                <CalendarItemCard key={item.kind === "job" ? item.jobId : item.order.id} item={item} onOpenOrder={onOpenOrder} onOpenJob={onOpenJob} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function FleetDayView({ items, anchorDate, onOpenOrder, onOpenJob }: ViewProps) {
  const dayItems = items
    .filter((item) => itemDate(item) === anchorDate)
    .sort((a, b) => String(itemTime(a)).localeCompare(String(itemTime(b))));
  const hours = Array.from({ length: 10 }, (_, index) => index + 8);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[84px_1fr]">
        <div className="border-r bg-muted/20" />
        <div className="grid grid-cols-10 border-b bg-muted/20">{hours.map((hour) => <div key={hour} className="border-r px-2 py-2 text-center text-[11px] text-muted-foreground last:border-r-0">{format(new Date(2024, 0, 1, hour), "h a")}</div>)}</div>
        <div className="border-r bg-muted/10 px-3 py-4 text-xs font-semibold text-muted-foreground">Fleet work</div>
        <div className="relative min-h-[430px] bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px)] bg-[length:10%_100%]">
          {dayItems.map((item, index) => {
            const [hour = 8, minute = 0] = (itemTime(item) || "08:00").split(":").map(Number);
            const start = Math.max(0, Math.min(9.5, hour - 8 + minute / 60));
            const width = Math.max(0.8, Math.min(itemDuration(item) / 60, 10 - start));
            return (
              <div key={item.kind === "job" ? item.jobId : item.order.id} style={{ left: `${start * 10}%`, width: `${width * 10}%`, top: `${24 + index * 64}px` }} className="absolute">
                <CalendarItemCard item={item} compact onOpenOrder={onOpenOrder} onOpenJob={onOpenJob} />
              </div>
            );
          })}
          {dayItems.length === 0 ? <div className="flex min-h-[430px] items-center justify-center text-sm text-muted-foreground">No work scheduled for this day.</div> : null}
        </div>
      </div>
    </div>
  );
}

export function FleetTimelineView({ items, anchorDate, resources, onOpenOrder, onOpenJob }: TimelineProps) {
  const start = parseISO(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const knownIds = new Set(resources.map((resource) => resource.technician_id));
  const isUnassigned = (item: FleetCalendarItem) => !itemTechnicianId(item) || !knownIds.has(itemTechnicianId(item) as string);
  const rows = [
    ...resources.map((resource) => ({ id: resource.technician_id, name: resource.technician_name, detail: `${resource.jobs_scheduled}/${resource.max_jobs} jobs · ${resource.remaining_minutes}m free` })),
    { id: "unassigned", name: "Unassigned", detail: `${items.filter(isUnassigned).length} work items` },
  ];

  return (
    <div className="min-w-[1040px] overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[240px_repeat(7,minmax(120px,1fr))] border-b bg-muted/30">
        <div className="border-r px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Technicians</div>
        {days.map((day) => <div key={day.toISOString()} className="border-r px-2 py-3 text-center text-xs font-semibold last:border-r-0">{format(day, "EEE · d")}</div>)}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid min-h-24 grid-cols-[240px_repeat(7,minmax(120px,1fr))] border-b last:border-b-0">
          <div className="flex items-center gap-3 border-r px-4 py-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-md", row.id === "unassigned" ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary")}>
              {row.id === "unassigned" ? <AlertTriangle className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{row.name}</p><p className="truncate text-[11px] text-muted-foreground">{row.detail}</p></div>
          </div>
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const cellItems = items.filter((item) => itemDate(item) === dateKey && (row.id === "unassigned" ? isUnassigned(item) : itemTechnicianId(item) === row.id));
            return (
              <div key={dateKey} className="space-y-1 border-r p-1.5 last:border-r-0">
                {cellItems.map((item) => (
                  <CalendarItemCard key={item.kind === "job" ? item.jobId : item.order.id} item={item} compact onOpenOrder={onOpenOrder} onOpenJob={onOpenJob} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function FleetCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      {[["Scheduled", "bg-blue-500"], ["Assigned", "bg-violet-500"], ["In progress", "bg-amber-500"], ["Completed", "bg-emerald-500"], ["Urgent", "bg-red-500"]].map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-md", color)} />{label}</span>
      ))}
    </div>
  );
}

export function UnscheduledOrderCard({ order, onOpen, onAssign }: { order: FleetWorkOrderSummary; onOpen: () => void; onAssign: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2"><Badge variant={order.priority === "urgent" ? "destructive" : "secondary"} className="text-[9px] uppercase">{order.priority || "normal"}</Badge><span className="text-[10px] text-muted-foreground">{order.order_number}</span></div>
      <button type="button" onClick={onOpen} className="mt-2 block w-full text-left text-sm font-semibold hover:text-primary">{orderLabel(order)}</button>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{order.fleet_clients?.company_name || "Fleet service"}</p>
      <div className="mt-3 flex items-center justify-between border-t pt-2"><span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />Ready to schedule</span><button type="button" onClick={onAssign} className="text-[10px] font-bold uppercase tracking-wide text-primary">Quick assign</button></div>
    </div>
  );
}

export function UnscheduledJobCard({ group, onOpen, onAssign }: { group: FleetJobGroup; onOpen: () => void; onAssign: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={group.priority === "urgent" ? "destructive" : "secondary"} className="text-[9px] uppercase">Job · {group.orders.length} vehicles</Badge>
        <span className="text-[10px] text-muted-foreground">{group.jobNumber || "Fleet job"}</span>
      </div>
      <button type="button" onClick={onOpen} className="mt-2 block w-full text-left text-sm font-semibold hover:text-primary">
        {group.serviceType} · {group.orders.length} vehicles
      </button>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{group.clientName || "Fleet client"}</p>
      <div className="mt-3 flex items-center justify-between border-t pt-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{group.durationMinutes}m total</span>
        <button type="button" onClick={onAssign} className="text-[10px] font-bold uppercase tracking-wide text-primary">Quick assign</button>
      </div>
    </div>
  );
}
