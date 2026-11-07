import { useMemo, useState } from "react";
import { isSameDay } from "date-fns";
import { MapPin, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/financialMath";
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { websiteQuoteTotal } from "@/lib/price-lock";
import { useFeeSettings } from "@/hooks/useFeeSettings";
import { combineDateAndTime, formatTimeLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/shared/types";

export type BoardColumnId = "booked" | "rolling" | "working" | "done";

/**
 * The board's columns are the job lifecycle the shop works in (Ty's
 * kitchen-board sketch, Nov 7): Booked → Rolling → Working → Done.
 * They map onto the canonical status vocabulary — "Rolling" is the
 * existing `en_route` status; no new statuses are invented. Cancelled
 * and no-show jobs are not work in flight and never appear here.
 */
export const BOARD_COLUMNS: { id: BoardColumnId; title: string; statuses: string[] }[] = [
  { id: "booked", title: "Booked", statuses: ["requested", "pending", "scheduled", "confirmed", "assigned"] },
  { id: "rolling", title: "Rolling", statuses: ["en_route", "on_the_way", "arrived"] },
  { id: "working", title: "Working", statuses: ["in_progress", "started"] },
  { id: "done", title: "Done", statuses: ["completed", "complete"] },
];

export const BOARD_COLUMN_ORDER: BoardColumnId[] = ["booked", "rolling", "working", "done"];

export function boardColumnForStatus(status: string | null | undefined): BoardColumnId | null {
  const normalized = (status || "").trim().toLowerCase();
  for (const column of BOARD_COLUMNS) {
    if (column.statuses.includes(normalized)) return column.id;
  }
  return null;
}

function startTime(appointment: Appointment): number {
  return combineDateAndTime(appointment.scheduled_date, appointment.scheduled_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export function groupBoardAppointments(appointments: Appointment[]): Record<BoardColumnId, Appointment[]> {
  const groups: Record<BoardColumnId, Appointment[]> = { booked: [], rolling: [], working: [], done: [] };
  for (const appointment of appointments) {
    const column = boardColumnForStatus(appointment.status);
    if (column) groups[column].push(appointment);
  }
  for (const id of BOARD_COLUMN_ORDER) {
    groups[id].sort((a, b) => startTime(a) - startTime(b));
  }
  return groups;
}

/** Forward-only: a card may move to any later column, never backward. */
export function forwardColumns(column: BoardColumnId): BoardColumnId[] {
  return BOARD_COLUMN_ORDER.slice(BOARD_COLUMN_ORDER.indexOf(column) + 1);
}

const MOVE_LABELS: Record<BoardColumnId, string> = {
  booked: "Move to Booked",
  rolling: "Move to Rolling",
  working: "Start job",
  done: "Complete job…",
};

interface JobBoardProps {
  appointments: Appointment[];
  currentDate: Date;
  onSelectAppointment: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
  onCompleteAppointment?: (appointment: Appointment) => void;
}

function BoardCard({
  appointment,
  feeSettings,
  onSelect,
  onMove,
  onDragJob,
}: {
  appointment: Appointment;
  feeSettings: ReturnType<typeof useFeeSettings>["feeSettings"];
  onSelect: (appointment: Appointment) => void;
  onMove: (appointment: Appointment, target: BoardColumnId) => void;
  onDragJob: (appointment: Appointment | null) => void;
}) {
  const column = boardColumnForStatus(appointment.status);
  const targets = column ? forwardColumns(column) : [];
  const lockedQuote = websiteQuoteTotal(appointment);
  const totalDue =
    typeof appointment.job_due === "number" && Number.isFinite(appointment.job_due)
      ? appointment.job_due
      : lockedQuote ?? computeAppointmentTotal(appointment, feeSettings);
  const customerName = appointment.customer?.name || appointment.guest_name || "Customer";
  const vehicleLine = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "";
  const serviceLine = [vehicleLine, appointment.primary_service_name].filter(Boolean).join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!column && column !== "done"}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", appointment.id);
        event.dataTransfer.effectAllowed = "move";
        onDragJob(appointment);
      }}
      onDragEnd={() => onDragJob(null)}
      onClick={() => onSelect(appointment)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(appointment);
      }}
      className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-muted/40"
      data-testid="board-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">{formatTimeLabel(appointment.scheduled_time, "h:mm a")}</p>
        {targets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Move ${customerName}`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {targets.map((target) => (
                <DropdownMenuItem
                  key={target}
                  onSelect={() => onMove(appointment, target)}
                >
                  {MOVE_LABELS[target]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="truncate font-semibold">{customerName}</p>
      {serviceLine && <p className="truncate text-sm text-muted-foreground">{serviceLine}</p>}
      {appointment.location_address && (
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{appointment.location_address}</span>
        </p>
      )}
      <p className="mt-2 text-sm">
        {totalDue > 0 ? (
          <span className="font-semibold">Due ${formatMoney(totalDue)}</span>
        ) : (
          <span className="text-muted-foreground">No amount due</span>
        )}
      </p>
    </div>
  );
}

/**
 * The desk-mode job board (Appointments plan, Section 5): the selected
 * day's jobs as cards in lifecycle columns. Clicking a card opens the
 * side tray (Section 4); moving a card runs the same flows the rest of
 * the app uses — Rolling/Working are status writes through the page's
 * optimistic status handler, and Done opens the real completion dialog
 * (closeout, inspection gate, and money stay intact — never a raw
 * status write). Moves are forward-only in v1; Done is terminal,
 * matching the completed-record rule.
 */
export function JobBoard({ appointments, currentDate, onSelectAppointment, onStatusChange, onCompleteAppointment }: JobBoardProps) {
  const { feeSettings } = useFeeSettings();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<BoardColumnId | null>(null);

  const dayAppointments = useMemo(
    () =>
      appointments.filter((a) => {
        const date = combineDateAndTime(a.scheduled_date, null);
        return date ? isSameDay(date, currentDate) : false;
      }),
    [appointments, currentDate],
  );
  const groups = useMemo(() => groupBoardAppointments(dayAppointments), [dayAppointments]);

  const moveJob = (appointment: Appointment, target: BoardColumnId) => {
    if (target === "done") {
      onCompleteAppointment?.(appointment);
    } else if (target === "rolling") {
      onStatusChange?.(appointment, "en_route");
    } else if (target === "working") {
      onStatusChange?.(appointment, "in_progress");
    }
  };

  const canDropOn = (column: BoardColumnId): boolean => {
    if (!draggingId) return false;
    const dragged = dayAppointments.find((a) => a.id === draggingId);
    const from = dragged ? boardColumnForStatus(dragged.status) : null;
    return !!from && forwardColumns(from).includes(column);
  };

  return (
    <div className="grid grid-cols-1 gap-4 p-2 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((column) => (
        <section
          key={column.id}
          aria-label={column.title}
          className={cn(
            "flex min-h-44 flex-col rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors",
            dropColumn === column.id && "border-primary/60 bg-primary/5",
          )}
          onDragOver={(event) => {
            if (canDropOn(column.id)) {
              event.preventDefault();
              setDropColumn(column.id);
            }
          }}
          onDragLeave={() => setDropColumn((current) => (current === column.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData("text/plain") || draggingId;
            const appointment = dayAppointments.find((a) => a.id === id);
            if (appointment && canDropOn(column.id)) moveJob(appointment, column.id);
            setDraggingId(null);
            setDropColumn(null);
          }}
        >
          <header className="flex items-center justify-between px-1 pb-3">
            <h3 className="font-display text-base font-bold">{column.title}</h3>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {groups[column.id].length}
            </span>
          </header>
          <div className="flex flex-1 flex-col gap-3">
            {groups[column.id].length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No jobs</p>
            ) : (
              groups[column.id].map((appointment) => (
                <BoardCard
                  key={appointment.id}
                  appointment={appointment}
                  feeSettings={feeSettings}
                  onSelect={onSelectAppointment}
                  onMove={moveJob}
                  onDragJob={(job) => {
                    setDraggingId(job?.id ?? null);
                    if (!job) setDropColumn(null);
                  }}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
