/**
 * useBookingSlots — Encapsulates date/time slot generation and server-safe availability.
 */
import { useCallback, useEffect } from "react";
import { fetchRouteSafeSlots } from "@/application/queries/booking-context.query";
import { fetchCanonicalAvailability } from "@/application/queries/public-booking.query";
import { format, isBefore, addDays, addMinutes, addHours, setHours, setMinutes, startOfDay, parse } from "date-fns";
import type { BookingAction, BookingState } from "@/hooks/useBookingState";
import { isOperatingDay, resolveDayWindow, type DayHoursMap } from "@/lib/business-hours";

export interface SlotsDeps {
  businessUserId: string | undefined;
  bookingSlug?: string;
  bookingContextId: string | null;
  openingTime: string | null;
  closingTime: string | null;
  slotDurationMinutes: number;
  bufferTimeBefore: number;
  bufferTimeAfter: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  workingDays: string[] | null;
  dayHours?: DayHoursMap;
  selectedDate: Date | undefined;
  selectedTime: string;
  bookedSlots: BookingState["bookedSlots"];
  routeSafeSlots: BookingState["routeSafeSlots"];
  isWeatherBlocked?: (slotTime: string) => { blocked: boolean; reasons: string[] };
  getTotalDuration: () => number;
  dispatch: React.Dispatch<BookingAction>;
}

export function useBookingSlots(deps: SlotsDeps) {
  const { businessUserId, bookingSlug, bookingContextId, openingTime, closingTime, slotDurationMinutes, bufferTimeBefore, bufferTimeAfter, minLeadTimeHours, maxAdvanceDays, workingDays, dayHours, selectedDate, bookedSlots, routeSafeSlots, isWeatherBlocked, getTotalDuration, dispatch } = deps;

  const fetchBookedSlots = useCallback(async (date: Date) => {
    if (!businessUserId) return;
    dispatch({ type: "SET_LOADING_SLOTS", loading: true });
    const dateStr = format(date, "yyyy-MM-dd");

    if (bookingContextId) {
      try {
        const { data, error } = await fetchRouteSafeSlots(bookingContextId, businessUserId, dateStr);
        if (!error && data?.slots) {
          dispatch({ type: "SET_ROUTE_SAFE_SLOTS", slots: data.slots });
          dispatch({ type: "SET_BOOKED_SLOTS", slots: [] });
          dispatch({ type: "SET_LOADING_SLOTS", loading: false });
          return;
        }
      } catch (err) {
        console.warn("Route-safe slots failed; using canonical public availability:", err);
      }
    }

    if (bookingSlug) {
      const { data, error } = await fetchCanonicalAvailability(bookingSlug, dateStr);
      if (!error && data?.bookingEnabled) {
        dispatch({ type: "SET_ROUTE_SAFE_SLOTS", slots: data.slots.map((slot) => ({ time: slot.time, technicianId: "canonical", routeScore: 1 })) });
        dispatch({ type: "SET_BOOKED_SLOTS", slots: [] });
        dispatch({ type: "SET_LOADING_SLOTS", loading: false });
        return;
      }
    }

    // Fail closed: without server-approved availability the UI must not invent
    // bookable capacity from local business-hour math.
    dispatch({ type: "SET_ROUTE_SAFE_SLOTS", slots: [] });
    dispatch({ type: "SET_BOOKED_SLOTS", slots: [] });
    dispatch({ type: "SET_LOADING_SLOTS", loading: false });
  }, [businessUserId, bookingSlug, bookingContextId, dispatch]);

  useEffect(() => {
    if (selectedDate && businessUserId) {
      void fetchBookedSlots(selectedDate);
      dispatch({ type: "SET_SELECTED_TIME", time: "" });
    }
  }, [selectedDate, businessUserId, fetchBookedSlots, dispatch]);

  useEffect(() => {
    if (!bookingSlug || !selectedDate) return;
    const interval = window.setInterval(() => { void fetchBookedSlots(selectedDate); }, 30_000);
    return () => window.clearInterval(interval);
  }, [bookingSlug, selectedDate, fetchBookedSlots]);

  const generateTimeSlots = useCallback((): string[] => {
    const day = selectedDate ?? new Date();
    const window = resolveDayWindow(dayHours, day, openingTime, closingTime);
    if (!window) return [];
    const slots: string[] = [];
    const [openHour, openMin] = window.open.split(":").map(Number);
    const [closeHour, closeMin] = window.close.split(":").map(Number);
    const baseSlot = slotDurationMinutes || 30;
    const serviceDuration = Math.max(getTotalDuration() || 0, 0);
    const windowMinutes = Math.max(baseSlot, serviceDuration, 15);
    let current = setMinutes(setHours(new Date(), openHour), openMin);
    const closing = setMinutes(setHours(new Date(), closeHour), closeMin);
    while (!isBefore(closing, addMinutes(current, windowMinutes))) {
      slots.push(format(current, "HH:mm"));
      current = addMinutes(current, windowMinutes);
    }
    if (slots.length === 0 && isBefore(setMinutes(setHours(new Date(), openHour), openMin), closing)) slots.push(format(setMinutes(setHours(new Date(), openHour), openMin), "HH:mm"));
    return slots;
  }, [openingTime, closingTime, dayHours, selectedDate, slotDurationMinutes, getTotalDuration]);

  const isSlotBlocked = useCallback((slotTime: string): boolean => {
    if (bookedSlots.length === 0) return false;
    const serviceDuration = getTotalDuration();
    const slotStart = parse(slotTime, "HH:mm", new Date());
    const slotEnd = addMinutes(slotStart, serviceDuration);
    for (const booked of bookedSlots) {
      const bookedStart = parse(booked.scheduled_time.substring(0, 5), "HH:mm", new Date());
      const blockedStart = addMinutes(bookedStart, -bufferTimeBefore);
      const blockedEnd = addMinutes(addMinutes(bookedStart, booked.duration_minutes), bufferTimeAfter);
      if (slotStart < blockedEnd && slotEnd > blockedStart) return true;
    }
    return false;
  }, [bookedSlots, getTotalDuration, bufferTimeBefore, bufferTimeAfter]);

  const isSlotTooSoon = useCallback((slotTime: string): boolean => {
    if (!selectedDate || minLeadTimeHours <= 0) return false;
    const [hour, min] = slotTime.split(":").map(Number);
    return isBefore(setMinutes(setHours(selectedDate, hour), min), addHours(new Date(), minLeadTimeHours));
  }, [selectedDate, minLeadTimeHours]);

  const isWorkingDay = useCallback((date: Date): boolean => isOperatingDay(dayHours, workingDays, date), [dayHours, workingDays]);
  const isDateWithinWindow = useCallback((date: Date): boolean => isBefore(date, addDays(startOfDay(new Date()), maxAdvanceDays)), [maxAdvanceDays]);

  // Stage 22 rule: when a public booking slug exists, only canonical backend
  // availability may create visible slots. Local generation is retained solely
  // for non-public internal compatibility flows.
  const timeSlots = routeSafeSlots.length > 0
    ? Array.from(new Set(routeSafeSlots.map((s) => s.time.substring(0, 5)))).sort()
    : bookingSlug ? [] : generateTimeSlots();

  const effectiveIsSlotBlocked = useCallback((time: string) => {
    const weatherBlocked = isWeatherBlocked?.(time).blocked ?? false;
    if (weatherBlocked) return true;
    return routeSafeSlots.length > 0 ? false : isSlotBlocked(time);
  }, [routeSafeSlots, isSlotBlocked, isWeatherBlocked]);

  return { fetchBookedSlots, generateTimeSlots, isSlotBlocked: effectiveIsSlotBlocked, isSlotTooSoon, isWorkingDay, isDateWithinWindow, timeSlots } as const;
}
