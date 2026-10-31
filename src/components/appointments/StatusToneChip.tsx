import { cn } from "@/lib/utils";
import { resolveStatusChip, statusToneClasses } from "@/lib/status-tone";
import type { StatusTone } from "@/lib/status-vocabulary";

/**
 * The redesign status chip: the server's composed label (B1) in the tone's
 * token pair. Never a local status→label map, never a hardcoded status name.
 */
export function StatusToneChip({
  label,
  tone,
  className,
}: {
  label: string;
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusToneClasses(tone).chip,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function AppointmentStatusChip({
  appointment,
  className,
}: {
  appointment: { status?: string | null; status_label?: string | null; status_tone?: StatusTone | string | null };
  className?: string;
}) {
  const chip = resolveStatusChip(appointment);
  return <StatusToneChip label={chip.label} tone={chip.tone} className={className} />;
}
