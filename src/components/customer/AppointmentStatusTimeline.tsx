import { Check, Calendar, MapPin, Wrench, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface TimelineProps {
  status: string;
  createdAt?: string | null;
  assignedAt?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
}

interface Step {
  key: string;
  label: string;
  icon: typeof Check;
  timestamp?: string | null;
  /** lower-case statuses that count as having reached this step */
  reachedBy: string[];
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  scheduled: 1,
  confirmed: 1,
  assigned: 2,
  en_route: 3,
  on_the_way: 3,
  arrived: 3,
  in_progress: 3,
  completed: 4,
};

export function AppointmentStatusTimeline({
  status,
  createdAt,
  assignedAt,
  actualStartTime,
  actualEndTime,
}: TimelineProps) {
  const normalized = (status || "").toLowerCase();
  const rank = STATUS_RANK[normalized] ?? 1;

  const steps: Step[] = [
    {
      key: "scheduled",
      label: "Scheduled",
      icon: Calendar,
      timestamp: createdAt,
      reachedBy: ["pending", "scheduled", "confirmed", "assigned", "en_route", "on_the_way", "arrived", "in_progress", "completed"],
    },
    {
      key: "confirmed",
      label: "Confirmed",
      icon: Check,
      timestamp: assignedAt ?? null,
      reachedBy: ["confirmed", "assigned", "en_route", "on_the_way", "arrived", "in_progress", "completed"],
    },
    {
      key: "en_route",
      label: "En Route",
      icon: MapPin,
      timestamp: actualStartTime,
      reachedBy: ["en_route", "on_the_way", "arrived", "in_progress", "completed"],
    },
    {
      key: "completed",
      label: "Completed",
      icon: CheckCircle2,
      timestamp: actualEndTime,
      reachedBy: ["completed"],
    },
  ];

  if (normalized === "cancelled" || normalized === "canceled") {
    return (
      <div className="text-xs text-muted-foreground italic">
        This appointment was cancelled.
      </div>
    );
  }

  const formatTs = (ts?: string | null) => {
    if (!ts) return null;
    try {
      return format(parseISO(ts), "MMM d, h:mm a");
    } catch {
      return null;
    }
  };

  return (
    <div className="flex items-start justify-between gap-1 w-full" aria-label="Appointment status timeline">
      {steps.map((step, idx) => {
        const reached = step.reachedBy.includes(normalized) || rank >= STATUS_RANK[step.key];
        const isCurrent = STATUS_RANK[step.key] === rank;
        const Icon = reached ? Check : step.icon;
        const tsLabel = formatTs(step.timestamp);
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.key} className="flex-1 flex flex-col items-center relative min-w-0">
            {/* Connector line to next step */}
            {!isLast && (
              <div
                className={cn(
                  "absolute top-3 left-1/2 right-0 h-0.5 -z-0",
                  rank > STATUS_RANK[step.key] ? "bg-primary" : "bg-border",
                )}
                style={{ width: "100%" }}
                aria-hidden
              />
            )}

            <div
              className={cn(
                "relative z-10 h-6 w-6 rounded-md flex items-center justify-center border-2 transition-colors",
                reached
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-border text-muted-foreground",
                isCurrent && !reached && "border-primary text-primary",
                isCurrent && reached && "ring-2 ring-primary/30",
              )}
            >
              <Icon className="h-3 w-3" />
            </div>

            <div className="mt-2 text-center min-w-0">
              <p
                className={cn(
                  "text-[10px] font-medium leading-tight",
                  reached ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {tsLabel && (
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">
                  {tsLabel}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
