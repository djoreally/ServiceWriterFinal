import {
  generateRouteSafeSlots,
  haversineDistanceMiles,
  haversineTravelMinutes,
  type SlotGenerationInput,
} from "@/lib/geo-slot-generation";

function baseInput(overrides: Partial<SlotGenerationInput> = {}): SlotGenerationInput {
  return {
    bookingContext: {
      location: {
        address: {
          street: "123 Main St",
          city: "Philadelphia",
          state: "PA",
          postalCode: "19103",
          country: "US",
        },
        geocode: { lat: 39.9526, lng: -75.1652, placeId: null, confidence: 1 },
        zone: null,
        distanceFromBaseMiles: 2,
        estimatedTravelMinutesFromBase: 10,
        isInServiceArea: true,
      },
      vehicle: { vehicleType: "sedan", durationModifierMinutes: 0 },
      services: {
        mobileEligible: true,
        estimatedServiceMinutes: 60,
        skillTags: [],
      },
    },
    // Window in minutes from midnight: 9:00–17:00
    windowStart: 9 * 60,
    windowEnd: 17 * 60,
    slotIntervalMinutes: 60,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    shifts: [
      {
        technicianId: "tech-1",
        startsAt: 9 * 60,
        endsAt: 17 * 60,
        startLat: 39.95,
        startLng: -75.16,
        skillTags: [],
      },
    ],
    appointments: [],
    estimateTravel: () => 10,
    ...overrides,
  };
}

describe("geo-slot-generation", () => {
  describe("haversineDistanceMiles", () => {
    it("returns 0 for identical points", () => {
      expect(haversineDistanceMiles(39.95, -75.16, 39.95, -75.16)).toBeCloseTo(0, 8);
    });

    it("computes a sane intercity distance", () => {
      const miles = haversineDistanceMiles(39.9526, -75.1652, 40.7128, -74.006);
      expect(miles).toBeGreaterThan(70);
      expect(miles).toBeLessThan(110);
    });
  });

  describe("haversineTravelMinutes", () => {
    it("rounds up to whole minutes", () => {
      const minutes = haversineTravelMinutes(39.9526, -75.1652, 40.7128, -74.006);
      expect(Number.isInteger(minutes)).toBe(true);
      expect(minutes).toBeGreaterThan(60);
    });

    it("returns 0 for identical points", () => {
      expect(haversineTravelMinutes(39.95, -75.16, 39.95, -75.16)).toBe(0);
    });
  });

  describe("generateRouteSafeSlots", () => {
    it("fails fast outside the service area", () => {
      const input = baseInput();
      input.bookingContext.location.isInServiceArea = false;
      expect(generateRouteSafeSlots(input)).toEqual([]);
    });

    it("fails fast for non-mobile-eligible services", () => {
      const input = baseInput();
      input.bookingContext.services.mobileEligible = false;
      expect(generateRouteSafeSlots(input)).toEqual([]);
    });

    it("emits one slot per feasible candidate time for an open tech", () => {
      const slots = generateRouteSafeSlots(baseInput());
      // 9:00–17:00 window, 60-min service, 60-min interval, 15-min buffers and
      // 10-min travel: first feasible start is 10:00, last is 15:00
      expect(slots.map((s) => s.time)).toEqual([
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
      ]);
      expect(slots[0].technicianId).toBe("tech-1");
      expect(slots[0].travelFromPrevMinutes).toBe(10);
    });

    it("skips technicians missing a required skill tag", () => {
      const input = baseInput();
      input.bookingContext.services.skillTags = ["ev-certified"];
      expect(generateRouteSafeSlots(input)).toEqual([]);
    });

    it("excludes times that collide with existing appointments", () => {
      const input = baseInput({
        appointments: [
          {
            id: "appt-1",
            technicianId: "tech-1",
            startsAt: 9 * 60,
            endsAt: 10 * 60,
            lat: 39.95,
            lng: -75.16,
          },
        ],
      });
      const slots = generateRouteSafeSlots(input);
      const times = slots.map((s) => s.time);
      expect(times).not.toContain("09:00");
      expect(times).not.toContain("10:00");
      expect(times).toEqual(["11:00", "12:00", "13:00", "14:00", "15:00"]);
    });
  });
});
