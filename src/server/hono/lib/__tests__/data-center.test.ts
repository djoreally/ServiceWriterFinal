/**
 * Data Center build (2026-11-11): unit contracts for the pure pieces
 * behind GET /v1/tech-app/data-center/vehicle, plus the route's
 * source-level contract (the plate-lookup-route.test.ts pattern).
 * The governing rule everywhere: never invent a spec.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVpicDecodeResponse, decodeVinWithNhtsa } from "../vin-decode";
import { mapWheelSizeModifications, wheelSizeSlug } from "../wheel-size";
import {
  appliesToFromCatalog,
  fillVehicleIdentityBlanks,
  mergeSpecs,
  parseCapacityQuarts,
  pickCatalogRow,
  specsFromCatalogRow,
  specsFromWorkspaceRow,
  EMPTY_SPECS,
} from "../data-center";

describe("mapVpicDecodeResponse", () => {
  const payload = {
    Results: [
      { Variable: "Model Year", Value: "2026" },
      { Variable: "Make", Value: "BMW" },
      { Variable: "Model", Value: "X7" },
      { Variable: "Displacement (L)", Value: "3.0" },
      { Variable: "Engine Number of Cylinders", Value: "6" },
    ],
  };

  it("maps year/make/model and composes the engine from stated values", () => {
    expect(mapVpicDecodeResponse("5uxcv6c09n9k12345", payload)).toEqual({
      success: true,
      vehicle: { vin: "5UXCV6C09N9K12345", year: 2026, make: "BMW", model: "X7", engine: "3.0L 6-cyl" },
    });
  });

  it("refuses a decode without year/make/model instead of inventing", () => {
    expect(mapVpicDecodeResponse("X", { Results: [{ Variable: "Make", Value: "BMW" }] })).toEqual({
      success: false,
      error: "Vehicle not found",
    });
    expect(mapVpicDecodeResponse("X", null).success).toBe(false);
  });

  it("leaves engine null when vPIC states no displacement", async () => {
    // Structural Response stub (jest's Response.json() is unreliable
    // in this repo's environment; the mapper itself is covered above).
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        Results: [
          { Variable: "Model Year", Value: "2020" },
          { Variable: "Make", Value: "Ford" },
          { Variable: "Model", Value: "F-150" },
        ],
      }),
    });
    const result = await decodeVinWithNhtsa("1FTFW1E84LFA00000", fetchFn as any);
    if (!result.success) throw new Error("expected a successful decode");
    expect(result.vehicle.engine).toBeNull();
  });
});

describe("wheelSizeSlug + mapWheelSizeModifications", () => {
  it("slugifies makes and models the way the API addresses them", () => {
    expect(wheelSizeSlug("Land Rover")).toBe("land-rover");
    expect(wheelSizeSlug("Mercedes-Benz")).toBe("mercedes-benz");
    expect(wheelSizeSlug("BMW")).toBe("bmw");
    expect(wheelSizeSlug("F-150")).toBe("f-150");
  });

  it("takes the stock fitment's literal size and pressure", () => {
    const payload = {
      data: [
        {
          wheels: [
            { is_stock: false, front: { tire_full: "275/45R21", tire_pressure: { psi: 38 } }, rear: { tire_full: "315/40R21", tire_pressure: { psi: 42 } } },
            { is_stock: true, front: { tire_full: "255/55R19", tire_pressure: { psi: 33 } }, rear: { tire_full: "255/55R19", tire_pressure: null } },
          ],
        },
      ],
    };
    expect(mapWheelSizeModifications(payload)).toEqual({ tireSize: "255/55R19", tirePressurePsi: 33 });
  });

  it("returns nulls when the API states nothing usable", () => {
    expect(mapWheelSizeModifications({ data: [] })).toEqual({ tireSize: null, tirePressurePsi: null });
    expect(mapWheelSizeModifications(null)).toEqual({ tireSize: null, tirePressurePsi: null });
  });
});

describe("parseCapacityQuarts", () => {
  it("converts stated liters and passes stated quarts through", () => {
    expect(parseCapacityQuarts("6.5 liters with filter")).toBe(6.9);
    expect(parseCapacityQuarts("8.0 qt")).toBe(8);
    expect(parseCapacityQuarts("5.3 quarts")).toBe(5.3);
  });

  it("never guesses a unit-less or empty capacity", () => {
    expect(parseCapacityQuarts("6.5")).toBeNull();
    expect(parseCapacityQuarts("")).toBeNull();
    expect(parseCapacityQuarts(null)).toBeNull();
  });
});

describe("pickCatalogRow", () => {
  const rows = [
    { engine: "Turbo 3.0", oil_type: "0W-30", oil_capacity: "6.5 liters with filter", oil_filter: null },
    { engine: "Turbo 4.4", oil_type: "0W-30", oil_capacity: "9.5 liters with filter", oil_filter: null },
  ];

  it("uses a single variant as-is and singles out variants by engine", () => {
    expect(pickCatalogRow([rows[0]], null)).toBe(rows[0]);
    expect(pickCatalogRow(rows, "3.0L 6-cyl")).toBe(rows[0]);
    expect(pickCatalogRow(rows, "4.4L 8-cyl")).toBe(rows[1]);
  });

  it("refuses to guess among variants without an engine", () => {
    expect(pickCatalogRow(rows, null)).toBeNull();
    expect(pickCatalogRow(rows, "electric")).toBeNull();
  });
});

describe("spec mapping + merge", () => {
  it("maps a catalog row, converting its stated liters", () => {
    expect(
      specsFromCatalogRow({ engine: "Turbo 3.0", oil_type: "0W-30", oil_capacity: "6.5 liters with filter", oil_filter: "" }),
    ).toEqual({ ...EMPTY_SPECS, oilType: "0W-30", oilCapacityQuarts: 6.9 });
  });

  it("reads workspace metadata extras only when literally present", () => {
    const specs = specsFromWorkspaceRow({
      oil_type: "0W-20",
      oil_capacity: "8.0 qt",
      oil_filter: "PF63",
      metadata: { drain_plug_torque_ft_lbs: 18, coolant_type: "Dex-Cool" },
    });
    expect(specs.oilCapacityQuarts).toBe(8);
    expect(specs.drainPlugTorqueFtLbs).toBe(18);
    expect(specs.coolantType).toBe("Dex-Cool");
    expect(specs.batteryGroup).toBeNull();
  });

  it("mergeSpecs fills gaps without overwriting", () => {
    const base = { ...EMPTY_SPECS, oilType: "0W-20" };
    const fill = { ...EMPTY_SPECS, oilType: "0W-30", oilFilter: "PF63" };
    expect(mergeSpecs(base, fill)).toEqual({ ...EMPTY_SPECS, oilType: "0W-20", oilFilter: "PF63" });
  });
});

describe("fillVehicleIdentityBlanks", () => {
  // The live shape (diagnosed 2026-11-13): Dave Hamilton's NV2500
  // row carries year + make and NO model; the NHTSA decode of its
  // VIN answers year/make/model "NV"/engine "4.0L".
  const decoded = {
    vin: "1N6BF0KY7JN800080",
    year: 2018,
    make: "Nissan",
    model: "NV",
    engine: "4.0L",
  };

  it("fills the blanks a legacy row never captured, from the decode", () => {
    expect(
      fillVehicleIdentityBlanks(
        { vin: "1N6BF0KY7JN800080", year: 2018, make: "Nissan", model: null, engine: null },
        decoded,
      ),
    ).toEqual({
      vin: "1N6BF0KY7JN800080",
      year: 2018,
      make: "Nissan",
      model: "NV",
      engine: "4.0L",
    });
  });

  it("never overwrites a stored value — the workspace record wins", () => {
    expect(
      fillVehicleIdentityBlanks(
        { vin: "1N6BF0KY7JN800080", year: 2018, make: "Nissan", model: "NV2500", engine: "5.6L" },
        decoded,
      ),
    ).toEqual({
      vin: "1N6BF0KY7JN800080",
      year: 2018,
      make: "Nissan",
      model: "NV2500",
      engine: "5.6L",
    });
  });

  it("leaves the identity untouched when there is no decode", () => {
    const vehicle = { vin: "1N6BF0KY7JN800080", year: 2018, make: "Nissan", model: null, engine: null };
    expect(fillVehicleIdentityBlanks(vehicle, null)).toEqual(vehicle);
    expect(fillVehicleIdentityBlanks(vehicle, undefined)).toEqual(vehicle);
  });
});

describe("appliesToFromCatalog", () => {
  it("derives the shop's services from its own catalog rows", () => {
    expect(
      appliesToFromCatalog([
        { name: "Full Synthetic Oil Change", category: "Oil Change" },
        { name: "Tire Rotation", category: "Tires" },
      ]),
    ).toEqual(["oil", "tires"]);
    expect(appliesToFromCatalog([{ name: "Brake Pads", category: "Brakes" }])).toEqual(["brakes"]);
    expect(appliesToFromCatalog([])).toEqual([]);
  });
});

describe("GET /v1/tech-app/data-center/vehicle — route contract", () => {
  const repoRoot = join(__dirname, "..", "..", "..", "..", "..");
  const SOURCE = readFileSync(join(repoRoot, "src/server/hono/routes/vehicles.ts"), "utf8");
  const start = SOURCE.indexOf('vehiclesRouter.get("/v1/tech-app/data-center/vehicle"');
  const block = SOURCE.slice(start, SOURCE.indexOf("vehiclesRouter.", start + 10));

  it("registers exactly once, behind requireAuth", () => {
    expect(SOURCE.match(/vehiclesRouter\.get\("\/v1\/tech-app\/data-center\/vehicle"/g) ?? []).toHaveLength(1);
    expect(block).toContain("await requireAuth(c)");
  });

  it("keeps auth outside the fail-soft try (401 stays a 401)", () => {
    const authAt = block.indexOf("await requireAuth(c)");
    const tryAt = block.indexOf("try {", authAt);
    expect(authAt).toBeGreaterThan(-1);
    expect(tryAt).toBeGreaterThan(authAt);
  });

  it("reads both provider keys from the environment, never hardcoded", () => {
    expect(block).toContain("process.env.VEHICLE_DATABASES_API_KEY");
    expect(block).toContain("process.env.WHEEL_SIZE_API_KEY");
  });

  it("fails soft at 200 and reuses the PR #241 plate helper + catalog index", () => {
    expect(block).toContain("success: false");
    expect(block).not.toContain("providerUnavailable");
    expect(block).toContain("decodePlateWithVehicleDatabases");
    expect(block).toContain("specsByYmm");
  });

  it("completes a matched-but-incomplete row's identity from the VIN decode", () => {
    // Regression (2026-11-13): a row with year+make but no model
    // starved every spec layer — the decode ran only when NO row
    // matched. Every row-adoption branch must run the completion:
    // vehicle_id, vin, and the identity selector that adopts a
    // uniquely matching row.
    expect(block).toContain("completeIdentityFromDecode");
    expect(block).toContain("fillVehicleIdentityBlanks");
    expect(block.match(/await completeIdentityFromDecode\(\)/g) ?? []).toHaveLength(3);
  });

  it("accepts a bare year+make+model identity selector for VIN-less jobs", () => {
    // Ariane Klepacki's 2024 Suburban (2026-11-13): the job has no
    // VIN, so a VIN-keyed fetch could never run — identity alone
    // must select, with the engine riding as a hint only.
    expect(block).toContain('url.searchParams.get("year")');
    expect(block).toContain('url.searchParams.get("make")');
    expect(block).toContain('url.searchParams.get("model")');
    expect(block).toContain('url.searchParams.get("engine")');
    expect(block).toContain("identityProvided");
    expect(block).toContain("year+make+model");
  });
});
