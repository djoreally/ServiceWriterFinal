/**
 * Business hours resolution — single source of truth for "is the shop open on
 * this date, and between which times".
 *
 * Shops configure hours per weekday in `business_profiles.day_hours`. The flat
 * `opening_time` / `closing_time` pair is only a legacy fallback for days that
 * have no per-day entry. Both `is_open` and `isOpen` key styles exist in live
 * data, so both are honoured.
 */

export interface DayWindow {
  open: string;
  close: string;
}

export type DayHoursMap = Record<string, unknown> | null | undefined;

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function weekdayKey(date: Date): string {
  return WEEKDAY_KEYS[date.getDay()];
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,2}:\d{2}/.test(value);
}

/** Read the raw per-day entry for a date, if the shop configured one. */
function dayEntry(dayHours: DayHoursMap, date: Date): Record<string, unknown> | null {
  if (!dayHours || typeof dayHours !== "object") return null;
  const entry = (dayHours as Record<string, unknown>)[weekdayKey(date)];
  return entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
}

/** True when the per-day entry explicitly marks the day closed. */
function entryClosed(entry: Record<string, unknown>): boolean {
  const flag = entry.is_open ?? entry.isOpen;
  return flag === false;
}

/**
 * Resolve the bookable window for a date.
 * Returns `null` when the shop is closed that day.
 */
export function resolveDayWindow(
  dayHours: DayHoursMap,
  date: Date,
  fallbackOpen: string | null,
  fallbackClose: string | null,
): DayWindow | null {
  const entry = dayEntry(dayHours, date);

  if (entry) {
    if (entryClosed(entry)) return null;
    const open = isTime(entry.open) ? entry.open : fallbackOpen;
    const close = isTime(entry.close) ? entry.close : fallbackClose;
    if (open && close) return { open: open.slice(0, 5), close: close.slice(0, 5) };
  }

  if (fallbackOpen && fallbackClose) {
    return { open: fallbackOpen.slice(0, 5), close: fallbackClose.slice(0, 5) };
  }
  return null;
}

/**
 * True when the date is a day the shop actually operates.
 *
 * `day_hours` is authoritative when it has an entry for that weekday;
 * `working_days` (stored with inconsistent capitalisation across tenants) is
 * used otherwise.
 */
export function isOperatingDay(
  dayHours: DayHoursMap,
  workingDays: string[] | null | undefined,
  date: Date,
): boolean {
  const entry = dayEntry(dayHours, date);
  if (entry) {
    if (entryClosed(entry)) return false;
    return true;
  }

  if (!workingDays || workingDays.length === 0) return true;
  const key = weekdayKey(date);
  return workingDays.some((day) => day.trim().toLowerCase() === key);
}
