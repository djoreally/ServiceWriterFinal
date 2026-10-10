/**
 * Field Job View — redesigned for the technician in the driveway.
 *
 * North star: cognitive load of the field technician.
 * - Bright sunlight: high contrast, large type, no subtle grays for critical info
 * - Greasy hands: minimum 64px touch targets, primary action bottom-anchored (thumb zone)
 * - Time pressure: one job on screen, only the current step's info, one primary action
 * - Progressive disclosure: each status shows ONLY what the tech needs right now
 *
 * Status flow: assigned → en_route → arrived → in_progress → completed
 * Minimum taps for a full job: 4 (En Route → Arrived → Start Job → Complete)
 */

import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Navigation,
  MapPin,
  Play,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  ChevronRight,
  AlertTriangle,
  Wrench,
  Car,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealTimeTechStatus } from "@/hooks/useRealTimeTechStatus";
import { formatTimeLabel } from "@/lib/datetime";
import { toast } from "@/components/ui/sonner";

interface FieldJobViewProps {
  appointment: {
    id: string;
    dispatch_status: string;
    scheduled_time: string;
    guest_name: string | null;
    guest_phone: string | null;
    location_address: string | null;
    customer?: { name: string };
    service_catalog?: { name: string };
    vehicle?: { year?: string; make?: string; model?: string } | null;
  };
  technician_id: string;
  onStatusChange?: () => void;
  onNextJob?: () => void;
}

type JobStatus = "assigned" | "en_route" | "arrived" | "in_progress" | "completed";

const STATUS_META: Record<JobStatus, { label: string; hint: string }> = {
  assigned: { label: "Up next", hint: "Head to the customer" },
  en_route: { label: "En route", hint: "You're on your way" },
  arrived: { label: "On site", hint: "Start when ready" },
  in_progress: { label: "Job active", hint: "Work the job" },
  completed: { label: "Done", hint: "Nice work" },
};

function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function FieldJobView({
  appointment,
  technician_id,
  onStatusChange,
  onNextJob,
}: FieldJobViewProps) {
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { transitionToEnRoute, transitionToArrived, transitionToInProgress } =
    useRealTimeTechStatus(technician_id);

  const rawStatus = appointment.dispatch_status as JobStatus;
  const status: JobStatus = STATUS_META[rawStatus] ? rawStatus : "assigned";
  const meta = STATUS_META[status];
  const customerName =
    appointment.customer?.name || appointment.guest_name || "Customer";
  const vehicleLabel = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model]
        .filter(Boolean)
        .join(" ")
    : null;

  const openNavigation = () => {
    if (appointment.location_address) {
      const encoded = encodeURIComponent(appointment.location_address);
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
        "_blank"
      );
    }
  };

  const callCustomer = () => {
    if (appointment.guest_phone) {
      window.open(`tel:${appointment.guest_phone}`);
    }
  };

  const doTransition = async () => {
    if (transitioning) return;
    setTransitioning(true);
    setError(null);
    try {
      let location: { lat: number; lng: number } | undefined;
      if (status === "assigned" || status === "en_route") {
        try {
          location = await getLocation();
        } catch {
          // Proceed without location — don't block the tech
        }
      }
      if (status === "assigned") await transitionToEnRoute(appointment.id, location);
      else if (status === "en_route") await transitionToArrived(appointment.id, location);
      else if (status === "arrived") await transitionToInProgress(appointment.id);
      onStatusChange?.();
    } catch (err: unknown) {
      const msg = errorMessage(err, "Couldn't update status. Try again.");
      setError(msg);
      toast.error(msg);
    } finally {
      setTransitioning(false);
    }
  };

  const primaryAction: { label: string; icon: typeof Play } | null =
    status === "assigned"
      ? { label: "En Route", icon: Navigation }
      : status === "en_route"
        ? { label: "I've Arrived", icon: MapPin }
        : status === "arrived"
          ? { label: "Start Job", icon: Play }
          : status === "in_progress"
            ? { label: "Complete Job", icon: CheckCircle2 }
            : null;

  const PrimaryIcon = primaryAction?.icon ?? Play;

  return (
    <div className="flex min-h-[60vh] flex-col" data-testid="field-job-view">
      {/* Status banner — high contrast, glanceable in sunlight */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <span
          className={cn(
            "flex h-3 w-3 shrink-0 rounded-full",
            status === "completed" ? "bg-green-400" : "bg-amber-400 animate-pulse"
          )}
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
            {meta.label}
          </p>
          <p className="text-base text-white/90">{meta.hint}</p>
        </div>
        <span className="ml-auto font-mono text-lg font-semibold text-white tabular-nums">
          {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
        </span>
      </div>

      {/* Job context — only what's needed for THIS status */}
      <div className="flex-1 space-y-5 px-5 py-6">
        {/* Customer — always visible, H1 */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {customerName}
          </h1>
          <p className="mt-1 text-base text-white/70">
            {appointment.service_catalog?.name || "Service"}
          </p>
        </div>

        {/* Address — visible until job starts */}
        {appointment.location_address && status !== "in_progress" && status !== "completed" && (
          <button
            onClick={openNavigation}
            className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-left active:bg-white/10"
          >
            <MapPin className="h-6 w-6 shrink-0 text-white/80" />
            <span className="flex-1 font-mono text-base text-white leading-snug">
              {appointment.location_address}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/50" />
          </button>
        )}

        {/* Vehicle — visible when on site / working */}
        {vehicleLabel && (status === "arrived" || status === "in_progress") && (
          <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
            <Car className="h-6 w-6 shrink-0 text-white/80" />
            <span className="text-lg font-medium text-white">{vehicleLabel}</span>
          </div>
        )}

        {/* In-progress work hint */}
        {status === "in_progress" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <Wrench className="h-6 w-6 shrink-0 text-amber-300" />
            <div>
              <p className="text-base font-medium text-amber-100">
                Job is active
              </p>
              <p className="mt-0.5 text-sm text-amber-100/70">
                Finish the work, then tap Complete Job below.
              </p>
            </div>
          </div>
        )}

        {/* Completed summary */}
        {status === "completed" && (
          <div className="flex items-start gap-3 rounded-xl border border-green-400/30 bg-green-400/10 p-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-green-300" />
            <div>
              <p className="text-base font-medium text-green-100">Job complete</p>
              <p className="mt-0.5 text-sm text-green-100/70">
                {customerName} · {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
              </p>
            </div>
          </div>
        )}

        {/* Error — plain language, retry */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-400/40 bg-red-500/10 p-4"
          >
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-300" />
            <div className="flex-1">
              <p className="text-base font-medium text-red-100">{error}</p>
              <button
                onClick={doTransition}
                className="mt-2 text-base font-semibold text-red-200 underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Secondary actions — call customer (thumb-reachable, not primary) */}
      {appointment.guest_phone && status !== "completed" && (
        <div className="px-5 pb-3">
          <button
            onClick={callCustomer}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-4 text-lg font-medium text-white active:bg-white/10"
          >
            <Phone className="h-5 w-5" />
            <span className="font-mono tabular-nums">{appointment.guest_phone}</span>
          </button>
        </div>
      )}

      {/* Primary action — bottom-anchored thumb zone, 72px minimum */}
      <div className="sticky bottom-0 border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur">
        {primaryAction && status !== "completed" ? (
          <Button
            onClick={doTransition}
            disabled={transitioning}
            className="h-[72px] w-full text-xl font-semibold"
            data-testid="field-job-primary-action"
          >
            {transitioning ? (
              <Loader2 className="mr-3 h-6 w-6 animate-spin" />
            ) : (
              <PrimaryIcon className="mr-3 h-6 w-6" />
            )}
            {transitioning ? "Working…" : primaryAction.label}
          </Button>
        ) : (
          <Button
            onClick={onNextJob}
            className="h-[72px] w-full text-xl font-semibold"
            data-testid="field-job-next"
          >
            Next Job
            <ChevronRight className="ml-2 h-6 w-6" />
          </Button>
        )}
        {/* Time context — quiet, mono */}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/50">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">
            Scheduled {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Loading state — skeleton matching the layout above.
 * Never a bare spinner: the tech sees structure immediately.
 */
export function FieldJobViewSkeleton() {
  return (
    <div className="flex min-h-[60vh] flex-col" aria-busy="true" aria-label="Loading job">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="h-4 w-24 animate-pulse rounded bg-white/15" />
        <div className="mt-2 h-5 w-40 animate-pulse rounded bg-white/10" />
      </div>
      <div className="flex-1 space-y-5 px-5 py-6">
        <div className="h-9 w-2/3 animate-pulse rounded bg-white/15" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />
        <div className="h-16 w-full animate-pulse rounded-xl bg-white/10" />
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="h-[72px] w-full animate-pulse rounded-xl bg-white/15" />
      </div>
    </div>
  );
}

/**
 * Empty state — no jobs assigned. Expressive, one action.
 */
export function FieldJobViewEmpty({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <CheckCircle2 className="h-12 w-12 text-white/30" />
      <h2 className="mt-4 text-2xl font-semibold text-white">No jobs right now</h2>
      <p className="mt-2 max-w-xs text-base text-white/60">
        When dispatch assigns you work, it shows up here. You're good.
      </p>
      {onRefresh && (
        <Button onClick={onRefresh} variant="outline" className="mt-6 h-12 px-6 text-base">
          Check again
        </Button>
      )}
    </div>
  );
}
