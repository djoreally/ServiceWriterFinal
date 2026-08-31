/**
 * useWeatherGuard — React hook for Weather Guard integration
 *
 * Fetches the weather forecast for the business location across the
 * entire booking window and determines which time slots — and which
 * entire days — should be blocked based on the shop owner's Weather
 * Guard settings.
 *
 * Server-trusted enforcement is provided by `useBookingSubmit` via the
 * `weather-guard-check-slot` edge function. This hook drives the UX
 * (greying out slots and disabling days).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, addDays, startOfDay } from "date-fns";
import {
  fetchWeatherForecast,
  getBlockedSlots,
  isSlotWeatherBlocked,
  isAnyOperatingHourBlocked,
  parseWeatherGuardSettings,
  type WeatherGuardSettings,
  type WeatherBlockedSlot,
  type HourlyForecast,
} from "@/lib/weather-guard";

interface UseWeatherGuardOptions {
  enabled: boolean;
  settings: unknown; // Raw JSON from DB
  lat: number | null;
  lng: number | null;
  selectedDate: Date | undefined;
  /** Business operating window used for day-level blocking. */
  openingTime?: string | null;
  closingTime?: string | null;
  /** How many days ahead to evaluate for the calendar (default 14). */
  windowDays?: number;
  /** Default service duration in minutes (used when caller does not pass one). */
  defaultSlotDurationMinutes?: number;
}

interface UseWeatherGuardResult {
  loading: boolean;
  parsedSettings: WeatherGuardSettings;
  blockedSlots: WeatherBlockedSlot[];
  forecast: HourlyForecast[];
  /** Blocked slot lookup honoring the full service duration. */
  isWeatherBlocked: (slotTime: string, slotDurationMinutes?: number) => { blocked: boolean; reasons: string[] };
  /** Returns true if the given date has any blocking weather during operating hours. */
  isDayWeatherBlocked: (date: Date) => boolean;
  error: string | null;
}

export function useWeatherGuard({
  enabled,
  settings,
  lat,
  lng,
  selectedDate,
  openingTime = null,
  closingTime = null,
  windowDays = 14,
  defaultSlotDurationMinutes = 60,
}: UseWeatherGuardOptions): UseWeatherGuardResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowForecast, setWindowForecast] = useState<HourlyForecast[]>([]);
  const parsedSettings = useMemo(
    () => parseWeatherGuardSettings(settings),
    [settings],
  );

  // Cache: window key → HourlyForecast[]
  const cacheRef = useRef<Map<string, HourlyForecast[]>>(new Map());

  const fetchWindow = useCallback(
    async () => {
      if (!enabled || lat == null || lng == null) {
        setWindowForecast([]);
        setError(enabled ? "Weather Guard needs verified business coordinates." : null);
        return;
      }
      const today = startOfDay(new Date());
      const startStr = format(today, "yyyy-MM-dd");
      const endStr = format(addDays(today, Math.max(1, windowDays)), "yyyy-MM-dd");
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${startStr}|${endStr}`;
      const cached = cacheRef.current.get(key);
      if (cached) {
        setWindowForecast(cached);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWeatherForecast(lat, lng, startStr, endStr);
        cacheRef.current.set(key, data);
        if (data.length === 0) {
          setError("Weather data unavailable");
        }
        setWindowForecast(data);
      } catch (err) {
        console.error("[WeatherGuard] Failed to fetch forecast:", err);
        setError("Weather data unavailable");
        setWindowForecast([]);
      } finally {
        setLoading(false);
      }
    },
    [enabled, lat, lng, windowDays],
  );

  useEffect(() => {
    void Promise.resolve().then(() => fetchWindow());
  }, [fetchWindow]);

  // Memoize a per-date blocked-slots map derived from the window forecast.
  const blockedByDate = useMemo(() => {
    const map = new Map<string, WeatherBlockedSlot[]>();
    if (!enabled || windowForecast.length === 0) return map;
    const dates = new Set<string>();
    for (const h of windowForecast) {
      dates.add(h.time.substring(0, 10));
    }
    for (const d of dates) {
      map.set(d, getBlockedSlots(windowForecast, parsedSettings, d));
    }
    return map;
  }, [enabled, windowForecast, parsedSettings]);

  const blockedSlots = useMemo(() => {
    if (!selectedDate) return [];
    return blockedByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [];
  }, [blockedByDate, selectedDate]);

  const isWeatherBlocked = useCallback(
    (slotTime: string, slotDurationMinutes?: number) =>
      isSlotWeatherBlocked(slotTime, blockedSlots, slotDurationMinutes ?? defaultSlotDurationMinutes),
    [blockedSlots, defaultSlotDurationMinutes],
  );

  const isDayWeatherBlocked = useCallback(
    (date: Date) => {
      if (!enabled) return false;
      const key = format(date, "yyyy-MM-dd");
      const slots = blockedByDate.get(key);
      if (!slots || slots.length === 0) return false;
      return isAnyOperatingHourBlocked(slots, openingTime, closingTime);
    },
    [enabled, blockedByDate, openingTime, closingTime],
  );

  return {
    loading,
    parsedSettings,
    blockedSlots,
    forecast: windowForecast,
    isWeatherBlocked,
    isDayWeatherBlocked,
    error,
  };
}
