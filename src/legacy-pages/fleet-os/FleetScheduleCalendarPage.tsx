import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Filter, LayoutGrid, ListFilter, Loader2, Plus, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { fetchFleetSchedulerWindow, subscribeToFleetScheduler, type FleetWorkOrderSummary } from "@/application";
import { assignFleetJob } from "@/application/commands/fleet-jobs.command";
import { assignFleetWorkOrderSlot, fetchFleetResourceCapacity, type FleetResourceCapacity } from "@/application/queries/fleet-resource-scheduling.query";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FleetCalendarLegend,
  FleetDayView,
  FleetMonthView,
  FleetTimelineView,
  FleetWeekView,
  UnscheduledJobCard,
  UnscheduledOrderCard,
  type FleetCalendarItem,
  type FleetCalendarView,
} from "@/components/fleet/calendar/FleetCalendarViews";
import { buildFleetJobGroups, type FleetJobGroup } from "@/lib/fleet-job-groups";
import { features } from "@/config/features";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

function isTerminal(status?: string | null) {
  return status === "completed" || status === "invoiced" || status === "paid";
}

function orderLabel(order: FleetWorkOrderSummary) {
  return order.fleet_vehicles?.unit_number
    ? `Unit ${order.fleet_vehicles.unit_number} · ${order.service_type || "Service"}`
    : order.service_type || order.order_number || "Fleet service";
}

type AssignTarget =
  | { kind: "order"; order: FleetWorkOrderSummary }
  | { kind: "job"; group: FleetJobGroup };

const VIEW_OPTIONS: Array<{ value: FleetCalendarView; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "timeline", label: "Timeline" },
];

const FleetScheduleCalendarWorkspace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<FleetWorkOrderSummary[]>([]);
  const [unscheduledOrders, setUnscheduledOrders] = useState<FleetWorkOrderSummary[]>([]);
  const [serverCounts, setServerCounts] = useState({ scheduled: 0, unscheduled: 0, exceptions: 0 });
  const [resources, setResources] = useState<FleetResourceCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<FleetCalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => format(startOfWeek(new Date()), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [showQueue, setShowQueue] = useState(true);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [slot, setSlot] = useState({ technicianId: "", date: format(new Date(), "yyyy-MM-dd"), start: "08:00", duration: "60" });
  const [assigning, setAssigning] = useState(false);

  const windowRange = useMemo(() => {
    const anchor = parseISO(anchorDate);
    const start = view === "month" ? startOfMonth(anchor) : view === "day" ? anchor : startOfWeek(anchor);
    const end = view === "month" ? endOfMonth(anchor) : view === "day" ? anchor : endOfWeek(anchor);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [anchorDate, view]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await fetchFleetSchedulerWindow(user.id, windowRange.start, windowRange.end);
      setOrders(result.scheduled);
      setUnscheduledOrders(result.unscheduled);
      setServerCounts(result.counts);
    } catch (error) {
      console.error("[FleetScheduler] load failed", error);
      toast.error("Failed to load Fleet OS scheduler");
    } finally {
      setLoading(false);
    }
  }, [user?.id, windowRange.end, windowRange.start]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void fetchFleetResourceCapacity(anchorDate).then(setResources).catch(() => setResources([])); }, [anchorDate]);
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return subscribeToFleetScheduler(user.id, () => { clearTimeout(timer); timer = setTimeout(() => { void loadData(); }, 150); });
  }, [loadData, user?.id]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...orders, ...unscheduledOrders].filter((order) => {
      if (status === "open" && isTerminal(order.status)) return false;
      if (status === "completed" && !isTerminal(order.status)) return false;
      if (!query) return true;
      return [order.order_number, order.service_type, order.fleet_clients?.company_name, order.fleet_vehicles?.unit_number, order.fleet_jobs?.job_number]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [orders, search, status, unscheduledOrders]);

  // Real grouping: work orders stamped with fleet_job_id render as ONE job.
  const scheduledItems = useMemo<FleetCalendarItem[]>(() => {
    const { groups, standalone } = buildFleetJobGroups(visibleOrders.filter((order) => Boolean(order.scheduled_date)));
    const items: FleetCalendarItem[] = [...groups, ...standalone.map((order) => ({ kind: "order" as const, order }))];
    return items.sort((a, b) => {
      const timeA = a.kind === "job" ? a.scheduledTime : a.order.scheduled_time;
      const timeB = b.kind === "job" ? b.scheduledTime : b.order.scheduled_time;
      return String(timeA).localeCompare(String(timeB));
    });
  }, [visibleOrders]);

  const unscheduledItems = useMemo<FleetCalendarItem[]>(() => {
    const { groups, standalone } = buildFleetJobGroups(visibleOrders.filter((order) => !order.scheduled_date && !isTerminal(order.status)));
    return [...groups, ...standalone.map((order) => ({ kind: "order" as const, order }))];
  }, [visibleOrders]);

  const scheduledMinutes = resources.reduce((sum, resource) => sum + resource.scheduled_minutes, 0);
  const availableMinutes = resources.reduce((sum, resource) => sum + resource.available_minutes, 0);
  const utilization = availableMinutes ? Math.min(100, Math.round((scheduledMinutes / availableMinutes) * 100)) : 0;
  const exceptionCount = serverCounts.exceptions;

  const periodTitle = useMemo(() => {
    const date = parseISO(anchorDate);
    if (view === "month") return format(date, "MMMM yyyy");
    if (view === "day") return format(date, "EEEE, MMMM d");
    return `${format(date, "MMM d")} – ${format(addDays(date, 6), "MMM d, yyyy")}`;
  }, [anchorDate, view]);

  const movePeriod = (direction: -1 | 1) => {
    const date = parseISO(anchorDate);
    const next = view === "month" ? addMonths(date, direction) : addDays(date, direction * (view === "day" ? 1 : 7));
    setAnchorDate(format(view === "month" ? startOfMonth(next) : view === "day" ? next : startOfWeek(next), "yyyy-MM-dd"));
  };

  const changeView = (nextView: FleetCalendarView) => {
    setView(nextView);
    const date = parseISO(anchorDate);
    setAnchorDate(format(nextView === "month" ? startOfMonth(date) : nextView === "day" ? date : startOfWeek(date), "yyyy-MM-dd"));
  };

  const openAssignOrder = (order: FleetWorkOrderSummary) => {
    const date = order.scheduled_date || anchorDate;
    setAssignTarget({ kind: "order", order });
    setSlot({
      technicianId: order.assigned_technician_id || "",
      date,
      start: order.scheduled_time?.slice(0, 5) || "08:00",
      duration: String((order as FleetWorkOrderSummary & { scheduled_duration_minutes?: number | null }).scheduled_duration_minutes || 60),
    });
  };

  const openAssignJob = (group: FleetJobGroup) => {
    setAssignTarget({ kind: "job", group });
    setSlot({
      technicianId: group.technicianId || "",
      date: group.scheduledDate || anchorDate,
      start: group.scheduledTime?.slice(0, 5) || "08:00",
      duration: "60",
    });
  };

  const assign = async () => {
    if (!assignTarget || !slot.technicianId) return;
    setAssigning(true);
    try {
      if (assignTarget.kind === "job") {
        const updated = await assignFleetJob({
          jobId: assignTarget.group.jobId,
          technicianId: slot.technicianId,
          date: slot.date,
          start: slot.start,
          durationMinutes: Number(slot.duration),
        });
        toast.success(`Job ${assignTarget.group.jobNumber || ""} assigned — ${updated} work orders updated`.trim());
      } else {
        await assignFleetWorkOrderSlot({
          workOrderId: assignTarget.order.id,
          technicianId: slot.technicianId,
          date: slot.date,
          start: slot.start,
          durationMinutes: Number(slot.duration),
          expectedUpdatedAt: assignTarget.order.updated_at,
        });
        toast.success("Work order assigned");
      }
      setAssignTarget(null);
      setAnchorDate(slot.date);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign work");
    } finally {
      setAssigning(false);
    }
  };

  const assignTargetLabel = assignTarget
    ? assignTarget.kind === "job"
      ? `${assignTarget.group.jobNumber || "Fleet job"} · ${assignTarget.group.orders.length} vehicles`
      : orderLabel(assignTarget.order)
    : "work";

  const viewProps = {
    items: scheduledItems,
    anchorDate,
    onOpenOrder: (order: FleetWorkOrderSummary) => navigate(`/fleet-os/work-orders/${order.id}`),
    onOpenJob: (group: FleetJobGroup) => navigate(`/fleet-os/jobs/${group.jobId}`),
  };

  return (
    <FleetOSLayout title="Calendar">
      <div className="-m-4 min-h-[calc(100vh-73px)] bg-background md:-m-6">
        <header className="border-b bg-card/95 px-4 py-4 backdrop-blur md:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
              <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">Fleet calendar</h1><Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">● On track</Badge></div><p className="text-sm text-muted-foreground">Schedule work, balance technicians, and resolve exceptions.</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1 xl:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, unit, job, or work order" className="h-10 pl-9" /></div>
              <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 w-[145px]"><ListFilter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All open statuses</SelectItem><SelectItem value="open">Open work</SelectItem></SelectContent></Select>
              <Button variant="outline" className="h-10"><Filter className="mr-2 h-4 w-4" />Filters</Button>
              <Button className="h-10" onClick={() => navigate("/fleet-os/work-orders/new")}><Plus className="mr-2 h-4 w-4" />Create order</Button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-4 md:px-7">
          {[
            ["Scheduled work", serverCounts.scheduled, "Vehicle work orders in view"],
            ["Unscheduled", serverCounts.unscheduled, "Open dispatch queue"],
            ["Utilization", `${utilization}%`, `${scheduledMinutes} of ${availableMinutes} min`],
            ["Exceptions", exceptionCount, "Urgent or pending review"],
          ].map(([label, value, detail]) => <Card key={label} className="p-4 shadow-none"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></Card>)}
        </section>

        <div className={cn("grid", showQueue && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
          <main className="min-w-0 px-4 pb-7 md:px-7">
            <div className="mb-3 flex flex-col gap-3 rounded-lg border bg-card px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2"><div className="flex rounded-md border bg-muted/20 p-1">{VIEW_OPTIONS.map((option) => <Button key={option.value} size="sm" variant={view === option.value ? "secondary" : "ghost"} onClick={() => changeView(option.value)} className="h-8">{option.value === "timeline" ? <UsersRound className="mr-1.5 h-3.5 w-3.5" /> : option.value === "month" ? <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> : null}{option.label}</Button>)}</div><Button variant="ghost" size="sm" onClick={() => setShowQueue((current) => !current)}><SlidersHorizontal className="mr-2 h-4 w-4" />{showQueue ? "Hide queue" : "Show queue"}</Button></div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="mr-2 min-w-44 text-sm font-semibold">{periodTitle}</h2><Button variant="outline" size="icon" onClick={() => movePeriod(-1)} aria-label="Previous period"><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => { const today = new Date(); setAnchorDate(format(view === "month" ? startOfMonth(today) : view === "day" ? today : startOfWeek(today), "yyyy-MM-dd")); }}>Today</Button><Button variant="outline" size="icon" onClick={() => movePeriod(1)} aria-label="Next period"><ChevronRight className="h-4 w-4" /></Button></div>
            </div>
            <div className="mb-3 flex items-center justify-between gap-3"><FleetCalendarLegend /><p className="text-xs text-muted-foreground">Click a job to open it, or expand it to see each vehicle</p></div>
            {loading ? <div className="flex min-h-[520px] items-center justify-center rounded-lg border bg-card"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
              <div className="overflow-x-auto">
                {view === "month" ? <FleetMonthView {...viewProps} /> : null}
                {view === "week" ? <FleetWeekView {...viewProps} /> : null}
                {view === "day" ? <FleetDayView {...viewProps} /> : null}
                {view === "timeline" ? <FleetTimelineView {...viewProps} resources={resources} /> : null}
              </div>
            )}
          </main>

          {showQueue ? (
            <aside className="border-l bg-muted/15">
              <div className="sticky top-0 border-b bg-card px-4 py-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Unscheduled work</h2><p className="text-xs text-muted-foreground">Ready for technician assignment</p></div><Badge variant="secondary">{unscheduledItems.length}</Badge></div></div>
              <div className="space-y-3 p-3">
                {unscheduledItems.slice(0, 10).map((item) => item.kind === "job" ? (
                  <UnscheduledJobCard key={item.jobId} group={item} onOpen={() => navigate(`/fleet-os/jobs/${item.jobId}`)} onAssign={() => openAssignJob(item)} />
                ) : (
                  <UnscheduledOrderCard key={item.order.id} order={item.order} onOpen={() => navigate(`/fleet-os/work-orders/${item.order.id}`)} onAssign={() => openAssignOrder(item.order)} />
                ))}
                {unscheduledItems.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">All work is scheduled</p></div> : null}
              </div>
            </aside>
          ) : null}
        </div>

        <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => !open && setAssignTarget(null)}>
          <DialogContent><DialogHeader><DialogTitle>Quick assign {assignTargetLabel}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Date</Label><Input type="date" value={slot.date} onChange={(event) => setSlot((current) => ({ ...current, date: event.target.value }))} /></div><div><Label>Start time</Label><Input type="time" value={slot.start} onChange={(event) => setSlot((current) => ({ ...current, start: event.target.value }))} /></div><div><Label>Duration{assignTarget?.kind === "job" ? " (per vehicle)" : ""}</Label><Select value={slot.duration} onValueChange={(duration) => setSlot((current) => ({ ...current, duration }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[30, 45, 60, 90, 120, 180, 240].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent></Select></div><div><Label>Technician</Label><Select value={slot.technicianId} onValueChange={(technicianId) => setSlot((current) => ({ ...current, technicianId }))}><SelectTrigger><SelectValue placeholder="Choose technician" /></SelectTrigger><SelectContent>{resources.filter((resource) => !resource.is_blacked_out && resource.remaining_minutes >= Number(slot.duration)).map((resource) => <SelectItem key={resource.technician_id} value={resource.technician_id}>{resource.technician_name} · {resource.remaining_minutes}m free</SelectItem>)}</SelectContent></Select></div></div>
            {assignTarget?.kind === "job" ? <p className="text-xs text-muted-foreground">Assigning a job cascades the technician and slot to all {assignTarget.group.orders.length} vehicles in one step.</p> : null}
            <p className="text-xs text-muted-foreground">Availability and conflicts are revalidated when the assignment is saved.</p><DialogFooter><Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button><Button onClick={assign} disabled={assigning || !slot.technicianId}>{assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Assign work</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </FleetOSLayout>
  );
};

const FleetScheduleCalendarPage = () => features["fleet-resource-scheduler-kill-switch"]
  ? <FleetOSLayout title="Calendar"><Card className="mx-auto max-w-lg p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><h1 className="mt-3 font-semibold">Resource scheduling is temporarily paused</h1><p className="mt-2 text-sm text-muted-foreground">Work orders remain available from the Work Orders page.</p></Card></FleetOSLayout>
  : <FleetScheduleCalendarWorkspace />;

export default FleetScheduleCalendarPage;
