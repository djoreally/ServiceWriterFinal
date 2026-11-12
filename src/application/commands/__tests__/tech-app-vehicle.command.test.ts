import { describe, it, expect } from "@jest/globals";
import { planVehicleFieldUpdate } from "../tech-app-vehicle.command";

describe("planVehicleFieldUpdate", () => {
  it("plans a mileage update from a number", () => {
    expect(planVehicleFieldUpdate({ mileage: 48210 })).toEqual({
      patch: { mileage: 48210 },
      error: null,
    });
  });

  it("coerces a numeric-string mileage and strips thousands separators", () => {
    expect(planVehicleFieldUpdate({ mileage: "48,210" })).toEqual({
      patch: { mileage: 48210 },
      error: null,
    });
  });

  it("rejects a negative mileage", () => {
    const plan = planVehicleFieldUpdate({ mileage: -1 });
    expect(plan.patch).toBeNull();
    expect(plan.error).toMatch(/whole number/);
  });

  it("rejects a fractional or non-numeric mileage", () => {
    expect(planVehicleFieldUpdate({ mileage: 12.5 }).patch).toBeNull();
    expect(planVehicleFieldUpdate({ mileage: "abc" }).patch).toBeNull();
    expect(planVehicleFieldUpdate({ mileage: true }).patch).toBeNull();
  });

  it("accepts zero mileage and clears on null/empty", () => {
    expect(planVehicleFieldUpdate({ mileage: 0 })).toEqual({ patch: { mileage: 0 }, error: null });
    expect(planVehicleFieldUpdate({ mileage: null })).toEqual({ patch: { mileage: null }, error: null });
    expect(planVehicleFieldUpdate({ mileage: "  " })).toEqual({ patch: { mileage: null }, error: null });
  });

  it("normalizes a VIN to uppercase and strips spaces", () => {
    expect(planVehicleFieldUpdate({ vin: " 5uxcr6c09n9k12345 " })).toEqual({
      patch: { vin: "5UXCR6C09N9K12345" },
      error: null,
    });
    expect(planVehicleFieldUpdate({ vin: "5UXCR 6C09N 9K12345" })).toEqual({
      patch: { vin: "5UXCR6C09N9K12345" },
      error: null,
    });
  });

  it("rejects a VIN that is not exactly 17 characters", () => {
    expect(planVehicleFieldUpdate({ vin: "5UXCR6C09N9K1234" }).patch).toBeNull(); // 16
    expect(planVehicleFieldUpdate({ vin: "5UXCR6C09N9K123456" }).patch).toBeNull(); // 18
    expect(planVehicleFieldUpdate({ vin: "5UXCR6C09N9K1234!" }).patch).toBeNull(); // punctuation
    expect(planVehicleFieldUpdate({ vin: 123 }).patch).toBeNull(); // not a string
  });

  it("clears the VIN on empty input", () => {
    expect(planVehicleFieldUpdate({ vin: "" })).toEqual({ patch: { vin: null }, error: null });
    expect(planVehicleFieldUpdate({ vin: null })).toEqual({ patch: { vin: null }, error: null });
  });

  it("normalizes a plate to uppercase with single spacing", () => {
    expect(planVehicleFieldUpdate({ plate: " kxm  4821 " })).toEqual({
      patch: { license_plate: "KXM 4821" },
      error: null,
    });
  });

  it("lets a blank plate be entered as cleared — and a real one from blank", () => {
    expect(planVehicleFieldUpdate({ plate: "" })).toEqual({
      patch: { license_plate: null },
      error: null,
    });
    expect(planVehicleFieldUpdate({ plate: "new-123" })).toEqual({
      patch: { license_plate: "NEW-123" },
      error: null,
    });
  });

  it("rejects an over-long plate", () => {
    expect(planVehicleFieldUpdate({ plate: "X".repeat(31) }).patch).toBeNull();
    expect(planVehicleFieldUpdate({ plate: "X".repeat(30) }).patch).not.toBeNull();
  });

  it("plans several fields at once", () => {
    expect(
      planVehicleFieldUpdate({ mileage: 100, vin: "5UXCR6C09N9K12345", plate: "abc123" }),
    ).toEqual({
      patch: { mileage: 100, vin: "5UXCR6C09N9K12345", license_plate: "ABC123" },
      error: null,
    });
  });

  it("rejects an empty update and non-object bodies", () => {
    expect(planVehicleFieldUpdate({}).patch).toBeNull();
    expect(planVehicleFieldUpdate({ color: "red" }).patch).toBeNull();
    expect(planVehicleFieldUpdate(null).patch).toBeNull();
    expect(planVehicleFieldUpdate("mileage").patch).toBeNull();
  });

  it("fails the whole plan when any one field is invalid", () => {
    expect(planVehicleFieldUpdate({ mileage: 100, vin: "SHORT" }).patch).toBeNull();
    expect(planVehicleFieldUpdate({ mileage: -3, plate: "OK123" }).patch).toBeNull();
  });
});
