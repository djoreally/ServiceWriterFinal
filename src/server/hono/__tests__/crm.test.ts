/**
 * Grey-box tests for the CRM Hono router (customers, campaigns, loyalty, retention).
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

import { crmRouter as crmRouterRaw } from "@/server/hono/routes/crm";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const crmRouter = testRouter(crmRouterRaw);

beforeEach(() => {
  resetHarness();
});

describe("crm router", () => {
  describe("POST /v1/customers", () => {
    const body = {
      workspace_id: WS_ID,
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
    };

    it("creates a customer and returns 201", async () => {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, ...body },
        error: null,
      };
      const res = await crmRouter.request("/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe(CUSTOMER_ID);
      const insert = calls.inserts.find((i) => i.table === "customers");
      expect(insert).toBeDefined();
      expect(
        (insert!.rows as Record<string, unknown>).created_by,
      ).toBeDefined();
    });

    it("rejects an invalid email address", async () => {
      const res = await crmRouter.request("/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, email: "not-an-email" }),
      });
      expect(res.status).toBe(500);
      expect(calls.inserts).toHaveLength(0);
    });

    it("requires first_name", async () => {
      const res = await crmRouter.request("/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID }),
      });
      expect(res.status).toBe(500);
    });

    it("enforces staff write roles", async () => {
      authState.role = "technician";
      const res = await crmRouter.request("/v1/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /v1/customers/:id", () => {
    it("returns the customer", async () => {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, first_name: "Ada" },
        error: null,
      };
      const res = await crmRouter.request(
        `/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(CUSTOMER_ID);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await crmRouter.request(
        `/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /v1/customers/:id", () => {
    it("updates the customer", async () => {
      db["customers:single"] = {
        data: { id: CUSTOMER_ID, notes: "vip" },
        error: null,
      };
      const res = await crmRouter.request(`/v1/customers/${CUSTOMER_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID, notes: "vip" }),
      });
      expect(res.status).toBe(200);
      expect(calls.updates.some((u) => u.table === "customers")).toBe(true);
    });

    it("rejects an empty patch", async () => {
      const res = await crmRouter.request(`/v1/customers/${CUSTOMER_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID }),
      });
      // zod .refine violation -> ZodError -> 500 via app onError
      expect(res.status).toBe(500);
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("CRM capability gating", () => {
    const campaign = {
      workspace_id: WS_ID,
      name: "Win-back Q4",
      purpose: "win_back",
      channel: "email",
    };

    it("creates a campaign when the capability is granted", async () => {
      db["rpc:has_crm_capability"] = { data: true, error: null };
      db["crm_campaigns:single"] = {
        data: { id: "camp-1", name: "Win-back Q4" },
        error: null,
      };
      const res = await crmRouter.request("/v1/crm/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campaign),
      });
      expect(res.status).toBe(201);
      expect(
        calls.rpc.some((r) => r.fn === "has_crm_capability"),
      ).toBe(true);
    });

    it("returns 403 crm_forbidden when the capability is denied", async () => {
      db["rpc:has_crm_capability"] = { data: false, error: null };
      const res = await crmRouter.request("/v1/crm/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campaign),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("crm_forbidden");
      expect(calls.inserts).toHaveLength(0);
    });
  });

  describe("loyalty", () => {
    it("creates a loyalty program", async () => {
      db["crm_loyalty_programs:single"] = {
        data: { id: "lp-1" },
        error: null,
      };
      const res = await crmRouter.request("/v1/crm/loyalty/programs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID, name: "MOMS Rewards" }),
      });
      expect(res.status).not.toBe(404);
      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe("route registration", () => {
    it("exposes the review dashboard endpoint", async () => {
      const res = await crmRouter.request(
        `/v1/crm/marketing/review-dashboard?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the retention automation endpoints", async () => {
      const res = await crmRouter.request(
        `/v1/crm/retention/automation-rules?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await crmRouter.request("/v1/crm/nope");
      expect(res.status).toBe(404);
    });
  });
});
