import { useState } from "react";
import { ArrowUpRight, CalendarClock, Car, MapPin, Navigation, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppointmentStatusChip } from "@/components/appointments/StatusToneChip";
import { JobActionButton } from "@/components/appointments/JobActionButton";
import { EditAppointmentDialog } from "@/components/appointments/EditAppointmentDialog";
import { ClickableEmail, ClickablePhone } from "@/components/ui/clickable-contact";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateLabel, formatTimeLabel } from "@/lib/datetime";
import { formatMoney } from "@/lib/financialMath";
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { websiteQuoteTotal } from "@/lib/price-lock";
import { useFeeSettings } from "@/hooks/useFeeSettings";
import { realCustomerEmail } from "@/lib/contact-display";
import type { Appointment } from "@/shared/types";

interface AppointmentTrayProps {
  appointment: Appointment | null;
  onOpenChange: (open: boolean) => void;
  onOpenFullRecord: (appointment: Appointment) => void;
  onChanged: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  );
}

/**
 * The job side tray (Appointments plan, Section 4): clicking a job on the
 * appointments page slides its working summary over the page instead of
 * navigating away — the page stays home base. The tray carries the job's
 * customer, vehicle, service, location, and money (mirroring JobRow's
 * server-composed money seam verbatim), the working lifecycle action
 * (JobActionButton), edit/reschedule, and directions. The full record is
 * one tap deeper via onOpenFullRecord.
 */
export function AppointmentTray({ appointment, onOpenChange, onOpenFullRecord, onChanged }: AppointmentTrayProps) {
  const { feeSettings } = useFeeSettings();
  const [editOpen, setEditOpen] = useState(false);

  const customerName = appointment?.customer?.name || appointment?.guest_name || "Customer";
  const phone = appointment?.customer?.phone || appointment?.guest_phone || null;
  const email = appointment ? realCustomerEmail(appointment.customer?.email || appointment.guest_email) : null;
  const vehicleLine = appointment?.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "";
  const address = appointment?.location_address || appointment?.customer?.address || "";

  // Same money seam as JobRow: server-composed job_due wins verbatim,
  // else the locked website quote, else the fee-loaded total.
  const lockedQuote = appointment ? websiteQuoteTotal(appointment) : null;
  const totalDue = appointment
    ? typeof appointment.job_due === "number" && Number.isFinite(appointment.job_due)
      ? appointment.job_due
      : lockedQuote ?? computeAppointmentTotal(appointment, feeSettings)
    : 0;

  const openDirections = () => {
    if (!address) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <>
      <Sheet open={!!appointment} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {appointment && (
            <>
              <SheetHeader className="space-y-3 border-b border-border px-6 py-5 text-left">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <AppointmentStatusChip appointment={appointment} />
                  {appointment.confirmation_code && (
                    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {appointment.confirmation_code}
                    </span>
                  )}
                </div>
                <SheetTitle className="font-display text-2xl font-extrabold leading-tight tracking-tight">
                  {appointment.display_title || appointment.title || "Appointment"}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" aria-hidden />
                    {formatDateLabel(appointment.scheduled_date, "EEE, MMM d")} at{" "}
                    {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{appointment.duration_minutes} min</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                <section aria-label="Customer">
                  <SectionLabel>Customer</SectionLabel>
                  <p className="mt-1.5 font-display text-lg font-bold leading-snug">{customerName}</p>
                  <div className="mt-2 divide-y divide-border/60 border-t border-border/60">
                    {phone && (
                      <ClickablePhone
                        phone={phone}
                        className="flex min-h-[48px] w-full items-center gap-3 rounded-md px-2 py-2 -mx-2 text-[15px] text-foreground no-underline hover:bg-muted/40 hover:text-foreground hover:no-underline"
                        iconClassName="h-5 w-5 text-primary"
                      >
                        <span className="sr-only">Call </span>
                        {formatPhoneDisplay(phone)}
                      </ClickablePhone>
                    )}
                    {email && (
                      <ClickableEmail
                        email={email}
                        className="flex min-h-[48px] w-full items-center gap-3 rounded-md px-2 py-2 -mx-2 text-[15px] text-foreground no-underline hover:bg-muted/40 hover:text-foreground hover:no-underline"
                        iconClassName="h-5 w-5 text-primary"
                      >
                        <span className="min-w-0 flex-1 break-all text-[15px]">
                          <span className="sr-only">Email </span>
                          {email}
                        </span>
                      </ClickableEmail>
                    )}
                  </div>
                </section>

                {(vehicleLine || appointment.primary_service_name) && (
                  <section aria-label="Vehicle and service">
                    <SectionLabel>Vehicle &amp; service</SectionLabel>
                    {vehicleLine && (
                      <p className="mt-1.5 flex items-center gap-2 text-[15px]">
                        <Car className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        {vehicleLine}
                      </p>
                    )}
                    {appointment.primary_service_name && (
                      <p className="mt-1 text-[15px] text-muted-foreground">{appointment.primary_service_name}</p>
                    )}
                  </section>
                )}

                {address && (
                  <section aria-label="Location">
                    <SectionLabel>Location</SectionLabel>
                    <button
                      onClick={openDirections}
                      className="mt-1.5 flex w-full items-start gap-2 rounded-md px-2 py-1 -mx-2 text-left text-[15px] transition-colors hover:bg-muted/40"
                    >
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 break-words">{address}</span>
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </section>
                )}

                <section aria-label="Payment">
                  <SectionLabel>Payment</SectionLabel>
                  <p className="mt-1.5 flex items-baseline justify-between text-[15px]">
                    <span className="text-muted-foreground">Amount due</span>
                    {totalDue > 0 ? (
                      <span className="font-display text-lg font-bold">Due ${formatMoney(totalDue)}</span>
                    ) : (
                      <span className="font-semibold">No amount due</span>
                    )}
                  </p>
                </section>
              </div>

              <div className="space-y-3 border-t border-border px-6 py-4">
                <JobActionButton appointment={appointment} onUpdated={onChanged} className="w-full" />
                <div className="flex gap-3">
                  <Button variant="outline" className="min-h-[48px] flex-1 gap-2" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit / Reschedule
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-[48px] flex-1 gap-2"
                    onClick={openDirections}
                    disabled={!address}
                  >
                    <Navigation className="h-4 w-4" /> Directions
                  </Button>
                </div>
                <Button className="min-h-[48px] w-full gap-2" onClick={() => onOpenFullRecord(appointment)}>
                  Open full record <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <EditAppointmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        appointment={appointment}
        onSuccess={() => {
          setEditOpen(false);
          onChanged();
        }}
      />
    </>
  );
}
