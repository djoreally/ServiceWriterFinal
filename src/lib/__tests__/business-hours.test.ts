import { isOperatingDay, resolveDayWindow } from "@/lib/business-hours";

// 2026-09-22 is a Tuesday; construct dates relative to a known weekday.
function dateForWeekday(weekdayIndex: number): Date {
  // 2026-09-20 is a Sunday (index 0)
  const sunday = new Date(2026, 8, 20, 12, 0, 0);
  const d = new Date(sunday);
  d.setDate(sunday.getDate() + weekdayIndex);
  return d;
}

const MONDAY = dateForWeekday(1);
const TUESDAY = dateForWeekday(2);
const SUNDAY = dateForWeekday(0);

describe("business-hours", () => {
  describe("resolveDayWindow", () => {
    it("returns the per-day window when configured", () => {
      const dayHours = { tuesday: { open: "08:00", close: "17:00", is_open: true } };
      expect(resolveDayWindow(dayHours, TUESDAY, "09:00", "18:00")).toEqual({
        open: "08:00",
        close: "17:00",
      });
    });

    it("returns null when the day entry is explicitly closed (both key styles)", () => {
      expect(
        resolveDayWindow({ tuesday: { is_open: false } }, TUESDAY, "09:00", "18:00"),
      ).toBeNull();
      expect(
        resolveDayWindow({ monday: { isOpen: false } }, MONDAY, "09:00", "18:00"),
      ).toBeNull();
    });

    it("falls back to flat open/close when the day has no entry", () => {
      expect(resolveDayWindow({}, TUESDAY, "09:00", "18:00")).toEqual({
        open: "09:00",
        close: "18:00",
      });
    });

    it("fills missing per-day open/close from the fallback", () => {
      const dayHours = { tuesday: { is_open: true } };
      expect(resolveDayWindow(dayHours, TUESDAY, "09:00", "18:00")).toEqual({
        open: "09:00",
        close: "18:00",
      });
    });

    it("truncates seconds from configured times", () => {
      const dayHours = { tuesday: { open: "08:00:00", close: "17:30:00" } };
      expect(resolveDayWindow(dayHours, TUESDAY, null, null)).toEqual({
        open: "08:00",
        close: "17:30",
      });
    });

    it("returns null when nothing is configured", () => {
      expect(resolveDayWindow(null, TUESDAY, null, null)).toBeNull();
      expect(resolveDayWindow({}, TUESDAY, null, "18:00")).toBeNull();
    });
  });

  describe("isOperatingDay", () => {
    it("returns true when the day entry is open", () => {
      expect(
        isOperatingDay({ tuesday: { is_open: true } }, null, TUESDAY),
      ).toBe(true);
    });

    it("returns false when the day entry is closed", () => {
      expect(
        isOperatingDay({ sunday: { is_open: false } }, ["sunday"], SUNDAY),
      ).toBe(false);
    });

    it("day_hours entry wins over working_days", () => {
      // Entry exists and is open even though working_days omits tuesday
      expect(
        isOperatingDay({ tuesday: { is_open: true } }, ["monday"], TUESDAY),
      ).toBe(true);
    });

    it("matches working_days case-insensitively when no day entry exists", () => {
      expect(isOperatingDay({}, ["Tuesday", "WEDNESDAY"], TUESDAY)).toBe(true);
      expect(isOperatingDay({}, ["monday"], TUESDAY)).toBe(false);
    });

    it("treats missing working_days as every day operating", () => {
      expect(isOperatingDay({}, null, TUESDAY)).toBe(true);
      expect(isOperatingDay({}, [], SUNDAY)).toBe(true);
    });
  });
});
