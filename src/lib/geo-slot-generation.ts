/**
 * Geo-Spatial Slot Generation Algorithm
 *
 * Generates route-safe, physically feasible time slots for the public booking flow.
 * Slots account for travel time, service duration, buffers, and technician schedules.
 *
 * ⚡ Performance: O(candidates × techs × appointments) with early-exit per candidate.
 */

// ── Data Model ──────────────────────────────────────────────────────────

export interface NormalizedAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeId: string | null;
  confidence: number; // 0–1
}

export interface ServiceZone {
  id: string;
  name: string;
  zoneType: "radius" | "polygon" | "zip_list";
  distanceMiles: number;
}

export interface LocationSchedulingContext {
  address: NormalizedAddress;
  geocode: GeocodeResult;
  zone: ServiceZone | null;
  distanceFromBaseMiles: number;
  estimatedTravelMinutesFromBase: number;
  isInServiceArea: boolean;
}

export interface VehicleSchedulingContext {
  vehicleType: string;
  /** Extra minutes added/subtracted based on vehicle type (e.g. diesel +15) */
  durationModifierMinutes: number;
}

export interface ServiceSelectionContext {
  estimatedServiceMinutes: number;
  skillTags: string[];
  mobileEligible: boolean;
}

export interface BookingContext {
  location: LocationSchedulingContext;
  vehicle: VehicleSchedulingContext;
  services: ServiceSelectionContext;
}

// ── Dispatch / Timeline Model ───────────────────────────────────────────

export interface TechnicianShift {
  technicianId: string;
  /** Shift start in minutes from midnight */
  startsAt: number;
  /** Shift end in minutes from midnight */
  endsAt: number;
  startLat: number;
  startLng: number;
  skillTags: string[];
}

export interface ScheduledAppointment {
  id: string;
  technicianId: string;
  /** Start in minutes from midnight */
  startsAt: number;
  /** End in minutes from midnight */
  endsAt: number;
  lat: number;
  lng: number;
}

export interface TravelEstimate {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  minutes: number;
}

// ── Output ──────────────────────────────────────────────────────────────

export interface FeasibleSlot {
  /** HH:mm format */
  time: string;
  technicianId: string;
  /** Lower = less route friction */
  routeScore: number;
  travelFromPrevMinutes: number;
  travelToNextMinutes: number;
}

// ── Configuration ───────────────────────────────────────────────────────

export interface SlotGenerationInput {
  bookingContext: BookingContext;
  /** Schedule window start in minutes from midnight */
  windowStart: number;
  /** Schedule window end in minutes from midnight */
  windowEnd: number;
  /** Interval between candidate slot starts (e.g. 30) */
  slotIntervalMinutes: number;
  /** Buffer before service */
  bufferBeforeMinutes: number;
  /** Buffer after service */
  bufferAfterMinutes: number;
  /** Available technician shifts for the date */
  shifts: TechnicianShift[];
  /** Existing appointments for the date (all technicians) */
  appointments: ScheduledAppointment[];
  /**
   * Travel time estimator. Called with origin/destination coords.
   * Can be backed by Mapbox Matrix API or Haversine fallback.
   */
  estimateTravel: (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ) => number; // minutes
}

// ── Haversine Fallback ──────────────────────────────────────────────────

const EARTH_RADIUS_MILES = 3959;
const AVG_SPEED_MPH = 30; // conservative urban average

/** Haversine distance in miles */
export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estimate travel minutes using haversine + average speed */
export function haversineTravelMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const miles = haversineDistanceMiles(fromLat, fromLng, toLat, toLng);
  return Math.ceil((miles / AVG_SPEED_MPH) * 60);
}

// ── Core Algorithm ──────────────────────────────────────────────────────

/**
 * Generate route-safe feasible slots.
 *
 * For each candidate time × each technician, checks if the slot can be
 * inserted between existing appointments without violating travel/buffer
 * constraints. Emits one slot per candidate time (best tech by route score).
 */
export function generateRouteSafeSlots(
  input: SlotGenerationInput
): FeasibleSlot[] {
  const { bookingContext, windowStart, windowEnd, slotIntervalMinutes, bufferBeforeMinutes, bufferAfterMinutes, shifts, appointments, estimateTravel } = input;
  const { location, vehicle, services } = bookingContext;

  // ⚡ Fail fast
  if (!location.isInServiceArea || !services.mobileEligible) {
    return [];
  }

  const effectiveServiceMinutes =
    services.estimatedServiceMinutes + vehicle.durationModifierMinutes;
  const candidateLat = location.geocode.lat;
  const candidateLng = location.geocode.lng;

  // Build candidate start times
  const candidates: number[] = [];
  for (let t = windowStart; t + effectiveServiceMinutes <= windowEnd; t += slotIntervalMinutes) {
    candidates.push(t);
  }

  // Group appointments by technician for O(1) lookup
  const techAppointments = new Map<string, ScheduledAppointment[]>();
  for (const appt of appointments) {
    if (!appt.technicianId) continue;
    const list = techAppointments.get(appt.technicianId) || [];
    list.push(appt);
    techAppointments.set(appt.technicianId, list);
  }
  // Sort each tech's appointments chronologically
  for (const [, list] of techAppointments) {
    list.sort((a, b) => a.startsAt - b.startsAt);
  }

  const feasibleSlots: FeasibleSlot[] = [];

  for (const candidateStart of candidates) {
    const candidateEnd = candidateStart + effectiveServiceMinutes;
    let bestSlot: FeasibleSlot | null = null;

    for (const shift of shifts) {
      // Skill check
      if (
        services.skillTags.length > 0 &&
        !services.skillTags.every((tag) => shift.skillTags.includes(tag))
      ) {
        continue;
      }

      // Shift boundary check
      if (candidateStart < shift.startsAt || candidateEnd > shift.endsAt) {
        continue;
      }

      const techAppts = techAppointments.get(shift.technicianId) || [];

      // Try each insertion point (before first, between each pair, after last)
      for (let i = 0; i <= techAppts.length; i++) {
        // Previous node
        let prevEndMinutes: number;
        let prevLat: number;
        let prevLng: number;

        if (i === 0) {
          prevEndMinutes = shift.startsAt;
          prevLat = shift.startLat;
          prevLng = shift.startLng;
        } else {
          const prev = techAppts[i - 1];
          prevEndMinutes = prev.endsAt;
          prevLat = prev.lat;
          prevLng = prev.lng;
        }

        // Next node
        let nextStartMinutes: number;
        let nextLat: number;
        let nextLng: number;

        if (i === techAppts.length) {
          nextStartMinutes = shift.endsAt;
          nextLat = shift.startLat; // return to base
          nextLng = shift.startLng;
        } else {
          const next = techAppts[i];
          nextStartMinutes = next.startsAt;
          nextLat = next.lat;
          nextLng = next.lng;
        }

        // Travel estimates
        const driveFromPrev = estimateTravel(prevLat, prevLng, candidateLat, candidateLng);
        const driveToNext = estimateTravel(candidateLat, candidateLng, nextLat, nextLng);

        // Constraint validation
        const earliestStart = prevEndMinutes + driveFromPrev + bufferBeforeMinutes;
        const latestEnd = nextStartMinutes - driveToNext - bufferAfterMinutes;

        if (candidateStart >= earliestStart && candidateEnd <= latestEnd) {
          const routeScore = driveFromPrev + driveToNext + 2 * bufferBeforeMinutes;

          if (!bestSlot || routeScore < bestSlot.routeScore) {
            bestSlot = {
              time: minutesToHHMM(candidateStart),
              technicianId: shift.technicianId,
              routeScore,
              travelFromPrevMinutes: driveFromPrev,
              travelToNextMinutes: driveToNext,
            };
          }
          break; // Found valid insertion for this tech, move to next tech
        }
      }
    }

    if (bestSlot) {
      feasibleSlots.push(bestSlot);
    }
  }

  // Sort by time, then route score
  feasibleSlots.sort((a, b) => {
    const timeA = hhmmToMinutes(a.time);
    const timeB = hhmmToMinutes(b.time);
    if (timeA !== timeB) return timeA - timeB;
    return a.routeScore - b.routeScore;
  });

  return feasibleSlots;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
