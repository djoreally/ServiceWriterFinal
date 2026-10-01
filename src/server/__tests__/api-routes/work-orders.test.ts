import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));

import * as api from "@/server/api";
import { GET as workOrdersGet, POST as workOrdersPost } from "../../../../app/api/v1/work-orders/route";
import {
  GET as workOrderGet,
  PATCH as workOrderPatch,
} from "../../../../app/api/v1/work-orders/[id]/route";
import { POST as checklistAdvancePost } from "../../../../app/api/v1/work-orders/checklist/advance/route";
import { PATCH as checklistItemPatch } from "../../../../app/api/v1/work-orders/checklist/items/[itemId]/route";
import {
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  WS_ID,
  TEST_USER,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const WORK_ORDER_ID = "66666666-6666-4666-8666-666666666666";
const ITEM_ID = "77777777-7777-4777-8777-777777777777";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";

// The [id] PATCH route destructures `membership` from requireWorkspaceMember;
// the shared stub only returns { supabase, user }.
function stubMember(supabase: MockSupabaseClient, role = "owner") {
  (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({
    supabase,
    user: TEST_USER,
    membership: { role },
  });
}

describe("work-orders/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await workOrdersGet(makeRequest(`/api/v1/work-orders?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when workspace_id is missing (route throws before auth)", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(await workOrdersGet(makeRequest("/api/v1/work-orders")));
      expect(status).toBe(500);
    });

    it("returns 200 with paginated work orders", async () => {
      const supabase = makeSupabaseClient({ work_orders: { data: [{ id: WORK_ORDER_ID }], error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await workOrdersGet(makeRequest(`/api/v1/work-orders?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toEqual({ limit: 25, offset: 0 });
    });
  });

  describe("POST", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await workOrdersPost(
          makeRequest("/api/v1/work-orders", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID },
          }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await workOrdersPost(makeRequest("/api/v1/work-orders", { method: "POST", body: {} })),
      );
      expect(status).toBe(500);
    });

    it("returns 500 when the RPC returns no work order identifier", async () => {
      const supabase = makeSupabaseClient();
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await workOrdersPost(
          makeRequest("/api/v1/work-orders", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID },
          }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 201 with the created work order", async () => {
      const supabase = makeSupabaseClient();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: { id: WORK_ORDER_ID, number: "WO-1001" },
        error: null,
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await workOrdersPost(
          makeRequest("/api/v1/work-orders", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, priority: "high" },
          }),
        ),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(WORK_ORDER_ID);
      expect(body.data.number).toBe("WO-1001");
      expect(supabase.rpc).toHaveBeenCalledWith("create_work_order_v1", expect.objectContaining({ p_workspace_id: WS_ID }));
    });
  });
});

describe("work-orders/[id]/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await workOrderGet(
          makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when workspace_id is missing (route throws before auth)", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await workOrderGet(
          makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}`),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the work order", async () => {
      const supabase = makeSupabaseClient({ work_orders: { data: { id: WORK_ORDER_ID }, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await workOrderGet(
          makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(WORK_ORDER_ID);
    });
  });

  describe("PATCH", () => {
    const patchBody = (extra: Record<string, unknown>) => ({
      workspace_id: WS_ID,
      ...extra,
    });
    const patchRequest = (extra: Record<string, unknown>) =>
      makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}`, { method: "PATCH", body: patchBody(extra) });

    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status, body } = await readJson(
        await workOrderPatch(
          makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, status: "in_progress" },
          }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(401);
      expect(body.error.code).toBe("unauthenticated");
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubMember(makeSupabaseClient());
      const { status } = await readJson(
        await workOrderPatch(
          makeRequest(`/api/v1/work-orders/${WORK_ORDER_ID}`, { method: "PATCH", body: {} }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 403 technician_field_forbidden when a technician changes a restricted field", async () => {
      stubMember(makeSupabaseClient(), "technician");
      const { status, body } = await readJson(
        await workOrderPatch(
          patchRequest({ priority: "high" }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(403);
      expect(body.error.code).toBe("technician_field_forbidden");
    });

    it("returns 403 technician_status_forbidden when a technician sets a restricted status", async () => {
      stubMember(makeSupabaseClient(), "technician");
      const { status, body } = await readJson(
        await workOrderPatch(
          patchRequest({ status: "scheduled" }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(403);
      expect(body.error.code).toBe("technician_status_forbidden");
    });

    it("returns 403 technician_assignment_required when the technician is not assigned", async () => {
      const supabase = makeSupabaseClient({ work_order_assignments: { data: null, error: null } });
      stubMember(supabase, "technician");
      const { status, body } = await readJson(
        await workOrderPatch(
          patchRequest({ status: "in_progress" }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(403);
      expect(body.error.code).toBe("technician_assignment_required");
    });

    it("returns 200 when the technician is actively assigned", async () => {
      const supabase = makeSupabaseClient({
        work_order_assignments: { data: { work_order_id: WORK_ORDER_ID }, error: null },
        work_orders: { data: { id: WORK_ORDER_ID, status: "in_progress" }, error: null },
      });
      stubMember(supabase, "technician");
      const { status, body } = await readJson(
        await workOrderPatch(
          patchRequest({ status: "in_progress", technician_notes: "On it" }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(WORK_ORDER_ID);
      expect(supabase.rpc).toHaveBeenCalledWith("patch_work_order_v1", expect.objectContaining({ p_work_order_id: WORK_ORDER_ID }));
    });

    it("returns 200 for an owner patch via the RPC", async () => {
      const supabase = makeSupabaseClient({
        work_orders: { data: { id: WORK_ORDER_ID, status: "assigned" }, error: null },
      });
      stubMember(supabase, "owner");
      const { status, body } = await readJson(
        await workOrderPatch(
          patchRequest({ priority: "urgent" }),
          contextWithParams({ id: WORK_ORDER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(WORK_ORDER_ID);
    });
  });
});

describe("work-orders/checklist/advance/route", () => {
  describe("POST", () => {
    it("rejects when workspace membership check fails", async () => {
      // This route has no try/catch: auth failures propagate as rejections.
      stubWorkspaceMemberReject(api);
      await expect(
        checklistAdvancePost(
          makeRequest("/api/v1/work-orders/checklist/advance", {
            method: "POST",
            body: { workspace_id: WS_ID, item_id: ITEM_ID },
          }),
        ),
      ).rejects.toThrow("Access denied");
    });

    it("rejects when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      await expect(
        checklistAdvancePost(makeRequest("/api/v1/work-orders/checklist/advance", { method: "POST", body: {} })),
      ).rejects.toThrow();
    });

    it("returns 501 checklist_not_configured (retired workflow)", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status, body } = await readJson(
        await checklistAdvancePost(
          makeRequest("/api/v1/work-orders/checklist/advance", {
            method: "POST",
            body: { workspace_id: WS_ID, item_id: ITEM_ID },
          }),
        ),
      );
      expect(status).toBe(501);
      expect(body.error.code).toBe("checklist_not_configured");
    });
  });
});

describe("work-orders/checklist/items/[itemId]/route", () => {
  describe("PATCH", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await checklistItemPatch(
          makeRequest(`/api/v1/work-orders/checklist/items/${ITEM_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, status: "done" },
          }),
          contextWithParams({ itemId: ITEM_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body has no updatable fields", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await checklistItemPatch(
          makeRequest(`/api/v1/work-orders/checklist/items/${ITEM_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID },
          }),
          contextWithParams({ itemId: ITEM_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 500 when the checklist item is not found", async () => {
      const supabase = makeSupabaseClient({ work_order_checklist_items: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await checklistItemPatch(
          makeRequest(`/api/v1/work-orders/checklist/items/${ITEM_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, status: "done" },
          }),
          contextWithParams({ itemId: ITEM_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the updated checklist item", async () => {
      const supabase = makeSupabaseClient({
        work_order_checklist_items: { data: { id: ITEM_ID, work_order_id: WORK_ORDER_ID, status: "done" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await checklistItemPatch(
          makeRequest(`/api/v1/work-orders/checklist/items/${ITEM_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, status: "done" },
          }),
          contextWithParams({ itemId: ITEM_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(ITEM_ID);
    });
  });
});
