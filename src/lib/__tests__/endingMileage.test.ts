import { isValidEndingMileage, parseEndingMileage } from "@/lib/endingMileage";

// Cycle 4 regression: the Complete Appointment dialog rejected an
// ending mileage of 0 as if the field were blank (a `<= 0` check),
// forcing a false reading of 1 onto a real job record. Empty is
// invalid; 0 is a valid odometer reading.
describe("parseEndingMileage", () => {
  it("accepts 0 as a valid reading", () => {
    expect(parseEndingMileage("0")).toBe(0);
    expect(parseEndingMileage(0)).toBe(0);
    expect(isValidEndingMileage("0")).toBe(true);
  });

  it("rejects empty values", () => {
    expect(parseEndingMileage("")).toBeNull();
    expect(parseEndingMileage("   ")).toBeNull();
    expect(parseEndingMileage(null)).toBeNull();
    expect(parseEndingMileage(undefined)).toBeNull();
    expect(isValidEndingMileage("")).toBe(false);
    expect(isValidEndingMileage(null)).toBe(false);
    expect(isValidEndingMileage(undefined)).toBe(false);
  });

  it("accepts normal readings", () => {
    expect(parseEndingMileage("45210")).toBe(45210);
    expect(parseEndingMileage(" 128003 ")).toBe(128003);
    expect(parseEndingMileage(98765)).toBe(98765);
    expect(isValidEndingMileage("1")).toBe(true);
  });

  it("rejects non-numeric and negative values", () => {
    expect(parseEndingMileage("abc")).toBeNull();
    expect(parseEndingMileage("-1")).toBeNull();
    expect(isValidEndingMileage("-4500")).toBe(false);
  });
});
