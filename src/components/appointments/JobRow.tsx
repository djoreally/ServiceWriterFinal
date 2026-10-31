import { memo, useRef } from "react";
import type { Appointment } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, Car, CheckCircle, Clock, MapPin, MoreVertical, Phone } from "lucide-react";
import { formatMoney } from "@/lib/financialMath";
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { websiteQuoteTotal } from "@/lib/price-lock";
import { useFeeSettings } from "@/hooks/useFeeSettings";
import { formatTimeLabel } from "@/lib/datetime";
import { resolveStatusChip, statusToneClasses } from "@/lib/status-tone";
import { StatusToneChip } from "@/components/appointments/StatusToneChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface AppointmentWithSource extends Appointment {
  source?: "manual" | "online_booking" | "ai_intake" | string;
}

interface JobRowProps {
  appointment: AppointmentWithSource;
  onClick: (appointment: Appointment) => void;
  onComplete?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "C";
}

function metadataText(appointment: AppointmentWithSource, key: string): string | null {
  const value = (appointment.intake_responses as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Job Row (Batch 2 spec component) — the appointments list row: 4px status
 * bar in the B1 tone color, time first, avatar + customer, vehicle · service
 * and address lines, and a right rail carrying the tone chip and the money
 * (invoice total + due dot). Title/service words come from the server's
 * composed fields (display_title / primary_service_name), never a UUID and
 * never a client-synthesized title.
 *
 * Money seam: list rows carry no invoice/payment facts until B5/B6 land;
 * the amount shown is the same price-lock-aware estimate the old card
 * showed (locked website quote verbatim, else the fee-loaded total) — the
 * dot marks "amount due on this job", nothing more.
 */
export const JobRow = memo(function JobRow({ appointment, onClick, onComplete, onStatusChange }: JobRowProps) {
  const { feeSettings } = useFeeSettings();
  const lockedQuote = websiteQuoteTotal(appointment);
  const totalDue = lockedQuote ?? computeAppointmentTotal(appointment, feeSettings);
  const chip = resolveStatusChip(appointment);
  const tone = statusToneClasses(chip.tone);

  const customerName = appointment.customer?.name || appointment.guest_name || "Customer";
  const phone = appointment.customer?.phone || appointment.guest_phone || null;
  const vehicles = Array.isArray((appointment as Appointment & { vehicles?: Appointment["vehicle"][] }).vehicles)
    ? ((appointment as Appointment & { vehicles?: Appointment["vehicle"][] }).vehicles ?? []).filter(Boolean)
    : appointment.vehicle ? [appointment.vehicle] : [];
  const vehicleLine = vehicles.length > 0
    ? vehicles.map((vehicle) => `${vehicle!.year} ${vehicle!.make} ${vehicle!.model}`).join(" • ")
    : null;
  const serviceLine = appointment.primary_service_name || appointment.service_catalog?.name || null;
  const address = appointment.location_address || metadataText(appointment, "location_address");
  const canComplete = appointment.status !== "completed" && appointment.status !== "cancelled";
  const canChangeStatus = canComplete;

  const lastTouchTapRef = useRef(0);
  const handleRowOpen = () => {
    const coarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (!coarsePointer) {
      onClick(appointment);
      return;
    }
    const now = Date.now();
    if (now - lastTouchTapRef.current <= 360) {
      lastTouchTapRef.current = 0;
      onClick(appointment);
      return;
    }
    lastTouchTapRef.current = now;
  };

  return (
    <article
      className="relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors hover:border-primary/40"
      onClick={handleRowOpen}
      aria-label={`${appointment.display_title || customerName}. Double tap to open appointment details.`}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} />
      <div className="flex gap-3 p-4 pl-5">
        <div className="w-16 shrink-0">
          <p className="font-display text-base font-extrabold leading-tight">
            {formatTimeLabel(appointment.scheduled_time, "h:mm a", "—")}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {appointment.duration_minutes} min
          </p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-bold text-blue-strong">
          {initialsOf(customerName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-base font-bold leading-tight">{customerName}</p>
            <div className="flex shrink-0 items-center gap-1">
              {appointment.source === "ai_intake" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">
                  <Bot className="h-3 w-3" />AI
                </span>
              )}
              <StatusToneChip label={chip.label} tone={chip.tone} />
              {canChangeStatus && (onComplete || onStatusChange) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Appointment actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canComplete && onComplete && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onComplete(appointment); }} className="gap-2">
                        <CheckCircle className="h-4 w-4" />Mark Complete
                      </DropdownMenuItem>
                    )}
                    {onStatusChange && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(appointment, "confirmed"); }} disabled={appointment.status === "confirmed"}>
                          {appointment.status === "pending" ? "Approve" : "Confirm"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(appointment, "in_progress"); }} disabled={appointment.status === "in_progress"}>
                          Start Service
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(appointment, "cancelled"); }} disabled={appointment.status === "cancelled"} className="text-destructive">
                          Cancel
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {(vehicleLine || serviceLine) && (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Car className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {[vehicleLine, serviceLine].filter(Boolean).join(" · ") || "Vehicle not specified"}
              </span>
            </p>
          )}
          {address && (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </p>
          )}
          {phone && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {phone}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1.5 text-sm">
            {totalDue > 0 ? (
              <>
                <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", statusToneClasses("warning").dot)} />
                <span className="font-semibold">Due ${formatMoney(totalDue)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No amount due</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});
