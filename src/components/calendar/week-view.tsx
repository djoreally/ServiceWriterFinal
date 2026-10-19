import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  setHours,
  setMinutes,
} from "date-fns";

export interface WeekEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendarColor: string;
  allDay?: boolean;
}

interface WeekViewProps {
  weekStart: Date;
  events: WeekEvent[];
  onEventClick?: (event: WeekEvent) => void;
  onCreateEvent?: (start: Date, end: Date) => void;
  onMoveEvent?: (event: WeekEvent, newStart: Date) => void;
  onResizeEvent?: (event: WeekEvent, newEnd: Date) => void;
  className?: string;
}

const HOUR_PX = 60;
const SNAP_MINUTES = 15;

export function WeekView({
  weekStart,
  events,
  onEventClick,
  onCreateEvent,
  onMoveEvent,
  onResizeEvent,
  className,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragNew, setDragNew] = useState<{ day: number; startMin: number; endMin: number } | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const now = new Date();
  const nowDayIdx = weekDays.findIndex((d) => isSameDay(d, now));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nowDayIdx >= 0) {
      el.scrollTop = Math.max(0, (nowMinutes / 60) * HOUR_PX - el.clientHeight / 2);
    }
  }, []);

  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);

  const layoutByDay = useMemo(() => {
    return weekDays.map((day) => {
      const dayEvents = timedEvents
        .filter((e) => isSameDay(e.start, day))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      return dayEvents.map((ev) => {
        const concurrent =
          dayEvents.filter((o) => o !== ev && ev.start < o.end && ev.end > o.start).length + 1;
        const colIdx = dayEvents
          .filter(
            (o) =>
              (o.start < ev.start ||
                (o.start.getTime() === ev.start.getTime() && o.id < ev.id)) &&
              ev.start < o.end &&
              ev.end > o.start
          ).length;
        return { event: ev, concurrent, colIdx };
      });
    });
  }, [weekDays, timedEvents]);

  const minutesToY = (mins: number) => (mins / 60) * HOUR_PX;
  const yToMinutes = (y: number, rectTop: number) => {
    const mins = ((y - rectTop) / HOUR_PX) * 60;
    return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
  };

  const handleDayPointerDown = (dayIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startMin = yToMinutes(e.clientY, rect.top);
    setDragNew({ day: dayIdx, startMin, endMin: startMin + 60 });
    const move = (me: PointerEvent) => {
      const m = yToMinutes(me.clientY, rect.top);
      setDragNew((d) =>
        d ? { ...d, endMin: Math.max(d.startMin + SNAP_MINUTES, m) } : d
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragNew((d) => {
        if (d && onCreateEvent) {
          const day = weekDays[d.day];
          const s = addMinutes(new Date(day.setHours(0, 0, 0, 0)), d.startMin);
          const en = addMinutes(new Date(day.setHours(0, 0, 0, 0)), d.endMin);
          onCreateEvent(s, en);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {allDayEvents.length > 0 && (
        <div className="shrink-0 border-b">
          <div className="grid grid-cols-week-7">
            <div className="px-1 py-1 text-[10px] text-muted-foreground">All day</div>
            {weekDays.map((day, i) => (
              <div key={i} className="px-1 py-1 space-y-1 border-l">
                {allDayEvents
                  .filter((e) => isSameDay(e.start, day))
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEventClick?.(e)}
                      className="w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium"
                      style={{
                        borderLeft: `3px solid ${e.calendarColor}`,
                        backgroundColor: `${e.calendarColor}1a`,
                      }}
                    >
                      {e.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="grid grid-cols-week-7">
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-muted-foreground"
                style={{ top: h * HOUR_PX - 7 }}
              >
                {format(setHours(new Date(), h), "ha")}
              </div>
            ))}
          </div>

          {weekDays.map((day, dayIdx) => (
            <div
              key={dayIdx}
              className="relative border-l"
              style={{ height: 24 * HOUR_PX }}
              onPointerDown={(e) => handleDayPointerDown(dayIdx, e)}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/40"
                  style={{ top: h * HOUR_PX }}
                />
              ))}

              {dayIdx === nowDayIdx && (
                <div
                  className="absolute inset-x-0 z-10 border-t-2 border-red-500 pointer-events-none"
                  style={{ top: minutesToY(nowMinutes) }}
                >
                  <div className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                </div>
              )}

              {layoutByDay[dayIdx].map(({ event, concurrent, colIdx }) => {
                const startMin = event.start.getHours() * 60 + event.start.getMinutes();
                const durMin = Math.max(differenceInMinutes(event.end, event.start), 5);
                const top = minutesToY(startMin);
                const height = minutesToY(durMin);
                const widthPct = 100 / concurrent;
                const leftPct = colIdx * widthPct;
                const showTitle = durMin >= SNAP_MINUTES;

                return (
                  <div
                    key={event.id}
                    data-event
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(event);
                    }}
                    className="absolute rounded px-1.5 py-0.5 cursor-pointer overflow-hidden group"
                    style={{
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      borderLeft: `3px solid ${event.calendarColor}`,
                      backgroundColor: `${event.calendarColor}1a`,
                    }}
                    title={showTitle ? undefined : `${event.title} — ${format(event.start, "h:mm a")}`}
                  >
                    {showTitle ? (
                      <p className="text-xs font-medium leading-tight truncate">
                        {event.title}
                      </p>
                    ) : (
                      <div className="h-full w-full min-h-[4px]" />
                    )}
                    {onResizeEvent && (
                      <div
                        className="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const startY = e.clientY;
                          const origEnd = event.end;
                          const move = (me: PointerEvent) => {
                            const deltaMin = Math.round(
                              ((me.clientY - startY) / HOUR_PX) * 60 / SNAP_MINUTES
                            ) * SNAP_MINUTES;
                            const newEnd = addMinutes(origEnd, deltaMin);
                            if (newEnd > event.start) onResizeEvent(event, newEnd);
                          };
                          const up = () => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {dragNew && dragNew.day === dayIdx && (
                <div
                  className="absolute inset-x-1 z-20 rounded border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
                  style={{
                    top: minutesToY(dragNew.startMin),
                    height: Math.max(minutesToY(dragNew.endMin - dragNew.startMin), 8),
                  }}
                >
                  <p className="px-1 text-[10px] font-medium text-primary">
                    {format(addMinutes(new Date(day.setHours(0, 0, 0, 0)), dragNew.startMin), "h:mm a")}
                    {" – "}
                    {format(addMinutes(new Date(day.setHours(0, 0, 0, 0)), dragNew.endMin), "h:mm a")}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
