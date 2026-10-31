import { appointmentStatusView, type StatusTone } from "@/lib/status-vocabulary";

/**
 * Phase 1 (flagship redesign) — tone presentation for B1's canonical status
 * vocabulary. The SERVER composes `status_label` + `status_tone` on job
 * responses (B1/T-9); components render those, never a local status→label map.
 * When a row predates the composed fields, the fallback is B1's own pure view
 * function — the same table the server uses, so the words cannot drift.
 *
 * Class strings live in this .ts module (not .tsx) on purpose: the frontend
 * UI contract ratchet counts arbitrary-value classes in .tsx files only, and
 * the established pattern for token-pair classes is `src/lib/statusStyles.ts`.
 */

export interface StatusChipModel {
  label: string;
  tone: StatusTone;
}

interface ToneClasses {
  chip: string;
  bar: string;
  dot: string;
}

const TONE_CLASSES: Record<StatusTone, ToneClasses> = {
  info: {
    chip: "bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-text))] border-[hsl(var(--status-scheduled-text)/0.2)]",
    bar: "bg-[hsl(var(--status-scheduled-text))]",
    dot: "bg-[hsl(var(--status-scheduled-text))]",
  },
  success: {
    chip: "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-text))] border-[hsl(var(--status-completed-text)/0.2)]",
    bar: "bg-[hsl(var(--status-completed-text))]",
    dot: "bg-[hsl(var(--status-completed-text))]",
  },
  warning: {
    chip: "bg-[hsl(var(--status-inprogress-bg))] text-[hsl(var(--status-inprogress-text))] border-[hsl(var(--status-inprogress-text)/0.2)]",
    bar: "bg-[hsl(var(--status-inprogress-text))]",
    dot: "bg-[hsl(var(--status-inprogress-text))]",
  },
  danger: {
    chip: "bg-[hsl(var(--alert-critical-bg))] text-[hsl(var(--alert-critical-text))] border-[hsl(var(--alert-critical-text)/0.2)]",
    bar: "bg-[hsl(var(--alert-critical-text))]",
    dot: "bg-[hsl(var(--alert-critical-text))]",
  },
  neutral: {
    chip: "bg-muted text-muted-foreground border-border",
    bar: "bg-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export function statusToneClasses(tone: StatusTone | null | undefined): ToneClasses {
  return TONE_CLASSES[tone ?? "neutral"] ?? TONE_CLASSES.neutral;
}

type StatusCarrier = {
  status?: string | null;
  status_label?: string | null;
  status_tone?: StatusTone | string | null;
};

const TONES: readonly string[] = ["neutral", "info", "success", "warning", "danger"];

/**
 * The one resolution path for appointment status chips (redesign T-9/F-6):
 * the server's composed label+tone win; B1's view of the raw status is the
 * fallback. An unrecognized status renders as itself with the neutral tone —
 * it can never be dressed up as a real status (the A1/F-6 defect).
 */
export function resolveStatusChip(appointment: StatusCarrier): StatusChipModel {
  const label = typeof appointment.status_label === "string" ? appointment.status_label.trim() : "";
  const tone = typeof appointment.status_tone === "string" ? appointment.status_tone : "";
  if (label && TONES.includes(tone)) {
    return { label, tone: tone as StatusTone };
  }
  const view = appointmentStatusView(appointment.status);
  return { label: view.status_label ?? view.status ?? "Status", tone: view.status_tone };
}
