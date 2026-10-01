/**
 * Grey-box tests for the vehicles Hono router (vehicles, service records,
 * service catalog, CARFAX integrations).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);

import { vehiclesRouter as vehiclesRouterRaw } from "@/server/hono/routes/vehicles";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const vehiclesRouter = testRouter(vehiclesRouterRaw);

const VEHICLE_ID = "dd0e8400-e29b-41d4-a716-446655440004";

beforeEach(() => {
  resetHarness();
});

describe("vehicles router", () => {
  describe("GET /v1/vehicles", () => {
    it("lists non-archived vehicles", async () => {
      db.vehicles = {
        data: [
          { id: VEHICLE_ID, metadata: {} },
          { id: "archived-1", metadata: { archived_at: "2026-01-01" } },
        ],
        error: null,
      };
      const res = await vehiclesRouter.request(
        `/v1/vehicles?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(VEHICLE_ID);
    });

    it("supports limit/offset pagination", async () => {
      db.vehicles = { data: [], error: null };
      const res = await vehiclesRouter.request(
        `/v1/vehicles?workspace_id=${WS_ID}&limit=5&offset=10`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).pagination).toEqual({ limit: 5, offset: 10 });
    });

    it("requires workspace_id", async () => {
      const res = await vehiclesRouter.request("/v1/vehicles");
      expect(res.status).toBe(500);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await vehiclesRouter.request(
        `/v1/vehicles?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/vehicles", () => {
    const body = {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      year: 2020,
      make: "Toyota",
      model: "Camry",
    };

    it("creates a vehicle and returns 201", async () => {
      db["customers:single"] = { data: { id: CUSTOMER_ID }, error: null };
      db["vehicles:single"] = {
        data: { id: VEHICLE_ID, make: "Toyota" },
        error: null,
      };
      const res = await vehiclesRouter.request("/v1/vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe(VEHICLE_ID);
      expect(calls.inserts.some((i) => i.table === "vehicles")).toBe(true);
    });

    it("rejects a customer outside the workspace", async () => {
      db["customers:single"] = { data: null, error: null };
      const res = await vehiclesRouter.request("/v1/vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).not.toBe(201);
      expect(calls.inserts).toHaveLength(0);
    });

    it("rejects an implausible year", async () => {
      const res = await vehiclesRouter.request("/v1/vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, year: 1800 }),
      });
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /v1/vehicles/:id", () => {
    it("soft-archives the vehicle via metadata", async () => {
      db["vehicles:single"] = {
        data: { id: VEHICLE_ID, metadata: {} },
        error: null,
      };
      const res = await vehiclesRouter.request(
        `/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      const update = calls.updates.find((u) => u.table === "vehicles");
      expect(update).toBeDefined();
      expect(
        ((update!.patch as Record<string, unknown>).metadata as Record<string, unknown>)
          .archived_at,
      ).toBeDefined();
    });

    it("rejects vehicles outside the workspace", async () => {
      db["vehicles:single"] = { data: null, error: null };
      const res = await vehiclesRouter.request(
        `/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(500);
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("GET /v1/vehicles/:id/summary", () => {
    it("aggregates vehicle history", async () => {
      db["vehicles:single"] = {
        data: { id: VEHICLE_ID, make: "Toyota" },
        error: null,
      };
      db.service_records = { data: [], error: null };
      db.appointments = { data: [], error: null };
      db.work_orders = { data: [], error: null };
      db.invoices = { data: [], error: null };
      const res = await vehiclesRouter.request(
        `/v1/vehicles/${VEHICLE_ID}/summary?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toBeDefined();
    });
  });

  describe("service records", () => {
    it("lists service records", async () => {
      db.service_records = { data: [], error: null };
      const res = await vehiclesRouter.request(
        `/v1/service-records?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });
  });

  describe("route registration", () => {
    it("exposes the CARFAX settings endpoints", async () => {
      const res = await vehiclesRouter.request(
        `/v1/carfax/settings?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the vehicle service catalog", async () => {
      const res = await vehiclesRouter.request(
        `/v1/service-catalog?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await vehiclesRouter.request("/v1/vehicles-zzz");
      expect(res.status).toBe(404);
    });
  });
});
