import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import { makeSupabaseLibMock as mockMakeSupabaseLibMock } from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () => mockMakeServerApiMock(jest.requireActual("@/server/api")));
jest.mock("@/lib/supabase", () => mockMakeSupabaseLibMock());

import { workOrdersRouter as routerRaw } from "@/server/hono/routes/work-orders";
import { vehiclesRouter as vehiclesRouterRaw } from "@/server/hono/routes/vehicles";
import { testRouter } from "../test-support/routerTest";
import { authState, db, resetHarness, WS_ID } from "../test-support/state";

const router = testRouter(routerRaw);
const vehiclesRouter = testRouter(vehiclesRouterRaw);
const vehicleId = "770e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  resetHarness();
  db.workspace_members = { data: [{ workspace_id: WS_ID }], error: null };
});

describe("GET /v1/tech-app/data-center/vehicle", () => {
  it("registers once and requires exactly one supported selector", async () => {
    const response = await router.request("/v1/tech-app/data-center/vehicle?vin=one&vehicle_id=two");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      reason: "Provide exactly one of vin, plate plus state, or vehicle_id",
    });
  });

  it("authenticates through the caller session", async () => {
    authState.mode = "unauthorized";
    const response = await router.request(`/v1/tech-app/data-center/vehicle?vehicle_id=${vehicleId}`);
    expect(response.status).toBe(401);
  });

  it("keeps missing provider credentials inside the HTTP 200 failure contract", async () => {
    const prior = process.env.VEHICLE_DATABASES_API_KEY;
    delete process.env.VEHICLE_DATABASES_API_KEY;
    try {
      const response = await router.request("/v1/tech-app/data-center/vehicle?vin=5UXCR6C09N9K12345");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: false, reason: "Vehicle lookup is not configured" });
    } finally {
      if (prior === undefined) delete process.env.VEHICLE_DATABASES_API_KEY;
      else process.env.VEHICLE_DATABASES_API_KEY = prior;
    }
  });

  it("decodes a VIN through Vehicle Databases and leaves unavailable specs null", async () => {
    const priorKey = process.env.VEHICLE_DATABASES_API_KEY;
    process.env.VEHICLE_DATABASES_API_KEY = "test-key";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      data: {
        intro: { vin: "5UXCR6C09N9K12345" },
        basic: { year: 2026, make: "Unlisted", model: "Test Car" },
        engine: { engine_description: "2.0L I4" },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    db["vehicles:single"] = { data: null, error: null };
    db["vehicle_service_specs:single"] = { data: null, error: null };
    try {
      const response = await router.request("/v1/tech-app/data-center/vehicle?vin=5UXCR6C09N9K12345");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        vehicle: { vin: "5UXCR6C09N9K12345", year: 2026, make: "Unlisted", model: "Test Car", engine: "2.0L I4" },
        specs: null,
        source: "decode",
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.vehicledatabases.com/vin-decode/5UXCR6C09N9K12345",
        expect.objectContaining({ headers: expect.objectContaining({ "x-AuthKey": "test-key" }) }),
      );
    } finally {
      fetchSpy.mockRestore();
      if (priorKey === undefined) delete process.env.VEHICLE_DATABASES_API_KEY;
      else process.env.VEHICLE_DATABASES_API_KEY = priorKey;
    }
  });

  it("powers the existing POST /v1/vin/decode route from the shared provider", async () => {
    const priorKey = process.env.VEHICLE_DATABASES_API_KEY;
    process.env.VEHICLE_DATABASES_API_KEY = "test-key";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { vin: "5UXCR6C09N9K12345", year: 2022, make: "BMW", model: "X5", engine: "3.0L I6" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const response = await vehiclesRouter.request("/v1/vin/decode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vin: "5UXCR6C09N9K12345" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { vin: "5UXCR6C09N9K12345", year: 2022, make: "BMW", model: "X5", engine: "3.0L I6" },
      });
    } finally {
      fetchSpy.mockRestore();
      if (priorKey === undefined) delete process.env.VEHICLE_DATABASES_API_KEY;
      else process.env.VEHICLE_DATABASES_API_KEY = priorKey;
    }
  });

  it("returns workspace specs and leaves unavailable values null", async () => {
    db["vehicles:single"] = {
      data: { id: vehicleId, vin: "5UXCR6C09N9K12345", year: 2022, make: "BMW", model: "X5" },
      error: null,
    };
    db["vehicle_service_specs:single"] = {
      data: {
        engine: "3.0L I6",
        oil_type: "0W-20",
        oil_capacity: "7.0 quarts with filter",
        oil_filter: "WL10342",
        metadata: { oil_plug_torque: "18 ft. lbs." },
      },
      error: null,
    };

    const response = await router.request(`/v1/tech-app/data-center/vehicle?vehicle_id=${vehicleId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      vehicle: { vin: "5UXCR6C09N9K12345", year: 2022, make: "BMW", model: "X5", engine: "3.0L I6" },
      specs: {
        oilType: "0W-20",
        oilCapacityQuarts: 7,
        oilFilter: "WL10342",
        drainPlugTorqueFtLbs: 18,
        tireSize: null,
        tirePressurePsi: null,
        coolantType: null,
        batteryGroup: null,
      },
      source: "workspace",
    });
  });

  it("returns a vehicle with null specs when neither workspace nor catalog has a match", async () => {
    db["vehicles:single"] = {
      data: { id: vehicleId, vin: "5UXCR6C09N9K12345", year: 2026, make: "Unlisted", model: "Test Car" },
      error: null,
    };
    db["vehicle_service_specs:single"] = { data: null, error: null };

    const response = await router.request(`/v1/tech-app/data-center/vehicle?vehicle_id=${vehicleId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      vehicle: { vin: "5UXCR6C09N9K12345", year: 2026, make: "Unlisted", model: "Test Car", engine: null },
      specs: null,
      source: "workspace",
    });
  });

  it("uses the existing catalog rows when the workspace has no saved specs", async () => {
    db["vehicles:single"] = {
      data: { id: vehicleId, vin: null, year: 2022, make: "BMW", model: "X7" },
      error: null,
    };
    db["vehicle_service_specs:single"] = {
      data: { engine: "3.0L I6", oil_type: null, oil_capacity: null, oil_filter: null, metadata: {} },
      error: null,
    };

    const response = await router.request(`/v1/tech-app/data-center/vehicle?vehicle_id=${vehicleId}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.vehicle).toMatchObject({ year: 2022, make: "BMW", model: "X7" });
    expect(body.specs).toMatchObject({ oilType: "0W-20", oilCapacityQuarts: 6.9, oilFilter: "WL10342", drainPlugTorqueFtLbs: 18 });
    expect(body.source).toBe("catalog");
  });
});
