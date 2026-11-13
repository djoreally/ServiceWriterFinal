import {
  fetchMaintenanceSchedule,
  fetchOilLookup,
  mapFluidSpecsResponse,
  mapMaintenanceResponse,
  mapOilLookupResponse,
} from "../vehicle-databases-data";

describe("mapMaintenanceResponse", () => {
  it("maps the documented v4 shape, ascending by mileage", () => {
    const payload = {
      status: "success",
      data: {
        vin: "1HGCM82633A004352",
        year: 2021,
        make: "Honda",
        model: "Accord",
        trim: "LX",
        maintenance: [
          {
            mileage: { miles: 10000, km: 16093 },
            service_items: ["Rotate tires", "Inspect brake pads"],
          },
          {
            mileage: { miles: 5000, km: 8046 },
            service_items: ["Change engine oil and filter"],
          },
        ],
      },
    };
    expect(mapMaintenanceResponse(payload)).toEqual([
      { miles: 5000, km: 8046, items: ["Change engine oil and filter"] },
      { miles: 10000, km: 16093, items: ["Rotate tires", "Inspect brake pads"] },
    ]);
  });

  it("drops intervals with no mileage or no items; empty answers null", () => {
    const payload = {
      status: "success",
      data: {
        maintenance: [
          { mileage: { miles: 0, km: 0 }, service_items: ["Change engine oil"] },
          { mileage: { miles: 7500, km: 12070 }, service_items: [] },
          { mileage: { miles: 7500, km: 12070 }, service_items: ["  ", "Inspect belts"] },
        ],
      },
    };
    expect(mapMaintenanceResponse(payload)).toEqual([
      { miles: 7500, km: 12070, items: ["Inspect belts"] },
    ]);
    expect(mapMaintenanceResponse({ status: "success", data: {} })).toBeNull();
    expect(mapMaintenanceResponse(null)).toBeNull();
    expect(mapMaintenanceResponse("nope")).toBeNull();
  });
});

describe("mapOilLookupResponse", () => {
  it("reads oil type, unit-stated capacity, filter, and tire size tolerantly", () => {
    const payload = {
      status: "success",
      data: {
        engine_oil: {
          recommended_type: "SAE 0W-20 Full Synthetic",
          capacity: "6.5 quarts",
          filter_part_number: "PF63",
        },
        tires: { front_size: "265/70R17" },
      },
    };
    const specs = mapOilLookupResponse(payload);
    expect(specs.oilType).toBe("SAE 0W-20 Full Synthetic");
    expect(specs.oilCapacityQuarts).toBe(6.5);
    expect(specs.oilFilter).toBe("PF63");
    expect(specs.tireSize).toBe("265/70R17");
  });

  it("never guesses a bare-number capacity", () => {
    const payload = { status: "success", data: { oil_capacity: 6.5 } };
    expect(mapOilLookupResponse(payload).oilCapacityQuarts).toBeNull();
  });

  it("converts a liter-stated capacity to quarts", () => {
    const payload = { status: "success", data: { engine: { oil: { capacity: "6.2 liters" } } } };
    expect(mapOilLookupResponse(payload).oilCapacityQuarts).toBe(6.6);
  });

  it("answers all-null specs for an unreadable body", () => {
    const specs = mapOilLookupResponse({ status: "error" });
    expect(Object.values(specs).every((value) => value === null)).toBe(true);
  });
});

describe("mapFluidSpecsResponse", () => {
  it("reads the coolant type", () => {
    const payload = {
      status: "success",
      data: { coolant: { type: "Dex-Cool 50/50", capacity: "10.4 quarts" } },
    };
    expect(mapFluidSpecsResponse(payload).coolantType).toBe("Dex-Cool 50/50");
  });

  it("answers null coolant when the body names none", () => {
    expect(mapFluidSpecsResponse({ status: "success", data: {} }).coolantType).toBeNull();
  });
});

describe("clients fail soft", () => {
  const failingFetch = async () =>
    ({ ok: false, status: 402, json: async () => ({}) }) as unknown as Response;
  const throwingFetch = async () => {
    throw new Error("network down");
  };

  it("oil lookup answers success:false on a 402 and on a network throw", async () => {
    await expect(
      fetchOilLookup("1HGCM82633A004352", "key", failingFetch as never),
    ).resolves.toEqual({ success: false, error: "Vehicle data lookup failed" });
    await expect(
      fetchOilLookup("1HGCM82633A004352", "key", throwingFetch as never),
    ).resolves.toEqual({ success: false, error: "Vehicle data lookup failed" });
  });

  it("maintenance answers success:false when the body has no schedule", async () => {
    const emptyFetch = async () =>
      ({ ok: true, status: 200, json: async () => ({ status: "success", data: {} }) }) as unknown as Response;
    await expect(
      fetchMaintenanceSchedule("1HGCM82633A004352", "key", emptyFetch as never),
    ).resolves.toEqual({ success: false, error: "Vehicle data not found" });
  });
});
