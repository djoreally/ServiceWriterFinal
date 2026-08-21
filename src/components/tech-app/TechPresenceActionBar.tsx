/**
 * TechPresenceActionBar — Phase 3 single presence + action model.
 *
 * One control replaces the old scattered header/More/Shift controls. It renders
 * the state-driven ladder: Start shift → En route → Arrived → Start work →
 * Complete, plus break control, and states exactly what blocks the next step.
 */

import { Button } from "@/components/ui/button";
import { Coffee, Loader2, Navigation, MapPin, Play, CheckCircle2, Power } from "lucide-react";
import { cn } from "@/lib/utils";

export type TechPresenceAction =
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "complete"
  | "open_job";

const ICONS: Record<TechPresenceAction, typeof Play> = {
  clock_in: Power,
  clock_out: Power,
  break_start: Coffee,
  break_end: Coffee,
  en_route: Navigation,
  arrived: MapPin,
  in_progress: Play,
  complete: CheckCircle2,
  open_job: Play,
};

export interface TechPresenceActionBarProps {
  accent: string;
  muted: string;
  isOnShift: boolean;
  isOnBreak: boolean;
  jobStatus: string | null;
  hasJob: boolean;
  pendingAction: TechPresenceAction | null;
  blockedReason?: string | null;
  errorMessage?: string | null;
  onAction: (action: TechPresenceAction) => void;
}

/** Single source of truth for the next field action, derived from presence + job state. */
export function resolveTechPresenceAction(input: {
  isOnShift: boolean;
  isOnBreak: boolean;
  jobStatus: string | null;
  hasJob: boolean;
}): { action: TechPresenceAction; label: string; helper: string } {
  if (!input.isOnShift) {
    return { action: "clock_in", label: "Start shift", helper: "Clock in to receive and move jobs." };
  }
  if (input.isOnBreak) {
    return { action: "break_end", label: "End break", helper: "You are on break — dispatch sees you as unavailable." };
  }
  if (!input.hasJob) {
    return { action: "clock_out", label: "End shift", helper: "No jobs remaining today." };
  }

  switch (input.jobStatus) {
    case "en_route":
      return { action: "arrived", label: "Mark arrived", helper: "Tap when you are on site." };
    case "arrived":
      return { action: "in_progress", label: "Start work", helper: "Starts the job clock and opens the checklist." };
    case "in_progress":
    case "ready_review":
      return { action: "complete", label: "Finish in workspace", helper: "Required evidence is enforced in the job workspace." };
    case "completed":
      return { action: "open_job", label: "Review handoff", helper: "Job complete — review the handoff summary." };
    default:
      return { action: "en_route", label: "Go en route", helper: "Marks you en route and opens directions." };
  }
}

export function TechPresenceActionBar({
  accent,
  muted,
  isOnShift,
  isOnBreak,
  jobStatus,
  hasJob,
  pendingAction,
  blockedReason,
  errorMessage,
  onAction,
}: TechPresenceActionBarProps) {
  const next = resolveTechPresenceAction({ isOnShift, isOnBreak, jobStatus, hasJob });
  const Icon = ICONS[next.action];
  const busy = pendingAction !== null;

  return (
    <section className="space-y-2">
      <h2 className="font-mono text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: muted }}>
        Presence
      </h2>
      <div className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold">
              {isOnBreak ? "On break" : isOnShift ? "On shift" : "Off shift"}
            </p>
            <p className="text-xs" style={{ color: muted }}>
              {blockedReason || next.helper}
            </p>
          </div>
          <span
            className="h-3 w-3 rounded-md"
            style={{ backgroundColor: isOnBreak ? "#f59e0b" : isOnShift ? accent : "#9ca3af" }}
            aria-hidden
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className="h-13 min-w-[200px] flex-1 rounded-xl py-3 text-base font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-70"
            style={{ backgroundColor: accent }}
            onClick={() => onAction(next.action)}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Icon className="mr-2 h-5 w-5" />}
            {busy ? "Working…" : next.label}
          </Button>

          {isOnShift && !isOnBreak && (
            <Button
              variant="outline"
              className="h-13 rounded-xl border-black/10 bg-white py-3 text-sm font-extrabold uppercase tracking-[0.08em]"
              style={{ color: accent }}
              onClick={() => onAction("break_start")}
              disabled={busy}
            >
              <Coffee className="mr-2 h-4 w-4" /> Break
            </Button>
          )}

          {isOnShift && (
            <Button
              variant="outline"
              className="h-13 rounded-xl border-black/10 bg-white py-3 text-sm font-extrabold uppercase tracking-[0.08em]"
              onClick={() => onAction("clock_out")}
              disabled={busy}
            >
              <Power className="mr-2 h-4 w-4" /> End shift
            </Button>
          )}
        </div>

        {errorMessage && <p className={cn("mt-3 text-xs font-semibold text-red-600")}>{errorMessage}</p>}
      </div>
    </section>
  );
}
