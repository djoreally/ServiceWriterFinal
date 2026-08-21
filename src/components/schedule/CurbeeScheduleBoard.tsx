import { useMemo } from "react";
import { addDays, format, isSameDay, parseISO, setHours, setMinutes, subDays } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, MapPin, Menu, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  color?: "blue" | "cyan" | "green" | "yellow" | "orange" | "purple";
  onClick?: () => void;
}

interface CurbeeScheduleBoardProps {
  brand?: string;
  title: string;
  subtitle?: string;
  date: Date;
  onDateChange: (date: Date) => void;
  resources: ScheduleResource[];
  events: ScheduleEvent[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onFilterClick?: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  openingHour?: number;
  closingHour?: number;
  className?: string;
}

const HOUR_HEIGHT = 92;
const RESOURCE_WIDTH = 280;
const DEFAULT_COLORS: NonNullable<ScheduleEvent["color"]>[] = ["blue", "yellow", "green", "cyan", "purple", "orange"];

const eventColorClasses: Record<NonNullable<ScheduleEvent["color"]>, string> = {
  blue: "bg-[#aed0ef] border-[#2f78a4]",
  cyan: "bg-[#6eb5df] border-[#2f78a4]",
  green: "bg-[#b7e6d0] border-[#4c9f76]",
  yellow: "bg-[#f2ec55] border-[#d8b93f]",
  orange: "bg-[#ffd49a] border-[#d89335]",
  purple: "bg-[#d2c4ff] border-[#7a66c7]",
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
  return format(date, "hh:mmaaa").toUpperCase();
}

export function CurbeeScheduleBoard({
  brand = "Service Writer",
  title,
  subtitle,
  date,
  onDateChange,
  resources,
  events,
  searchValue = "",
  onSearchChange,
  onFilterClick,
  primaryActionLabel = "Modify Van Schedule",
  onPrimaryAction,
  openingHour = 6,
  closingHour = 18,
  className,
}: CurbeeScheduleBoardProps) {
  const visibleResources = resources.length > 0 ? resources : [{ id: "unassigned", name: "Unassigned Van" }];
  const hours = useMemo(
    () => Array.from({ length: Math.max(closingHour - openingHour + 1, 1) }, (_, i) => openingHour + i),
    [closingHour, openingHour],
  );
  const gridHeight = (closingHour - openingHour) * HOUR_HEIGHT;

  const eventsByResource = useMemo(() => {
    const map = new Map<string, Array<ScheduleEvent & { top: number; height: number; color: NonNullable<ScheduleEvent["color"]> }>>();
    events.forEach((event, index) => {
      const start = parseTime(event.start);
      if (!start || !isSameDay(start, date)) return;
      const resourceId = visibleResources.some((resource) => resource.id === event.resourceId)
        ? event.resourceId
        : visibleResources[0]?.id ?? "unassigned";
      const top = ((start.getHours() - openingHour) + start.getMinutes() / 60) * HOUR_HEIGHT;
      const height = Math.max((event.durationMinutes / 60) * HOUR_HEIGHT, 58);
      const enriched = {
        ...event,
        resourceId,
        top: Math.max(top, 0),
        height,
        color: event.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      };
      const list = map.get(resourceId) ?? [];
      list.push(enriched);
      map.set(resourceId, list);
    });
    return map;
  }, [date, events, openingHour, visibleResources]);

  return (
    <div className={cn("min-h-full bg-[#f8f8f6] text-slate-950", className)}>
      <div className="border-b border-[#d7dddc] bg-[#dcebea] px-4 py-3">
        <div className="grid grid-cols-3 items-center text-sm">
          <Menu className="h-4 w-4" />
          <div className="text-center text-xl font-black tracking-tight">{brand}</div>
          <div className="flex justify-end gap-6 text-xs font-semibold">
            <span>Map</span>
            <span>Calendar</span>
            <span>Book New Appointment</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 text-center">
        <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="px-4 pb-4">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 border-b border-[#e2e2de] pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Search customer..."
                className="h-9 w-44 rounded border-[#c8cfcd] bg-white pl-8 text-xs"
              />
            </div>
            <Button variant="ghost" className="h-9 px-2 text-sm font-semibold" onClick={() => onDateChange(subDays(date, 1))}>Yesterday</Button>
            <Button variant="ghost" className="h-9 px-2 text-sm font-semibold" onClick={() => onDateChange(new Date())}>Today</Button>
            <Button variant="ghost" className="h-9 px-2 text-sm font-semibold" onClick={() => onDateChange(addDays(date, 1))}>Tomorrow</Button>
          </div>

          <div className="flex items-center gap-2 text-sm font-black">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(subDays(date, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>{format(date, "EEEE, MMMM d")}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(addDays(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <CalendarDays className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="h-8 gap-1 bg-[#eeeeec] text-xs" onClick={onFilterClick}>
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
            <Button size="sm" className="h-8 bg-[#41697a] text-xs hover:bg-[#355766]" onClick={onPrimaryAction}>
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-8">
        <div className="mx-auto flex w-max max-w-none gap-2">
          <div className="mt-[152px] w-24 shrink-0">
            {hours.slice(0, -1).map((hour) => (
              <div key={hour} className="relative h-[92px] pr-3 text-right text-sm font-bold text-black">
                <span className="absolute -top-2 right-3">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {visibleResources.map((resource, resourceIndex) => {
            const columnEvents = eventsByResource.get(resource.id) ?? [];
            const headerRevenue = resource.revenueCents ?? columnEvents.reduce((sum, event) => sum + (event.amountCents ?? 0), 0);
            const headerWork = resource.workMinutes ?? columnEvents.reduce((sum, event) => sum + event.durationMinutes, 0);
            const headerTransit = resource.transitMinutes ?? Math.max(columnEvents.length * 24, 0);

            return (
              <div key={resource.id} className="w-[280px] shrink-0 overflow-hidden rounded-t-2xl bg-white" style={{ width: RESOURCE_WIDTH }}>
                <div className="h-[152px] rounded-t-2xl bg-[#f1eee7] px-5 py-4">
                  <div className="flex items-center gap-1 text-base font-black">
                    {resource.name}
                    <Pencil className="h-3.5 w-3.5" />
                  </div>
                  {resource.subtitle && <p className="mt-1 text-[10px] text-muted-foreground">{resource.subtitle}</p>}
                  <div className="mt-4 grid grid-cols-2 gap-x-5 text-[10px] leading-tight">
                    <div className="space-y-1 font-bold">
                      <p>{formatCurrency(headerRevenue)}</p>
                      <p>{Math.floor(headerWork / 60)} hr {headerWork % 60} min</p>
                      <p>{headerTransit} min</p>
                    </div>
                    <div className="space-y-1">
                      <p>Revenue</p>
                      <p>Work Time</p>
                      <p>Transit Time</p>
                    </div>
                  </div>
                </div>

                <div className="relative bg-[#fbfbfa]" style={{ height: `${gridHeight}px` }}>
                  <div
                    className="absolute inset-x-0 top-0 bg-[#9f9f9d]"
                    style={{ height: `${Math.max(0, 9 - openingHour) * HOUR_HEIGHT}px` }}
                  />
                  {hours.slice(0, -1).map((hour) => (
                    <div key={hour} className="absolute inset-x-0 border-t border-white/70" style={{ top: `${(hour - openingHour) * HOUR_HEIGHT}px` }} />
                  ))}
                  {columnEvents.map((event) => {
                    const start = parseTime(event.start) ?? date;
                    const end = new Date(start.getTime() + event.durationMinutes * 60000);

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={event.onClick}
                        className={cn(
                          "absolute left-0 right-0 z-10 border-t-[3px] px-3 py-2 text-left text-[10px] leading-tight shadow-sm transition-transform hover:z-20 hover:scale-[1.01]",
                          eventColorClasses[event.color],
                        )}
                        style={{ top: `${event.top}px`, height: `${event.height}px` }}
                      >
                        <div className="absolute -top-[7px] left-0 right-0 border-t-[4px] border-[#f3c544] text-center text-[8px] font-bold text-[#8a6b00]">Travel</div>
                        <p className="mt-1 font-black">{event.title}</p>
                        {event.address && <p className="truncate">{event.address}</p>}
                        {event.amountCents != null && <p className="font-bold">{formatCurrency(event.amountCents)}</p>}
                        <p>{format(start, "h:mm aaa")} - {format(end, "h:mm aaa")}</p>
                        {event.subtitle && <p className="truncate text-[9px] opacity-80">{event.subtitle}</p>}
                        {event.status && <p className="mt-1 inline-flex rounded bg-white/35 px-1 py-0.5 text-[8px] font-bold uppercase">{event.status}</p>}
                        {resourceIndex === 0 && event.address && <MapPin className="absolute bottom-2 right-2 h-3 w-3 opacity-50" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
