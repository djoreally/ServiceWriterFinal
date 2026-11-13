/**
 * Grey-box contract tests for GET /v1/service-records/:id/detail-full
 * (Item #9 Step 2 — service-record detail heal).
 *
 * History pinned here: the endpoint was registered TWICE (vehicles.ts,
 * mounted first, served; work-orders.ts, shadowed). Both copies embedded
 * `service_catalog(name,description,estimated_duration)` on
 * appointment_items — but the live service_catalog column is
 * `estimated_minutes` (Step 8 schema translation), so PostgREST rejected
 * the embed (42703) and EVERY appointment-linked record's detail read
 * threw → the client reported "Service not found" for records that exist
 * (verified live Nov 10, 20:53 EST: Cody d464f9e0 + Angela f08b17f3 both
 * bounced while visible in the Services list).
 *
 * The work-orders registration is now the single survivor (CHAIR-2),
 * with requireWorkspaceAuth + id validation ported from the deleted
 * serving copy, the embed reading `estimated_minutes`, and the bundle
 * renaming it to the client's `estimated_duration` field.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
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
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const router = testRouter(workOrdersRouterRaw);

const SERVICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";
const VEHICLE_ID = "aa0e8400-e29b-41d4-a716-446655440002";
const APPOINTMENT_ID = "aa0e8400-e29b-41d4-a716-446655440003";
const CATALOG_ID = "aa0e8400-e29b-41d4-a716-446655440004";

const url = (id: string = SERVICE_ID, ws: string = WS_ID) =>
  `/v1/service-records/${id}/detail-full?workspace_id=${ws}`;

function seedHappyPath() {
  db["service_records:single"] = {
    data: {
      id: SERVICE_ID,
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      vehicle_id: VEHICLE_ID,
      appointment_id: APPOINTMENT_ID,
      status: "completed",
      work_performed: "Full synthetic oil change",
      metadata: {},
      created_at: "2026-11-10T16:42:01Z",
      updated_at: "2026-11-10T16:42:01Z",
    },
    error: null,
  };
  db["customers:single"] = {
    data: { id: CUSTOMER_ID, first_name: "Cody", last_name: "Glenn", email: "cody@example.com" },
    error: null,
  };
  db["vehicles:single"] = {
    data: { id: VEHICLE_ID, year: 2018, make: "Toyota", model: "Corolla" },
    error: null,
  };
  db["service_record_line_items"] = {
    data: [
      {
        id: "aa0e8400-e29b-41d4-a716-446655440005",
        item_type: "labor",
        description: "Oil change labor",
        quantity: 1,
        unit_price: 119,
        total_price: 119,
        labor_hours: 1,
        labor_rate: 119,
        metadata: {},
        created_at: "2026-11-10T16:42:01Z",
      },
    ],
    error: null,
  };
  db["workspace_settings:single"] = { data: { email: "shop@example.com" }, error: null };
  db["workspaces:single"] = { data: { name: "MOMS Mobile Oil Change" }, error: null };
  db["appointments:single"] = {
    data: {
      id: APPOINTMENT_ID,
      customer_id: CUSTOMER_ID,
      vehicle_id: VEHICLE_ID,
      metadata: {},
      notes: null,
      starts_at: "2026-11-10T14:00:00Z",
    },
    error: null,
  };
  db["vehicle_service_specs:single"] = {
    data: { engine: "1.8L", oil_type: "0W-20", oil_capacity: "4.4", oil_filter: "OF-1", metadata: {} },
    error: null,
  };
  // The canned row carries the LIVE catalog shape: estimated_minutes.
  db["appointment_items"] = {
    data: [
      {
        service_catalog_id: CATALOG_ID,
        description: "Full Synthetic Oil Change",
        quantity: 1,
        unit_price: 119,
        service_catalog: {
          name: "Full Synthetic Oil Change",
          description: "Full synthetic oil and filter",
          estimated_minutes: 45,
        },
      },
    ],
    error: null,
  };
}

beforeEach(() => {
  resetHarness();
});

describe("GET /v1/service-records/:id/detail-full", () => {
  it("returns the pinned bundle shape for an existing record", async () => {
    seedHappyPath();
    const res = await router.request(url());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.data).sort()).toEqual(
      [
        "appointment",
        "customer",
        "fallback_customer",
        "first_appointment_item",
        "line_items",
        "service",
        "vehicle",
        "vehicle_specs",
        "workspace_email",
        "workspace_name",
      ].sort(),
    );
    expect(body.data.service.id).toBe(SERVICE_ID);
    expect(body.data.customer.id).toBe(CUSTOMER_ID);
    expect(body.data.vehicle.id).toBe(VEHICLE_ID);
    expect(body.data.line_items).toHaveLength(1);
    expect(body.data.workspace_email).toBe("shop@example.com");
    expect(body.data.workspace_name).toBe("MOMS Mobile Oil Change");
    expect(body.data.appointment.id).toBe(APPOINTMENT_ID);
    expect(body.data.fallback_customer).toBeNull();
    expect(body.data.vehicle_specs.oil_type).toBe("0W-20");
  });

  it("renames the catalog embed's estimated_minutes to the bundle's estimated_duration", async () => {
    seedHappyPath();
    const res = await router.request(url());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.first_appointment_item.service_catalog).toEqual({
      name: "Full Synthetic Oil Change",
      description: "Full synthetic oil and filter",
      estimated_duration: 45,
    });
    expect(body.data.first_appointment_item.service_catalog).not.toHaveProperty("estimated_minutes");
    expect(body.data.first_appointment_item.service_catalog_id).toBe(CATALOG_ID);
  });

  it("negative control: a missing record returns 200 { data: null }, not a 500", async () => {
    db["service_records:single"] = { data: null, error: null };
    const res = await router.request(url());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("propagates a failing sub-read leg through the error contract instead of masking it", async () => {
    seedHappyPath();
    // The shape of the original break: PostgREST rejecting the catalog
    // embed surfaces as a thrown error, and the endpoint must 500 —
    // never answer as if the record were missing.
    db["appointment_items"] = {
      data: null,
      // A real PostgREST error carries a SQLSTATE code and no HTTP
      // status, so errorResponse lands it in the 500 internal_error
      // class — the class the Nov 10 42703 sat in, per src/server/api.ts.
      error: Object.assign(
        new Error("column service_catalog.estimated_duration does not exist"),
        { code: "42703" },
      ),
    };
    const res = await router.request(url());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.data).toBeUndefined();
  });

  it("returns 401 unauthenticated", async () => {
    authState.mode = "unauthorized";
    const res = await router.request(url());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-member workspace (workspace auth ported from the deleted serving copy)", async () => {
    // The shadowed work-orders copy used bare requireAuth, under which a
    // signed-in non-member would have been served the bundle. The
    // survivor enforces workspace membership like the copy that served.
    authState.mode = "forbidden";
    const res = await router.request(url());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  it("rejects a malformed workspace_id with 400, never 500", async () => {
    const res = await router.request(url(SERVICE_ID, "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed service id with 400, never 500", async () => {
    const res = await router.request(url("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

describe("detail-full registration + embed source pins", () => {
  const workOrdersSource = readFileSync(
    join(process.cwd(), "src/server/hono/routes/work-orders.ts"),
    "utf8",
  );
  const vehiclesSource = readFileSync(
    join(process.cwd(), "src/server/hono/routes/vehicles.ts"),
    "utf8",
  );
  const handlerStart = workOrdersSource.indexOf(
    '"/v1/service-records/:id/detail-full"',
  );
  const handler = workOrdersSource.slice(
    handlerStart,
    workOrdersSource.indexOf("workOrdersRouter.", handlerStart + 1),
  );

  it("is registered exactly once, on the work-orders router", () => {
    expect(handlerStart).toBeGreaterThan(-1);
    expect(
      workOrdersSource.match(
        /workOrdersRouter\.get\("\/v1\/service-records\/:id\/detail-full"/g,
      ),
    ).toHaveLength(1);
  });

  it("has no registration left on the vehicles router", () => {
    expect(vehiclesSource).not.toContain("detail-full");
  });

  it("enforces workspace auth in the surviving handler", () => {
    expect(handler).toContain("requireWorkspaceAuth");
  });

  it("embeds the live estimated_minutes column, never the phantom estimated_duration", () => {
    const itemsFrom = handler.indexOf('.from("appointment_items")');
    expect(itemsFrom).toBeGreaterThan(-1);
    const selectStart = handler.indexOf('.select("', itemsFrom);
    const selectEnd = handler.indexOf('")', selectStart);
    const select = handler.slice(selectStart, selectEnd);
    expect(select).toContain("estimated_minutes");
    expect(select).not.toContain("estimated_duration");
  });
});
