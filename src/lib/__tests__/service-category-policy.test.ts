import { resolveCategoryPolicy, type ServiceCategoryPolicyRow } from "@/lib/service-category-policy";

const rows: ServiceCategoryPolicyRow[] = [
  { id: "oil_change", name: "Oil Change", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: true, booking_requirements: ["basic_vehicle", "oil_fitment"] },
  { id: "tires", name: "Tires", parent_id: null, vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["tire_fitment"] },
  { id: "tires_service", name: "Tire Service", parent_id: "tires", vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["tire_fitment"] },
  { id: "detailing", name: "Detailing", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: false, booking_requirements: ["basic_vehicle", "detailing_assessment"] },
];

describe("resolveCategoryPolicy", () => {
  it("defaults to YMM without fluid specs when nothing is selected", () => {
    // Since aecf70f0d ("categories deterministically drive fitment
    // requirements"), fluid specs are shown only when an oil/fluid
    // service is actually selected — the empty-selection default hides
    // them instead of assuming an oil service.
    expect(resolveCategoryPolicy(rows, [])).toEqual({
      vehicleSelector: "ymm_engine",
      showsFluidSpecs: false,
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

  it("keeps the YMM selector when oil and tire services are mixed in", () => {
    // Combined oil+tire bookings keep the authoritative YMM+engine
    // selector and append tire fitment; only pure tire bookings use the
    // wheel/tire selector.
    const policy = resolveCategoryPolicy(rows, ["oil_change", "tires"]);
    expect(policy.vehicleSelector).toBe("ymm_engine");
    expect(policy.showsFluidSpecs).toBe(true);
    expect(policy.requirements).toEqual(expect.arrayContaining(["oil_fitment", "tire_fitment"]));
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
