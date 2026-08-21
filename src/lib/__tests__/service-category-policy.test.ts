import { resolveCategoryPolicy, type ServiceCategoryPolicyRow } from "@/lib/service-category-policy";

const rows: ServiceCategoryPolicyRow[] = [
  { id: "oil_change", name: "Oil Change", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: true, booking_requirements: ["basic_vehicle", "oil_fitment"] },
  { id: "tires", name: "Tires", parent_id: null, vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["tire_fitment"] },
  { id: "tires_service", name: "Tire Service", parent_id: "tires", vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["tire_fitment"] },
  { id: "detailing", name: "Detailing", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: false, booking_requirements: ["basic_vehicle", "detailing_assessment"] },
];

describe("resolveCategoryPolicy", () => {
  it("defaults to YMM + fluids when nothing is selected", () => {
    expect(resolveCategoryPolicy(rows, [])).toEqual({
      vehicleSelector: "ymm_engine",
      showsFluidSpecs: true,
      matched: false,
      requirements: ["basic_vehicle"],
    });
  });

  it("uses the wheel/tire configurator and hides fluids for tire categories", () => {
    expect(resolveCategoryPolicy(rows, ["Tire Service"])).toEqual({
      vehicleSelector: "wheel_tire",
      showsFluidSpecs: false,
      matched: true,
      requirements: ["tire_fitment"],
    });
  });

  it("keeps YMM but hides fluids for detailing", () => {
    expect(resolveCategoryPolicy(rows, ["detailing"])).toEqual({
      vehicleSelector: "ymm_engine",
      showsFluidSpecs: false,
      matched: true,
      requirements: ["basic_vehicle", "detailing_assessment"],
    });
  });

  it("shows fluids when an oil service is mixed in", () => {
    const policy = resolveCategoryPolicy(rows, ["detailing", "oil_change"]);
    expect(policy.showsFluidSpecs).toBe(true);
    expect(policy.vehicleSelector).toBe("ymm_engine");
  });

  it("prefers the tire selector when a tire service is mixed in", () => {
    expect(resolveCategoryPolicy(rows, ["oil_change", "tires"]).vehicleSelector).toBe("wheel_tire");
  });

  it("falls back to keywords for legacy free-text categories", () => {
    expect(resolveCategoryPolicy(rows, ["Winter Tire Changeover"])).toMatchObject({
      vehicleSelector: "wheel_tire",
      showsFluidSpecs: false,
    });
    expect(resolveCategoryPolicy(rows, ["Ceramic Coating"])).toMatchObject({
      vehicleSelector: "ymm_engine",
      showsFluidSpecs: false,
    });
  });
});
