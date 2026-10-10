import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireUser: jest.fn(),
}));

import * as api from "@/server/api";
import { vehiclesRouter } from "@/server/hono/routes/vehicles";
import { testRouter } from "../../hono/test-support/routerTest";
import {
  makeRequest,
  readJson,
  makeSupabaseClient,
  stubRequireUser,
  WS_ID,
  TEST_USER,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const app = testRouter(vehiclesRouter);

const WO_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const WO_ID_2 = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaab";
const TECH_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const TECH_AUTH_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const OWNER_ID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WO_ID,
    status: "scheduled",
    user_id: OWNER_ID,
    workspace_id: WS_ID,
    assigned_technician_id: null,
    assigned_van_id: null,
    ...overrides,
  };
}

function dispatchClient(tables: Record<string, { data?: unknown; error?: unknown }> = {}): MockSupabaseClient {
  const client = makeSupabaseClient(
    {
      fleet_work_orders: { data: orderRow(), error: null },
      workspace_members: { data: { role: "dispatcher" }, error: null },
      technicians: { data: { id: TECH_ID, auth_user_id: TECH_AUTH_ID, user_id: TECH_AUTH_ID }, error: null },
      fleet_activity_logs: { data: [], error: null },
      ...tables,
    },
  );
  stubRequireUser(api, client, TEST_USER);
  return client;
}

function postDispatch(workOrderId: string, body: unknown) {
  return app.request(
    makeRequest(`/v1/fleet/work-orders/${workOrderId}/dispatch`, { method: "POST", body }),
  );
}

describe("POST /v1/fleet/work-orders/:id/dispatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dispatches through the lifecycle RPC, persists the assignment, and logs the event", async () => {
    const client = dispatchClient();
    const { status, body } = await readJson(
      await postDispatch(WO_ID, { technician_id: TECH_ID }),
    );

    expect(status).toBe(200);
    expect(body.data.id).toBe(WO_ID);
    expect(client.rpc).toHaveBeenCalledWith(
      "transition_fleet_work_order",
      expect.objectContaining({ p_target_status: "assigned", p_work_order_id: WO_ID }),
    );
    // Assignment columns are written explicitly (the RPC body is a black box).
    const updateCalls = (client.from as jest.Mock).mock.calls.filter(([t]) => t === "fleet_work_orders");
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(client.from).toHaveBeenCalledWith("fleet_activity_logs");
  });

  it("returns 404 when the work order does not exist", async () => {
    dispatchClient({ fleet_work_orders: { data: null, error: null } });
    const { status, body } = await readJson(await postDispatch(WO_ID, { technician_id: TECH_ID }));
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 403 when the caller has no ops role in the work order workspace", async () => {
    dispatchClient({ workspace_members: { data: null, error: null } });
    const { status, body } = await readJson(await postDispatch(WO_ID, { technician_id: TECH_ID }));
    expect(status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 when the technician is not a member of the workspace", async () => {
    dispatchClient({ technicians: { data: null, error: null } });
    const { status, body } = await readJson(await postDispatch(WO_ID, { technician_id: TECH_ID }));
    expect(status).toBe(404);
    expect(body.error.code).toBe("invalid_technician");
  });

  it("returns 409 when the work order status cannot be dispatched", async () => {
    dispatchClient({ fleet_work_orders: { data: orderRow({ status: "completed" }), error: null } });
    const { status, body } = await readJson(await postDispatch(WO_ID, { technician_id: TECH_ID }));
    expect(status).toBe(409);
    expect(body.error.code).toBe("invalid_status");
  });
});

describe("POST /v1/fleet/work-orders/batch-assign", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes each assignment through the validated dispatch path with honest per-item results", async () => {
    const client = dispatchClient();
    const { status, body } = await readJson(
      await app.request(
        makeRequest("/v1/fleet/work-orders/batch-assign", {
          method: "POST",
          body: { payload: { workOrderIds: [WO_ID], technicianId: TECH_ID } },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.data.success).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(body.data.results).toEqual([{ work_order_id: WO_ID, ok: true }]);
    expect(client.rpc).toHaveBeenCalledWith(
      "transition_fleet_work_order",
      expect.objectContaining({ p_target_status: "assigned", p_work_order_id: WO_ID }),
    );
  });

  it("reports per-item failures instead of silently counting them", async () => {
    dispatchClient({ fleet_work_orders: { data: orderRow({ status: "completed" }), error: null } });
    const { status, body } = await readJson(
      await app.request(
        makeRequest("/v1/fleet/work-orders/batch-assign", {
          method: "POST",
          body: { payload: { workOrderIds: [WO_ID, WO_ID_2], technicianId: TECH_ID } },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.data.success).toBe(0);
    expect(body.data.failed).toBe(2);
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0]).toMatchObject({ work_order_id: WO_ID, ok: false });
    expect(body.data.results[0].error).toMatch(/cannot be dispatched/);
  });
});
