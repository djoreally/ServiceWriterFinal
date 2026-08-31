import { format, parseISO } from "date-fns";

/**
 * Defensive date/time formatting helpers.
 *
 * Scheduled times in this system are not guaranteed to be strict `HH:mm:ss`
 * values: retail bookings can store a human window label such as
 * "Early Bird Special 8AM-10AM". Passing those straight into date-fns
 * `format()` throws `RangeError: Invalid time value` and crashes the screen.
 * These helpers always return a renderable string instead of throwing.
 */

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Current Unix time, exposed as a lazy-state initializer and event-time seam. */
export function currentTimeMs(): number {
  return Date.now();
}

/** Formats a `HH:mm[:ss]` clock value. Non-clock values are returned as-is. */
export function formatTimeLabel(
  time: string | null | undefined,
  pattern = "h:mm a",
  fallback = "—",
): string {
  if (!time) return fallback;
  const raw = String(time).trim();
  if (!raw) return fallback;

  const match = TIME_PATTERN.exec(raw);
  if (!match) {
    // Already a human-readable window/label — show it verbatim.
    return raw;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (hours > 23 || minutes > 59 || seconds > 59) return raw;

  const date = new Date(2000, 0, 1, hours, minutes, seconds);
  if (Number.isNaN(date.getTime())) return raw;
  return format(date, pattern);
}

/** Formats a date/timestamp string, returning `fallback` when unparseable. */
export function formatDateLabel(
  value: string | Date | null | undefined,
  pattern = "MMM d",
  fallback = "—",
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : parseISO(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern);
}

/** Parses a date-ish value, returning null instead of an Invalid Date. */
export function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Minutes since midnight for a `HH:mm[:ss]` value, else null. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = TIME_PATTERN.exec(String(time).trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Combines a calendar date and optional clock value without ever returning Invalid Date. */
export function combineDateAndTime(
  date: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  const day = safeParseDate(date);
  if (!day) return null;
  const minutes = timeToMinutes(time);
  if (minutes === null) return new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
