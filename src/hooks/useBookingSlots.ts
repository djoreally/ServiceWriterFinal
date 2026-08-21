/**
 * useBookingSlots — Encapsulates date/time slot generation, conflict
 * detection, and real-time subscription for the public booking flow.
 *
 * Extracted from PublicBooking.tsx to isolate scheduling concerns.
 */

import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRouteSafeSlots } from "@/application/queries/booking-context.query";
import { format, isBefore, addDays, addMinutes, addHours, setHours, setMinutes, startOfDay, parse } from "date-fns";
import { toast } from "sonner";
import type { BookingAction, BookingState } from "@/hooks/useBookingState";
import { isOperatingDay, resolveDayWindow, type DayHoursMap } from "@/lib/business-hours";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotsDeps {
  businessUserId: string | undefined;
  bookingContextId: string | null;
  openingTime: string | null;
  closingTime: string | null;
  slotDurationMinutes: number;
  bufferTimeBefore: number;
  bufferTimeAfter: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  workingDays: string[] | null;
  /** Per-weekday hours from business settings (authoritative when present). */
  dayHours?: DayHoursMap;
  /** Current selected date from booking state */
  selectedDate: Date | undefined;
  /** Current selected time from booking state */
  selectedTime: string;
  /** Booked slots from state */
  bookedSlots: BookingState["bookedSlots"];
  /** Route-safe slots from state */
  routeSafeSlots: BookingState["routeSafeSlots"];
  /** Weather guard check (if enabled) */
  isWeatherBlocked?: (slotTime: string) => { blocked: boolean; reasons: string[] };
  /** Total service duration in minutes (from pricing hook) */
  getTotalDuration: () => number;
  /** Dispatch to update booking state */
  dispatch: React.Dispatch<BookingAction>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookingSlots(deps: SlotsDeps) {
  const {
    businessUserId,
    bookingContextId,
    openingTime,
    closingTime,
    slotDurationMinutes,
    bufferTimeBefore,
    bufferTimeAfter,
    minLeadTimeHours,
    maxAdvanceDays,
    workingDays,
    dayHours,
    selectedDate,
    selectedTime,
    bookedSlots,
    routeSafeSlots,
    isWeatherBlocked,
    getTotalDuration,
    dispatch,
  } = deps;

  // ── Fetch slots for a given date ────────────────────────────────────────
  const fetchBookedSlots = useCallback(async (date: Date) => {
    if (!businessUserId) return;

    dispatch({ type: "SET_LOADING_SLOTS", loading: true });
    const dateStr = format(date, "yyyy-MM-dd");

    // Try route-safe slots first
    if (bookingContextId) {
      try {
        const { data, error } = await fetchRouteSafeSlots(bookingContextId, businessUserId, dateStr);
        if (!error && data?.slots) {
          dispatch({ type: "SET_ROUTE_SAFE_SLOTS", slots: data.slots });
          // Also fetch legacy for weather guard / conflict display
          const { data: legacyData } = await supabase.rpc("get_booked_slots", {
            business_user_id: businessUserId,
            booking_date: dateStr,
          });
          dispatch({ type: "SET_BOOKED_SLOTS", slots: (legacyData || []) as BookingState["bookedSlots"] });
          dispatch({ type: "SET_LOADING_SLOTS", loading: false });
          return;
        }
      } catch (err) {
        console.warn("Route-safe slots failed, falling back to legacy:", err);
      }
    }

    // Legacy fallback
    dispatch({ type: "SET_ROUTE_SAFE_SLOTS", slots: [] });
    const { data, error } = await supabase.rpc("get_booked_slots", {
      business_user_id: businessUserId,
      booking_date: dateStr,
    });

    dispatch({ type: "SET_BOOKED_SLOTS", slots: error ? [] : (data as BookingState["bookedSlots"]) || [] });
    dispatch({ type: "SET_LOADING_SLOTS", loading: false });
  }, [businessUserId, bookingContextId, dispatch]);

  // Re-fetch when date changes
  useEffect(() => {
    if (selectedDate && businessUserId) {
      fetchBookedSlots(selectedDate);
      dispatch({ type: "SET_SELECTED_TIME", time: "" });
    }
  }, [selectedDate, businessUserId, fetchBookedSlots, dispatch]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!businessUserId || !selectedDate) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const channel = supabase
      .channel("appointments-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `user_id=eq.${businessUserId}`,
        },
        (payload) => {
          const newRecord = payload.new as { scheduled_date?: string; scheduled_time?: string } | null;
          const oldRecord = payload.old as { scheduled_date?: string } | null;

          const affectsSelectedDate =
            newRecord?.scheduled_date === dateStr || oldRecord?.scheduled_date === dateStr;

          if (affectsSelectedDate) {
            fetchBookedSlots(selectedDate);

            if (payload.eventType === "INSERT" && selectedTime && newRecord?.scheduled_time) {
              const bookedTime = newRecord.scheduled_time.substring(0, 5);
              if (bookedTime === selectedTime) {
                toast.info("Your selected time slot was just booked. Please choose another time.");
                dispatch({ type: "SET_SELECTED_TIME", time: "" });
              }
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessUserId, selectedDate, selectedTime, fetchBookedSlots, dispatch]);

  // ── Pure slot helpers ───────────────────────────────────────────────────

  const generateTimeSlots = useCallback((): string[] => {
    // Per-day hours are authoritative; the flat opening/closing pair is only a
    // fallback for weekdays the shop never configured.
    const day = selectedDate ?? new Date();
    const window = resolveDayWindow(dayHours, day, openingTime, closingTime);
    if (!window) return [];

    const slots: string[] = [];
    const [openHour, openMin] = window.open.split(":").map(Number);
    const [closeHour, closeMin] = window.close.split(":").map(Number);
    const baseSlot = slotDurationMinutes || 30;
    // The UI renders each start time as an arrival WINDOW whose length is
    // max(slotDuration, serviceDuration). Stepping by a smaller increment than
    // the window produces overlapping windows that render with identical
    // labels ("5 PM - 8 PM" twice). Step by the window length instead.
    const serviceDuration = Math.max(getTotalDuration() || 0, 0);
    const windowMinutes = Math.max(baseSlot, serviceDuration, 15);
    const step = windowMinutes;

    let current = setMinutes(setHours(new Date(), openHour), openMin);
    const closing = setMinutes(setHours(new Date(), closeHour), closeMin);

    // Keep every window fully inside business hours.
    while (!isBefore(closing, addMinutes(current, windowMinutes))) {
      slots.push(format(current, "HH:mm"));
      current = addMinutes(current, step);
    }

    // Fallback: if the window is longer than the whole operating day, still
    // offer the opening time so the day isn't silently unbookable.
    if (slots.length === 0 && isBefore(setMinutes(setHours(new Date(), openHour), openMin), closing)) {
      slots.push(format(setMinutes(setHours(new Date(), openHour), openMin), "HH:mm"));
    }

    return slots;
  }, [openingTime, closingTime, dayHours, selectedDate, slotDurationMinutes, getTotalDuration]);


  const isSlotBlocked = useCallback(
    (slotTime: string): boolean => {
      if (bookedSlots.length === 0) return false;

      const serviceDuration = getTotalDuration();
      const slotStart = parse(slotTime, "HH:mm", new Date());
      const slotEnd = addMinutes(slotStart, serviceDuration);

      for (const booked of bookedSlots) {
        const bookedStart = parse(booked.scheduled_time.substring(0, 5), "HH:mm", new Date());
        const blockedStart = addMinutes(bookedStart, -bufferTimeBefore);
        const blockedEnd = addMinutes(addMinutes(bookedStart, booked.duration_minutes), bufferTimeAfter);

        if (slotStart < blockedEnd && slotEnd > blockedStart) {
          return true;
        }
      }
      return false;
    },
    [bookedSlots, getTotalDuration, bufferTimeBefore, bufferTimeAfter],
  );

  const isSlotTooSoon = useCallback(
    (slotTime: string): boolean => {
      if (!selectedDate || minLeadTimeHours <= 0) return false;

      const [hour, min] = slotTime.split(":").map(Number);
      const slotDateTime = setMinutes(setHours(selectedDate, hour), min);
      const minBookingTime = addHours(new Date(), minLeadTimeHours);

      return isBefore(slotDateTime, minBookingTime);
    },
    [selectedDate, minLeadTimeHours],
  );

  const isWorkingDay = useCallback(
    (date: Date): boolean => isOperatingDay(dayHours, workingDays, date),
    [dayHours, workingDays],
  );

  const isDateWithinWindow = useCallback(
    (date: Date): boolean => {
      const maxDate = addDays(startOfDay(new Date()), maxAdvanceDays);
      return isBefore(date, maxDate);
    },
    [maxAdvanceDays],
  );

  /** Compute the time slots to display (route-safe or generated). */
  const timeSlots = routeSafeSlots.length > 0
    ? Array.from(new Set(routeSafeSlots.map((s) => s.time.substring(0, 5)))).sort()
    : generateTimeSlots();


  /** When route-safe slots are active, slot blocking is handled server-side. */
  const effectiveIsSlotBlocked = useCallback(
    (time: string) => {
      const weatherBlocked = isWeatherBlocked?.(time).blocked ?? false;
      if (weatherBlocked) return true;
      return routeSafeSlots.length > 0 ? false : isSlotBlocked(time);
    },
    [routeSafeSlots, isSlotBlocked, isWeatherBlocked],
  );

  return {
    fetchBookedSlots,
    generateTimeSlots,
    isSlotBlocked: effectiveIsSlotBlocked,
    isSlotTooSoon,
    isWorkingDay,
    isDateWithinWindow,
    timeSlots,
  } as const;
}
