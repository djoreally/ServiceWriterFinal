/**
 * Availability Query - Read operations for booking availability
 */

import { supabase } from "@/integrations/supabase/client";

export interface AvailabilitySlot {
  time: string;
  available: boolean;
}

export interface BookedSlot {
  id?: string;
  scheduled_time: string;
  duration_minutes: number;
}

/**
 * Fetch booked slots for a specific date
 * @param tenantUserId - The user_id of the business owner
 * @param date - The date to check (YYYY-MM-DD format)
 */
export async function fetchBookedSlots(
  tenantUserId: string, 
  date: string
): Promise<BookedSlot[]> {
  const { data, error } = await supabase.rpc("get_booked_slots", {
    business_user_id: tenantUserId,
    booking_date: date,
  });

  if (error) {
    console.error("[fetchBookedSlots] Error:", error);
    throw new Error("Failed to fetch booked slots");
  }

  return (data || []).map((slot: BookedSlot) => ({
    id: slot.id,
    scheduled_time: slot.scheduled_time,
    duration_minutes: slot.duration_minutes,
  }));
}

/**
 * Fetch available time slots for a date
 * @param tenantUserId - The user_id of the business owner
 * @param date - The date to check
 * @param openingTime - Business opening time (HH:mm)
 * @param closingTime - Business closing time (HH:mm)
 * @param slotDuration - Duration of each slot in minutes
 * @param serviceDuration - Duration of the service in minutes
 * @param bufferBefore - Buffer time before appointments in minutes
 * @param bufferAfter - Buffer time after appointments in minutes
 */
export async function fetchAvailability(
  tenantUserId: string,
  date: string,
  openingTime: string,
  closingTime: string,
  slotDuration: number,
  serviceDuration: number,
  bufferBefore: number = 0,
  bufferAfter: number = 0
): Promise<AvailabilitySlot[]> {
  // Get booked slots for the date
  const bookedSlots = await fetchBookedSlots(tenantUserId, date);

  // Generate all possible time slots
  const slots: AvailabilitySlot[] = [];
  const [openHour, openMinute] = openingTime.split(":").map(Number);
  const [closeHour, closeMinute] = closingTime.split(":").map(Number);
  
  const openingMinutes = openHour * 60 + openMinute;
  const closingMinutes = closeHour * 60 + closeMinute;
  
  // Calculate blocked time ranges from booked slots
  const blockedRanges: { start: number; end: number }[] = bookedSlots.map(slot => {
    const [h, m] = slot.scheduled_time.split(":").map(Number);
    const startMinutes = h * 60 + m;
    return {
      start: startMinutes - bufferBefore,
      end: startMinutes + slot.duration_minutes + bufferAfter,
    };
  });

  // Generate slots
  for (let minutes = openingMinutes; minutes + serviceDuration <= closingMinutes; minutes += slotDuration) {
    const slotEnd = minutes + serviceDuration;
    
    // Check if this slot conflicts with any booked appointment
    const isBlocked = blockedRanges.some(range => 
      (minutes < range.end && slotEnd > range.start)
    );

    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const timeString = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    slots.push({
      time: timeString,
      available: !isBlocked,
    });
  }

  return slots;
}
