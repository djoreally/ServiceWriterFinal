/**
 * useSuggestNextSlots — Recommends nearby available slots when the
 * customer's chosen slot is flagged SUGGEST_RESCHEDULE by Weather Guard.
 *
 * Strategy:
 *  1. Walk forward from the selected date (up to N days).
 *  2. For each working day in window, fetch booked slots + weather forecast.
 *  3. Generate the candidate time grid (same opening/closing/duration).
 *  4. Drop slots that are booked, too soon, or locally weather-blocked
 *     (via the WMO-code rules already in `useWeatherGuard`).
 *  5. Verify the top K survivors against `weather-guard-check-slot` and
 *     return up to `maxResults` whose decision is OK or WARN, ordered by
 *     soonest start time and lowest risk.
 *
 * Cached per (date, time) selection so re-opening the dialog is instant.
 */

import { useCallback, useState } from "react";
import {
  addDays,
  addMinutes,
  format,
  isBefore,
  parse,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchWeatherForecast,
  getBlockedSlots,
  isSlotWeatherBlocked,
  parseWeatherGuardSettings,
} from "@/lib/weather-guard";
import { checkSlotRisk } from "@/application/queries/weather-guard.query";

export interface SuggestedSlot {
  date: Date;
  time: string; // "HH:mm"
  dateLabel: string; // e.g. "Tomorrow, Aug 14"
  timeLabel: string; // e.g. "10:00 AM"
  riskScore: number;
  decision: "OK" | "WARN";
}

interface Options {
  businessUserId: string | undefined;
  lat: number | null;
  lng: number | null;
  weatherGuardEnabled: boolean;
  weatherGuardSettings: unknown;
  workingDays: string[] | null;
  openingTime: string | null;
  closingTime: string | null;
  slotDurationMinutes: number;
  bufferTimeBefore: number;
  bufferTimeAfter: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  serviceDurationMinutes: number;
  /** Days to scan forward from the rejected date (inclusive). */
  scanDays?: number;
  /** Maximum suggestions to return. */
  maxResults?: number;
}

interface BookedSlot {
  scheduled_time: string;
  duration_minutes: number;
}

const isWorkingDay = (date: Date, workingDays: string[] | null) => {
  if (!workingDays) return true;
  return workingDays.includes(format(date, "EEEE"));
};

const isDateWithinWindow = (date: Date, maxAdvanceDays: number) => {
  const maxDate = addDays(startOfDay(new Date()), maxAdvanceDays);
  return isBefore(date, maxDate);
};

const generateTimeSlots = (
  openingTime: string | null,
  closingTime: string | null,
  slotDurationMinutes: number,
): string[] => {
  if (!openingTime || !closingTime) return [];
  const [openH, openM] = openingTime.split(":").map(Number);
  const [closeH, closeM] = closingTime.split(":").map(Number);
  const out: string[] = [];
  let cur = setMinutes(setHours(new Date(), openH), openM);
  const close = setMinutes(setHours(new Date(), closeH), closeM);
  while (isBefore(cur, close)) {
    out.push(format(cur, "HH:mm"));
    cur = addMinutes(cur, slotDurationMinutes || 30);
  }
  return out;
};

const slotConflictsBooked = (
  slotTime: string,
  bookedSlots: BookedSlot[],
  serviceDuration: number,
  bufferBefore: number,
  bufferAfter: number,
): boolean => {
  if (bookedSlots.length === 0) return false;
  const slotStart = parse(slotTime, "HH:mm", new Date());
  const slotEnd = addMinutes(slotStart, serviceDuration);
  for (const b of bookedSlots) {
    const bs = parse(b.scheduled_time.substring(0, 5), "HH:mm", new Date());
    const blockedStart = addMinutes(bs, -bufferBefore);
    const blockedEnd = addMinutes(addMinutes(bs, b.duration_minutes), bufferAfter);
    if (slotStart < blockedEnd && slotEnd > blockedStart) return true;
  }
  return false;
};

const isSlotTooSoon = (date: Date, slotTime: string, minLeadHours: number) => {
  if (minLeadHours <= 0) return false;
  const [h, m] = slotTime.split(":").map(Number);
  const slotDt = setMinutes(setHours(date, h), m);
  const minBooking = new Date(Date.now() + minLeadHours * 3_600_000);
  return isBefore(slotDt, minBooking);
};

const friendlyDate = (date: Date): string => {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return `Today, ${format(date, "MMM d")}`;
  if (diff === 1) return `Tomorrow, ${format(date, "MMM d")}`;
  return format(date, "EEE, MMM d");
};

export function useSuggestNextSlots(opts: Options) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedSlot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const findSuggestions = useCallback(
    async (fromDate: Date) => {
      if (!opts.businessUserId) {
        setError("Business not loaded yet.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const scanDays = opts.scanDays ?? 5;
        const maxResults = opts.maxResults ?? 4;
        const parsedSettings = parseWeatherGuardSettings(opts.weatherGuardSettings);

        // Step 1: build candidate (date, time) list across the scan window.
        const candidates: Array<{ date: Date; time: string }> = [];

        for (let d = 0; d < scanDays; d++) {
          const date = addDays(fromDate, d);
          if (!isWorkingDay(date, opts.workingDays)) continue;
          if (!isDateWithinWindow(date, opts.maxAdvanceDays)) break;

          const dateStr = format(date, "yyyy-MM-dd");

          // Fetch booked slots for the day (parallel to weather below).
          const bookedPromise = supabase.rpc("get_booked_slots", {
            business_user_id: opts.businessUserId,
            booking_date: dateStr,
          });

          // Fetch weather only if Weather Guard is enabled and we have coords.
          const blockedTimes: Set<string> = new Set();
          if (opts.weatherGuardEnabled && opts.lat != null && opts.lng != null) {
            try {
              const endStr = format(addDays(date, 1), "yyyy-MM-dd");
              const forecast = await fetchWeatherForecast(opts.lat, opts.lng, dateStr, endStr);
              const blocked = getBlockedSlots(forecast, parsedSettings, dateStr);
              for (const b of blocked) {
                blockedTimes.add(b.time.substring(0, 2));
              }
            } catch {
              // forecast errors fall through; we'll still try the slot.
            }
          }

          const { data: bookedData } = await bookedPromise;
          const booked = (bookedData ?? []) as BookedSlot[];

          const grid = generateTimeSlots(
            opts.openingTime,
            opts.closingTime,
            opts.slotDurationMinutes,
          );

          for (const time of grid) {
            if (isSlotTooSoon(date, time, opts.minLeadTimeHours)) continue;
            if (
              slotConflictsBooked(
                time,
                booked,
                opts.serviceDurationMinutes,
                opts.bufferTimeBefore,
                opts.bufferTimeAfter,
              )
            )
              continue;
            // Local weather pre-filter (cheap)
            const weatherCheck = isSlotWeatherBlocked(
              time,
              Array.from(blockedTimes).map((h) => ({ time: `${h}:00`, reasons: [] as string[] })),
            );
            if (weatherCheck.blocked) continue;
            candidates.push({ date, time });
            // Cap candidates per-day so we don't explode for shops with long hours.
            if (candidates.length >= scanDays * 6) break;
          }
        }

        if (candidates.length === 0) {
          setSuggestions([]);
          setLoading(false);
          return;
        }

        // Step 2: verify the first batch via the edge function for an
        // engine-consistent decision. We bound the verification to keep
        // the round-trip count predictable.
        const verifyBatch = candidates.slice(0, Math.min(candidates.length, maxResults * 3));

        const verified = await Promise.all(
          verifyBatch.map(async (c) => {
            try {
              if (opts.lat == null || opts.lng == null) {
                return {
                  date: c.date,
                  time: c.time,
                  decision: "OK" as const,
                  riskScore: 0,
                };
              }
              const start = parse(
                `${format(c.date, "yyyy-MM-dd")} ${c.time}`,
                "yyyy-MM-dd HH:mm",
                new Date(),
              ).toISOString();
              const end = new Date(
                new Date(start).getTime() + opts.serviceDurationMinutes * 60_000,
              ).toISOString();
              const r = await checkSlotRisk({
                businessUserId: opts.businessUserId,
                lat: opts.lat,
                lng: opts.lng,
                start,
                end,
                scope: "outdoor",
              });
              return {
                date: c.date,
                time: c.time,
                decision: r.decision,
                riskScore: r.riskScore,
              };
            } catch {
              return null;
            }
          }),
        );

        const out: SuggestedSlot[] = verified
          .filter(
            (
              v,
            ): v is {
              date: Date;
              time: string;
              decision: "OK" | "WARN" | "SUGGEST_RESCHEDULE" | "BLOCK";
              riskScore: number;
            } => v !== null,
          )
          .filter((v) => v.decision === "OK" || v.decision === "WARN")
          .sort((a, b) => {
            // Prefer OK over WARN, then soonest, then lowest risk.
            if (a.decision !== b.decision) return a.decision === "OK" ? -1 : 1;
            const ta = parse(
              `${format(a.date, "yyyy-MM-dd")} ${a.time}`,
              "yyyy-MM-dd HH:mm",
              new Date(),
            ).getTime();
            const tb = parse(
              `${format(b.date, "yyyy-MM-dd")} ${b.time}`,
              "yyyy-MM-dd HH:mm",
              new Date(),
            ).getTime();
            if (ta !== tb) return ta - tb;
            return a.riskScore - b.riskScore;
          })
          .slice(0, maxResults)
          .map((v) => ({
            date: v.date,
            time: v.time,
            dateLabel: friendlyDate(v.date),
            timeLabel: format(parse(v.time, "HH:mm", new Date()), "h:mm a"),
            riskScore: v.riskScore,
            decision: v.decision as "OK" | "WARN",
          }));

        setSuggestions(out);
      } catch (e) {
        setError((e as Error).message ?? "Failed to find suggestions.");
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [opts],
  );

  const reset = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setLoading(false);
  }, []);

  return { loading, suggestions, error, findSuggestions, reset };
}
