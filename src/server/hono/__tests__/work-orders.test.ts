/**
 * Grey-box tests for the work-orders Hono router (work orders, checklists,
 * assets, job threads, inventory).
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

import { workOrdersRouter as workOrdersRouterRaw } from "@/server/hono/routes/work-orders";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const workOrdersRouter = testRouter(workOrdersRouterRaw);

const WO_ID = "ee0e8400-e29b-41d4-a716-446655440005";

beforeEach(() => {
  resetHarness();
});

describe("work-orders router", () => {
  describe("GET /v1/work-orders", () => {
    it("lists work orders with pagination", async () => {
      db.work_orders = { data: [{ id: WO_ID, status: "open" }], error: null };
      const res = await workOrdersRouter.request(
        `/v1/work-orders?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.limit).toBeGreaterThan(0);
    });

    it("filters by status", async () => {
      db.work_orders = { data: [], error: null };
      const res = await workOrdersRouter.request(
        `/v1/work-orders?workspace_id=${WS_ID}&status=open`,
      );
      expect(res.status).toBe(200);
    });

    it("requires workspace_id", async () => {
      const res = await workOrdersRouter.request("/v1/work-orders");
      expect(res.status).toBe(500);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await workOrdersRouter.request(
        `/v1/work-orders?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/work-orders", () => {
    const body = {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      complaint: "Oil change",
    };

    it("creates a work order via the create_work_order_v1 rpc", async () => {
      db["rpc:create_work_order_v1"] = {
        data: { id: WO_ID, number: 1042 },
        error: null,
      };
      const res = await workOrdersRouter.request("/v1/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe(WO_ID);
      expect(calls.rpc.some((r) => r.fn === "create_work_order_v1")).toBe(true);
    });

    it("returns 500 when the rpc yields no identifier", async () => {
      db["rpc:create_work_order_v1"] = { data: null, error: null };
      const res = await workOrdersRouter.request("/v1/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(500);
    });

    it("rejects an unknown priority", async () => {
      const res = await workOrdersRouter.request("/v1/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, priority: "whenever" }),
      });
      expect(res.status).toBe(500);
      expect(calls.rpc).toHaveLength(0);
    });
  });

  describe("technician field guard on PATCH", () => {
    it("rejects technician edits to forbidden fields", async () => {
      authState.role = "technician";
      const res = await workOrdersRouter.request(`/v1/work-orders/${WO_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID, priority: "urgent" }),
      });
      // Either the field guard fires (403) or the schema rejects the field;
      // either way the patch must not go through.
      expect([403, 500]).toContain(res.status);
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("route registration", () => {
    it("exposes the command center", async () => {
      const res = await workOrdersRouter.request(
        `/v1/command-center?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the inventory overview", async () => {
      const res = await workOrdersRouter.request(
        `/v1/inventory/overview?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the job-thread timeline", async () => {
      const res = await workOrdersRouter.request(
        `/v1/job-threads/timeline?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await workOrdersRouter.request("/v1/work-orders-zzz");
      expect(res.status).toBe(404);
    });
  });
});
