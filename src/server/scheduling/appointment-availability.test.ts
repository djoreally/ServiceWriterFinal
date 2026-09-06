import {
  configuredHours,
  conflictWindow,
  validateLocalAvailability,
} from "./appointment-availability";

describe("appointment availability policy", () => {
  const settings = {
    day_hours: {
      monday: { open: "09:00", close: "17:00", is_open: true },
      sunday: { open: "09:00", close: "17:00", is_open: false },
    },
    opening_time: "10:00",
    closing_time: "17:00",
    working_days: ["Monday", "Sunday"],
    buffer_time_before: 15,
    buffer_time_after: 30,
    min_lead_time_hours: 8,
  };

  it("uses day_hours over stale flat opening and working-day fields", () => {
    expect(configuredHours(settings, "monday")).toEqual({
      isOpen: true,
      open: 9 * 60,
      close: 17 * 60,
    });
    expect(configuredHours(settings, "sunday").isOpen).toBe(false);
  });

  it("rejects appointments outside per-day hours", () => {
    expect(validateLocalAvailability({
      start: { date: "2026-09-07", weekday: "monday", minutes: 8 * 60 + 30 },
      end: { date: "2026-09-07", weekday: "monday", minutes: 9 * 60 + 30 },
      settings,
      startsAtMs: Date.parse("2026-09-07T12:30:00Z"),
      nowMs: Date.parse("2026-09-06T00:00:00Z"),
    })).toBe("outside_business_hours");
  });

  it("rejects explicitly closed days even when legacy working_days includes them", () => {
    expect(validateLocalAvailability({
      start: { date: "2026-09-06", weekday: "sunday", minutes: 10 * 60 },
      end: { date: "2026-09-06", weekday: "sunday", minutes: 11 * 60 },
      settings,
      startsAtMs: Date.parse("2026-09-06T14:00:00Z"),
      nowMs: Date.parse("2026-09-05T00:00:00Z"),
    })).toBe("outside_business_hours");
  });

  it("rejects the configured minimum lead-time window", () => {
    expect(validateLocalAvailability({
      start: { date: "2026-09-07", weekday: "monday", minutes: 10 * 60 },
      end: { date: "2026-09-07", weekday: "monday", minutes: 11 * 60 },
      settings,
      startsAtMs: Date.parse("2026-09-07T14:00:00Z"),
      nowMs: Date.parse("2026-09-07T08:00:01Z"),
    })).toBe("lead_time");
  });

  it("rejects blackout dates", () => {
    expect(validateLocalAvailability({
      start: { date: "2026-09-07", weekday: "monday", minutes: 10 * 60 },
      end: { date: "2026-09-07", weekday: "monday", minutes: 11 * 60 },
      settings,
      startsAtMs: Date.parse("2026-09-07T14:00:00Z"),
      nowMs: Date.parse("2026-09-06T00:00:00Z"),
      blackout: true,
    })).toBe("blackout_date");
  });

  it("expands conflict checks by configured buffers", () => {
    expect(conflictWindow({
      startsAt: "2026-09-07T14:00:00.000Z",
      endsAt: "2026-09-07T15:00:00.000Z",
      bufferTimeBefore: 15,
      bufferTimeAfter: 30,
    })).toEqual({
      queryStart: "2026-09-07T13:30:00.000Z",
      queryEnd: "2026-09-07T15:15:00.000Z",
    });
  });
});
