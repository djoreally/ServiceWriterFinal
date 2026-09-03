export interface SchedulingSettings {
  day_hours?: Record<string, unknown> | null;
  opening_time?: string | null;
  closing_time?: string | null;
  working_days?: string[] | null;
  buffer_time_before?: number | null;
  buffer_time_after?: number | null;
  min_lead_time_hours?: number | null;
}

export interface LocalScheduleParts {
  date: string;
  weekday: string;
  minutes: number;
}

export type AvailabilityViolation =
  | "outside_business_hours"
  | "lead_time"
  | "blackout_date"
  | "schedule_conflict";

function parseMinutes(value: unknown, fallback: string): number {
  const text = typeof value === "string" ? value : fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function configuredHours(settings: SchedulingSettings, weekday: string) {
  const raw = settings.day_hours && typeof settings.day_hours === "object"
    ? (settings.day_hours[weekday] as Record<string, unknown> | undefined)
    : undefined;
  const explicit = typeof raw?.is_open === "boolean"
    ? raw.is_open
    : typeof raw?.isOpen === "boolean"
      ? raw.isOpen
      : undefined;
  const isOpen = explicit ?? Boolean(
    settings.working_days?.some((day) => day.toLowerCase() === weekday),
  );
  return {
    isOpen,
    open: parseMinutes(raw?.open, settings.opening_time || "09:00"),
    close: parseMinutes(raw?.close, settings.closing_time || "17:00"),
  };
}

export function validateLocalAvailability(input: {
  start: LocalScheduleParts;
  end: LocalScheduleParts;
  settings: SchedulingSettings;
  startsAtMs: number;
  nowMs?: number;
  blackout?: boolean;
}): AvailabilityViolation | null {
  const { start, end, settings } = input;
  const hours = configuredHours(settings, start.weekday);
  if (
    start.date !== end.date ||
    !hours.isOpen ||
    start.minutes < hours.open ||
    end.minutes > hours.close
  ) {
    return "outside_business_hours";
  }

  const leadHours = Math.max(0, Number(settings.min_lead_time_hours || 0));
  const nowMs = input.nowMs ?? Date.now();
  if (input.startsAtMs < nowMs + leadHours * 60 * 60 * 1000) return "lead_time";
  if (input.blackout) return "blackout_date";
  return null;
}

export function conflictWindow(input: {
  startsAt: string;
  endsAt: string;
  bufferTimeBefore?: number | null;
  bufferTimeAfter?: number | null;
}) {
  const before = Math.max(0, Number(input.bufferTimeBefore || 0));
  const after = Math.max(0, Number(input.bufferTimeAfter || 0));
  return {
    queryStart: new Date(Date.parse(input.startsAt) - after * 60_000).toISOString(),
    queryEnd: new Date(Date.parse(input.endsAt) + before * 60_000).toISOString(),
  };
}
