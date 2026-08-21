import { clearIncompatibleVehicleConfiguration, mergeBookingRequirements, vehicleMeetsBookingRequirements } from "@/lib/booking-requirements";
import type { VehicleData } from "@/components/booking/VehicleEntry";

const vehicle = (overrides: Partial<VehicleData> = {}): VehicleData => ({ id: "v1", year: "2022", make: "Lexus", model: "RX350", engine: "", licensePlate: "", vin: "", mileage: "", ...overrides });

describe("booking requirements", () => {
  it("composes mixed service requirements without choosing one selector", () => {
    expect(mergeBookingRequirements([["basic_vehicle", "oil_fitment"], ["tire_fitment"]])).toEqual(["basic_vehicle", "oil_fitment", "tire_fitment"]);
  });

  it("requires tire size for tire bookings", () => {
    expect(vehicleMeetsBookingRequirements(vehicle(), ["tire_fitment"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ tireSize: "not-a-size" }), ["tire_fitment"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ tireSize: "235/55R20" }), ["tire_fitment"])).toBe(true);
    expect(vehicleMeetsBookingRequirements(vehicle({ tireSize: "235/55R20" }), ["tire_fitment", "tire_quantity"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ tireSize: "235/55R20", tireFrontQuantity: 2, tireRearQuantity: 0 }), ["tire_fitment", "tire_quantity"])).toBe(true);
    expect(vehicleMeetsBookingRequirements(vehicle({ tireSize: "235/55R20", rearTireSize: "275/45R20", tireFrontQuantity: 2, tireRearQuantity: 2 }), ["tire_fitment", "tire_quantity"])).toBe(true);
  });

  it("requires size and condition for detailing", () => {
    expect(vehicleMeetsBookingRequirements(vehicle({ detailingVehicleSize: "large" }), ["basic_vehicle", "detailing_assessment"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ detailingVehicleSize: "large", detailingCondition: "moderate" }), ["basic_vehicle", "detailing_assessment"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ detailingVehicleSize: "large", detailingCondition: "moderate", detailingMobileAccessConfirmed:true }), ["basic_vehicle", "detailing_assessment"])).toBe(true);
    expect(vehicleMeetsBookingRequirements(vehicle({ detailingVehicleSize:"large",detailingCondition:"heavy",detailingMobileAccessConfirmed:true,detailingPhotoRequired:true }),["detailing_assessment"])).toBe(false);
    expect(vehicleMeetsBookingRequirements(vehicle({ detailingVehicleSize:"large",detailingCondition:"heavy",detailingMobileAccessConfirmed:true,detailingPhotoRequired:true,detailingPhotos:["photo.jpg"] }),["detailing_assessment"])).toBe(true);
  });

  it("clears configuration made incompatible by a service change", () => {
    const result = clearIncompatibleVehicleConfiguration(vehicle({ tireSize: "235/55R20", tireSizeSource: "oe", oilType: "0W-20", detailingCondition: "heavy" }), ["basic_vehicle"]);
    expect(result).toMatchObject({ tireSize: undefined, oilType: undefined, detailingCondition: undefined });
  });
});
