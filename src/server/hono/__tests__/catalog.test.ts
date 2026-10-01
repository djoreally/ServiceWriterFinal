/**
 * Grey-box tests for the catalog Hono router (service_catalog CRUD).
 * Drives the router over HTTP via `catalogRouter.request()` with the
 * Supabase layer mocked — no network.
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

import { catalogRouter as catalogRouterRaw } from "@/server/hono/routes/catalog";
import { testRouter } from "../test-support/routerTest";

const catalogRouter = testRouter(catalogRouterRaw);
import {
  authState,
  calls,
  db,
  resetHarness,
  WS_ID,
} from "../test-support/state";

const ITEM_ID = "880e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  resetHarness();
});

describe("catalog router", () => {
  describe("GET /v1/catalog/items", () => {
    it("returns 200 with the item list for an authorized member", async () => {
      db.service_catalog = {
        data: [{ id: ITEM_ID, name: "Oil Change", labor_price: 49.99 }],
        error: null,
      };
      const res = await catalogRouter.request(
        `/v1/catalog/items?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Oil Change");
    });

    it("returns 401 unauthenticated without credentials", async () => {
      authState.mode = "unauthorized";
      const res = await catalogRouter.request(
        `/v1/catalog/items?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("unauthenticated");
      expect(body.error.message).toBeTruthy();
    });

    it("returns 403 for a non-member workspace", async () => {
      authState.mode = "forbidden";
      const res = await catalogRouter.request(
        `/v1/catalog/items?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("forbidden");
    });

    it("rejects a malformed workspace_id", async () => {
      const res = await catalogRouter.request(
        `/v1/catalog/items?workspace_id=not-a-uuid`,
      );
      // Grey-box note: the router parses the query param with zod before
      // auth; the app-level onError has no ZodError special-case, so this
      // surfaces as 500 internal_error rather than a 400.
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("internal_error");
    });

    it("propagates database errors through the error contract", async () => {
      // Faithful to postgrest-js: real DB errors are Error instances
      // (PostgrestError extends Error), so they reach the app onError.
      const dbError = Object.assign(new Error("db exploded"), {
        code: "XX000",
        status: 500,
      });
      db.service_catalog = { data: null, error: dbError };
      const res = await catalogRouter.request(
        `/v1/catalog/items?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("XX000");
      expect(body.error.message).toBe("db exploded");
    });
  });

  describe("GET /v1/catalog/items/:id", () => {
    it("returns the single row", async () => {
      db["service_catalog:single"] = {
        data: { id: ITEM_ID, name: "Brake Pads" },
        error: null,
      };
      const res = await catalogRouter.request(
        `/v1/catalog/items/${ITEM_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Brake Pads");
    });

    it("returns null data when the row does not exist", async () => {
      db["service_catalog:single"] = { data: null, error: null };
      const res = await catalogRouter.request(
        `/v1/catalog/items/${ITEM_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toBeNull();
    });
  });

  describe("POST /v1/catalog/items", () => {
    const payload = {
      workspace_id: WS_ID,
      rows: [{ name: "Tire Rotation", labor_price: 25 }],
    };

    it("inserts rows and returns 201", async () => {
      db["service_catalog:single"] = { data: null, error: null };
      // insert().select() resolves the thenable (table) result
      db.service_catalog = { data: [{ id: ITEM_ID, name: "Tire Rotation" }], error: null };
      const res = await catalogRouter.request("/v1/catalog/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data[0].name).toBe("Tire Rotation");
      expect(calls.inserts).toHaveLength(1);
      expect(calls.inserts[0].table).toBe("service_catalog");
      const inserted = calls.inserts[0].rows as Array<Record<string, unknown>>;
      expect(inserted[0].workspace_id).toBe(WS_ID);
    });

    it("requires authentication", async () => {
      authState.mode = "unauthorized";
      const res = await catalogRouter.request("/v1/catalog/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(401);
    });

    it("rejects an empty rows array", async () => {
      const res = await catalogRouter.request("/v1/catalog/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID, rows: [] }),
      });
      // zod min(1) violation -> ZodError -> app onError -> 500 internal_error
      expect(res.status).toBe(500);
      expect(calls.inserts).toHaveLength(0);
    });
  });

  describe("PATCH /v1/catalog/items/:id", () => {
    it("applies a partial update and returns 200", async () => {
      db["service_catalog:single"] = {
        data: [{ id: ITEM_ID, name: "Oil Change Plus" }],
        error: null,
      };
      const res = await catalogRouter.request(`/v1/catalog/items/${ITEM_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: WS_ID,
          row: { name: "Oil Change Plus" },
        }),
      });
      expect(res.status).toBe(200);
      expect(calls.updates).toHaveLength(1);
      expect(calls.updates[0].table).toBe("service_catalog");
      expect(
        (calls.updates[0].patch as Record<string, unknown>).name,
      ).toBe("Oil Change Plus");
    });
  });

  describe("DELETE /v1/catalog/items/:id", () => {
    it("deletes the row and returns 200", async () => {
      const res = await catalogRouter.request(
        `/v1/catalog/items/${ITEM_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
    });

    it("requires authentication", async () => {
      authState.mode = "unauthorized";
      const res = await catalogRouter.request(
        `/v1/catalog/items/${ITEM_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(401);
    });
  });

  describe("route registration", () => {
    it("returns 404 for an unregistered method on a known path", async () => {
      const res = await catalogRouter.request("/v1/catalog/items", {
        method: "PUT",
      });
      // Hono has no 405 handling here; unknown method+path -> 404.
      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown path", async () => {
      const res = await catalogRouter.request("/v1/catalog/nope");
      expect(res.status).toBe(404);
    });
  });
});
