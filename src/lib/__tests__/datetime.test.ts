import { combineDateAndTime, formatTimeLabel, safeParseDate } from "@/lib/datetime";

describe("datetime safety helpers", () => {
  it("renders human booking windows without throwing", () => {
    expect(formatTimeLabel("Early Bird Special 8AM-10AM")).toBe("Early Bird Special 8AM-10AM");
    expect(formatTimeLabel("25:90")).toBe("25:90");
    expect(formatTimeLabel(null, "h:mm a", "Time unavailable")).toBe("Time unavailable");
  });

  it("returns null for malformed dates", () => {
    expect(safeParseDate("not-a-date")).toBeNull();
  });

  it("combines valid calendar dates and clock values safely", () => {
    expect(combineDateAndTime("2026-08-26", "09:30")?.getHours()).toBe(9);
    expect(combineDateAndTime("2026-08-26", "Appointment window")?.getHours()).toBe(0);
    expect(combineDateAndTime("not-a-date", "09:30")).toBeNull();
  });
});
