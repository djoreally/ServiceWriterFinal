/**
 * Grey-box tests for the Service Menu Hono router.
 * Drives the router over HTTP via `serviceMenuRouter.request()` with the
 * Supabase layer mocked — no network. Mirrors catalog.test.ts.
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

import { serviceMenuRouter as serviceMenuRouterRaw } from "@/server/hono/routes/service-menu";
import { testRouter } from "../test-support/routerTest";

const serviceMenuRouter = testRouter(serviceMenuRouterRaw);
import {
  authState,
  db,
  resetHarness,
  WS_ID,
} from "../test-support/state";

const OIL_ID = "880e8400-e29b-41d4-a716-446655440010";
const ITEM_ID = "880e8400-e29b-41d4-a716-446655440011";

function seedEnabledMenu() {
  db.service_menus = {
    data: {
      workspace_id: WS_ID,
      enabled: true,
      headline: "We come to you",
      hero_package_id: null,
      hero_label: null,
    },
    error: null,
  };
  db.service_menu_items = {
    data: [
      {
        id: ITEM_ID,
        workspace_id: WS_ID,
        service_catalog_id: OIL_ID,
        package_id: null,
        role: "core",
        is_most_popular: false,
        with_service_price: null,
        display_name: null,
        is_draft: false,
        sort_order: 10,
      },
    ],
    error: null,
  };
  db.service_catalog = {
    data: [
      {
        id: OIL_ID,
        name: "Full Synthetic Oil Change",
        description: null,
        labor_price: 119,
        estimated_minutes: 45,
        is_active: true,
      },
    ],
    error: null,
  };
  db.service_packages = { data: [], error: null };
}

beforeEach(() => {
  resetHarness();
});

describe("service-menu router", () => {
  describe("GET /v1/service-menu", () => {
    it("returns 401 unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await serviceMenuRouter.request(
        `/v1/service-menu?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });

    it("resolves the menu from catalog prices for a workspace member", async () => {
      seedEnabledMenu();
      const res = await serviceMenuRouter.request(
        `/v1/service-menu?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.settings.enabled).toBe(true);
      expect(body.data.menu.core).toHaveLength(1);
      expect(body.data.menu.core[0].price).toBe(119);
    });
  });

  describe("GET /v1/public/service-menu", () => {
    it("returns 404 for an unknown booking slug", async () => {
      db["workspaces:single"] = { data: null, error: null };
      const res = await serviceMenuRouter.request(
        "/v1/public/service-menu?slug=nope",
      );
      expect(res.status).toBe(404);
    });

    it("returns data:null when the shop has not enabled a menu", async () => {
      db["workspaces:single"] = { data: { id: WS_ID }, error: null };
      db.service_menus = {
        data: { workspace_id: WS_ID, enabled: false, headline: null, hero_package_id: null, hero_label: null },
        error: null,
      };
      db.service_menu_items = { data: [], error: null };
      db.service_catalog = { data: [], error: null };
      db.service_packages = { data: [], error: null };
      const res = await serviceMenuRouter.request(
        "/v1/public/service-menu?slug=moms",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeNull();
    });

    it("returns the resolved menu when enabled", async () => {
      db["workspaces:single"] = { data: { id: WS_ID }, error: null };
      seedEnabledMenu();
      const res = await serviceMenuRouter.request(
        "/v1/public/service-menu?slug=moms",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.core[0].price).toBe(119);
      // Booking-selection target id rides along so menu clicks can select
      // the real catalog service on the booking surface.
      expect(body.data.core[0].serviceCatalogId).toBe(OIL_ID);
    });
  });

  describe("POST /v1/service-menu/items", () => {
    it("rejects a service that is not in the workspace catalog", async () => {
      db["service_catalog:single"] = { data: null, error: null };
      const res = await serviceMenuRouter.request("/v1/service-menu/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: WS_ID,
          item: { role: "core", service_catalog_id: OIL_ID },
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /v1/service-menu/apply-template", () => {
    it("rejects an unknown template id", async () => {
      const res = await serviceMenuRouter.request(
        "/v1/service-menu/apply-template",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, template_id: "nope" }),
        },
      );
      expect(res.status).toBe(400);
    });
  });
});
