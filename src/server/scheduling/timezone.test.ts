import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";

const NY = "America/New_York";

describe("zonedLocalDateTimeToUtc", () => {
  it("converts a winter date using EST (UTC-5)", () => {
    expect(zonedLocalDateTimeToUtc("2026-01-15", "10:00", NY).toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("converts a summer date using EDT (UTC-4)", () => {
    expect(zonedLocalDateTimeToUtc("2026-07-15", "10:00", NY).toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("honors explicit seconds", () => {
    expect(zonedLocalDateTimeToUtc("2026-01-15", "09:30:45", NY).toISOString()).toBe("2026-01-15T14:30:45.000Z");
  });

  it("handles midnight and end-of-day boundaries", () => {
    expect(zonedLocalDateTimeToUtc("2026-07-01", "00:00", NY).toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedLocalDateTimeToUtc("2026-01-15", "23:59:59", NY).toISOString()).toBe("2026-01-16T04:59:59.000Z");
  });

  it("works for non-US timezones", () => {
    // Europe/Berlin is UTC+1 in January.
    expect(zonedLocalDateTimeToUtc("2026-01-15", "10:00", "Europe/Berlin").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    // UTC has no offset.
    expect(zonedLocalDateTimeToUtc("2026-01-15", "10:00", "UTC").toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("rejects malformed date and time strings", () => {
    expect(() => zonedLocalDateTimeToUtc("2026-1-5", "10:00", NY)).toThrow("Invalid appointment date/time.");
    expect(() => zonedLocalDateTimeToUtc("01/15/2026", "10:00", NY)).toThrow("Invalid appointment date/time.");
    expect(() => zonedLocalDateTimeToUtc("2026-01-15", "noon", NY)).toThrow("Invalid appointment date/time.");
    expect(() => zonedLocalDateTimeToUtc("2026-01-15", "10", NY)).toThrow("Invalid appointment date/time.");
  });

  it("rejects an out-of-range local time", () => {
    expect(() => zonedLocalDateTimeToUtc("2026-01-15", "25:00", NY)).toThrow(
      "The requested local appointment time is invalid in the workspace timezone.",
    );
  });

  it("rejects a time that does not exist on a spring-forward DST day", () => {
    // 2026-03-08 02:30 never occurs in America/New_York (clocks jump 02:00 -> 03:00).
    expect(() => zonedLocalDateTimeToUtc("2026-03-08", "02:30", NY)).toThrow(
      "The requested local appointment time is invalid in the workspace timezone.",
    );
  });

  it("resolves an ambiguous fall-back time to the first occurrence", () => {
    // 2026-11-01 01:30 occurs twice (EDT then EST); the algorithm keeps the earlier one.
    const result = zonedLocalDateTimeToUtc("2026-11-01", "01:30", NY);
    expect(result.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(zonedDateTimeParts(result, NY)).toEqual({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 });
  });

  it("rejects an invalid timezone", () => {
    expect(() => zonedLocalDateTimeToUtc("2026-01-15", "10:00", "Not/AZone")).toThrow(RangeError);
  });

  it("round-trips through zonedDateTimeParts for representative dates", () => {
    const cases: Array<[string, string]> = [
      ["2026-01-15", "10:00"],
      ["2026-07-15", "14:45"],
      ["2026-03-08", "03:30"],
      ["2026-11-01", "12:00"],
    ];
    for (const [date, time] of cases) {
      const utc = zonedLocalDateTimeToUtc(date, time, NY);
      expect(zonedDateTimeParts(utc, NY)).toEqual({
        year: 2026,
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
        hour: Number(time.slice(0, 2)),
        minute: Number(time.slice(3, 5)),
        second: 0,
      });
    }
  });
});

describe("zonedDateTimeParts", () => {
  it("returns local parts for a known instant in a known zone", () => {
    expect(zonedDateTimeParts(new Date("2026-01-15T15:00:00.000Z"), NY)).toEqual({
      year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0,
    });
  });

  it("reflects DST in the summer", () => {
    expect(zonedDateTimeParts(new Date("2026-07-15T14:00:00.000Z"), NY)).toEqual({
      year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0,
    });
  });

  it("returns correct parts on the spring-forward transition day", () => {
    // 2026-03-08T07:30Z is 03:30 EDT, after the 02:00 -> 03:00 jump.
    expect(zonedDateTimeParts(new Date("2026-03-08T07:30:00.000Z"), NY)).toEqual({
      year: 2026, month: 3, day: 8, hour: 3, minute: 30, second: 0,
    });
  });

  it("handles a UTC instant that falls on a different local day", () => {
    // 2026-01-15T01:00Z is still Jan 14 in New York.
    expect(zonedDateTimeParts(new Date("2026-01-15T01:00:00.000Z"), NY)).toEqual({
      year: 2026, month: 1, day: 14, hour: 20, minute: 0, second: 0,
    });
  });
});
