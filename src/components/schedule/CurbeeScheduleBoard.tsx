import { useMemo } from "react";
import { addDays, format, isSameDay, isToday, parseISO, setHours, setMinutes, subDays } from "date-fns";
import { AlertTriangle, CalendarX, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSemanticStatus } from "@/lib/semantic-status";

export interface ScheduleResource {
  id: string;
  name: string;
  subtitle?: string;
  revenueCents?: number;
  workMinutes?: number;
  transitMinutes?: number;
}

export interface ScheduleEvent {
  id: string;
  resourceId: string;
  title: string;
  subtitle?: string;
  address?: string | null;
  start: string;
  durationMinutes: number;
  amountCents?: number | null;
  status?: string | null;
  /**
   * Optional explicit accent. When omitted, the event takes its color from
   * its status via the semantic status registry — color always means status,
   * never list position.
   */
  color?: "blue" | "cyan" | "green" | "yellow" | "orange" | "purple";
  onClick?: () => void;
}

interface CurbeeScheduleBoardProps {
  title: string;
  subtitle?: string;
  date: Date;
  onDateChange: (date: Date) => void;
  resources: ScheduleResource[];
  events: ScheduleEvent[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  openingHour?: number;
  closingHour?: number;
  className?: string;
  /** Optional: render the loading state instead of the board. */
  isLoading?: boolean;
  /** Optional: render the error state. Pair with onRetry. */
  error?: string | null;
  /** Optional: retry handler for the error state. */
  onRetry?: () => void;
}

const HOUR_HEIGHT = 92;
const RESOURCE_WIDTH = 280;

/** Explicit-accent fallback — dark-friendly pastels, status registry preferred. */
const overrideSurface: Record<NonNullable<ScheduleEvent["color"]>, string> = {
  blue: "border-l-blue-500",
  cyan: "border-l-cyan-500",
  green: "border-l-emerald-500",
  yellow: "border-l-yellow-500",
  orange: "border-l-orange-500",
  purple: "border-l-purple-500",
};

const overrideDot: Record<NonNullable<ScheduleEvent["color"]>, string> = {
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  green: "bg-emerald-500",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
};

function parseTime(dateTime: string): Date | null {
  try {
    const parsed = dateTime.includes("T") ? parseISO(dateTime) : parseISO(`${dateTime}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function formatCurrency(cents?: number | null): string {
  if (cents == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatHour(hour: number): string {
  const date = setMinutes(setHours(new Date(), hour), 0);
  return format(date, "HH:00");
}

function formatWorkTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function CurbeeScheduleBoard({
  title,
  subtitle,
  date,
  onDateChange,
  resources,
  events,
  searchValue = "",
  onSearchChange,
  primaryActionLabel = "New appointment",
  onPrimaryAction,
  openingHour = 6,
  closingHour = 18,
  className,
  isLoading = false,
  error = null,
  onRetry,
}: CurbeeScheduleBoardProps) {
  const visibleResources = useMemo(
    () => resources.length > 0 ? resources : [{ id: "unassigned", name: "Unassigned" }],
    [resources],
  );
  const hours = useMemo(
    () => Array.from({ length: Math.max(closingHour - openingHour + 1, 1) }, (_, i) => openingHour + i),
    [closingHour, openingHour],
  );
  const gridHeight = (closingHour - openingHour) * HOUR_HEIGHT;
  const viewingToday = isToday(date);
  const nowTop = useMemo(() => {
    const now = new Date();
    return ((now.getHours() - openingHour) + now.getMinutes() / 60) * HOUR_HEIGHT;
  }, [openingHour]);

  const eventsByResource = useMemo(() => {
    const map = new Map<string, Array<ScheduleEvent & { top: number; height: number }>>();
    events.forEach((event) => {
      const start = parseTime(event.start);
      if (!start || !isSameDay(start, date)) return;
      const resourceId = visibleResources.some((resource) => resource.id === event.resourceId)
        ? event.resourceId
        : visibleResources[0]?.id ?? "unassigned";
      const top = ((start.getHours() - openingHour) + start.getMinutes() / 60) * HOUR_HEIGHT;
      const height = Math.max((event.durationMinutes / 60) * HOUR_HEIGHT, 58);
      const enriched = { ...event, resourceId, top: Math.max(top, 0), height };
      const list = map.get(resourceId) ?? [];
      list.push(enriched);
      map.set(resourceId, list);
    });
    return map;
  }, [date, events, openingHour, visibleResources]);

  const renderLoading = () => (
    <div className="px-4 pb-8 sm:px-6" aria-busy="true" aria-label="Loading schedule">
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[280px] shrink-0">
            <Skeleton className="h-[104px] rounded-xl" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderError = () => (
    <div className="px-4 pb-8 sm:px-6">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load the schedule.</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error || "Check your connection and try again."}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Try again
          </Button>
        )}
      </div>
    </div>
  );

  const renderEmpty = () => (
    <div className="px-4 pb-8 sm:px-6">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <CalendarX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-serif text-xl text-foreground">No jobs on the board</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {format(date, "EEEE, MMMM d")} is clear. Book a new appointment or pick another day.
        </p>
        {onPrimaryAction && (
          <Button size="sm" onClick={onPrimaryAction} className="mt-3">
            {primaryActionLabel}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-full bg-background text-foreground", className)}>
      {/* Header */}
      <div className="px-4 pt-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {/* Controls */}
      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Search jobs, customers, vehicles…"
                aria-label="Search schedule"
                className="h-9 w-56 bg-card pl-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
              <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={() => onDateChange(subDays(date, 1))}>Yesterday</Button>
              <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={() => onDateChange(new Date())}>Today</Button>
              <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={() => onDateChange(addDays(date, 1))}>Tomorrow</Button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(subDays(date, 1))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[170px] text-center text-base font-medium">{format(date, "EEEE, MMMM d")}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(addDays(date, 1))} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {onPrimaryAction && (
            <Button size="sm" onClick={onPrimaryAction}>
              {primaryActionLabel}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? renderLoading() : error ? renderError() : events.length === 0 ? renderEmpty() : (
      <div className="overflow-x-auto px-4 pb-8 sm:px-6">
        <div className="flex w-max max-w-none gap-3">
          <div className="mt-[104px] w-16 shrink-0" aria-hidden="true">
            {hours.slice(0, -1).map((hour) => (
              <div key={hour} className="relative h-[92px] pr-2 text-right">
                <span className="absolute -top-2 right-2 font-mono text-xs text-muted-foreground">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {visibleResources.map((resource) => {
            const columnEvents = eventsByResource.get(resource.id) ?? [];
            const headerRevenue = resource.revenueCents ?? columnEvents.reduce((sum, event) => sum + (event.amountCents ?? 0), 0);
            const headerWork = resource.workMinutes ?? columnEvents.reduce((sum, event) => sum + event.durationMinutes, 0);

            return (
              <div key={resource.id} className="w-[280px] shrink-0" style={{ width: RESOURCE_WIDTH }}>
                <div className="h-[104px] rounded-t-xl border border-border bg-card px-4 py-3">
                  <p className="truncate text-sm font-semibold text-foreground">{resource.name}</p>
                  {resource.subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{resource.subtitle}</p>}
                  <div className="mt-2.5 flex gap-5">
                    <div>
                      <p className="font-mono text-sm text-foreground">{formatCurrency(headerRevenue)}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-foreground">{formatWorkTime(headerWork)}</p>
                      <p className="text-xs text-muted-foreground">Work time</p>
                    </div>
                  </div>
                </div>

                <div className="relative rounded-b-xl border border-t-0 border-border bg-card/40" style={{ height: `${gridHeight}px` }}>
                  {hours.slice(0, -1).map((hour) => (
                    <div key={hour} className="absolute inset-x-0 border-t border-white/[0.06]" style={{ top: `${(hour - openingHour) * HOUR_HEIGHT}px` }} />
                  ))}
                  {viewingToday && nowTop >= 0 && nowTop <= gridHeight && (
                    <div className="absolute inset-x-0 z-20 border-t-2 border-primary" style={{ top: `${nowTop}px` }} aria-hidden="true">
                      <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                  {columnEvents.map((event) => {
                    const start = parseTime(event.start) ?? date;
                    const end = new Date(start.getTime() + event.durationMinutes * 60000);
                    const status = getSemanticStatus("appointment", event.status);
                    const surfaceClass = event.color ? overrideSurface[event.color] : status.surfaceClass;
                    const dotClass = event.color ? overrideDot[event.color] : status.dotClass;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={event.onClick}
                        aria-label={`${event.title}, ${format(start, "HH:mm")} to ${format(end, "HH:mm")}, ${status.label}`}
                        className={cn(
                          "absolute left-0 right-0 z-10 overflow-hidden border-l-4 bg-card px-3 py-2 text-left shadow-sm transition-transform hover:z-20 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                          surfaceClass,
                        )}
                        style={{ top: `${event.top}px`, height: `${event.height}px` }}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {format(start, "HH:mm")} – {format(end, "HH:mm")}
                        </p>
                        {event.address && <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.address}</p>}
                        {event.subtitle && <p className="truncate text-xs text-muted-foreground/80">{event.subtitle}</p>}
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs", status.badgeClass)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden="true" />
                            {status.label}
                          </span>
                          {event.amountCents != null && (
                            <span className="font-mono text-xs text-foreground">{formatCurrency(event.amountCents)}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
