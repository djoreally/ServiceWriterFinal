import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));

import * as api from "@/server/api";
import { GET as customersGet, POST as customersPost } from "../../../../app/api/v1/customers/route";
import {
  GET as customerGet,
  PATCH as customerPatch,
  DELETE as customerDelete,
} from "../../../../app/api/v1/customers/[id]/route";
import { GET as customerSummaryGet } from "../../../../app/api/v1/customers/[id]/summary/route";
import { GET as vehiclesGet, POST as vehiclesPost } from "../../../../app/api/v1/vehicles/route";
import {
  GET as vehicleGet,
  PATCH as vehiclePatch,
  DELETE as vehicleDelete,
} from "../../../../app/api/v1/vehicles/[id]/route";
import { GET as vehicleSummaryGet } from "../../../../app/api/v1/vehicles/[id]/summary/route";
import { GET as serviceRecordsGet, POST as serviceRecordsPost } from "../../../../app/api/v1/service-records/route";
import {
  GET as serviceRecordGet,
  PATCH as serviceRecordPatch,
  DELETE as serviceRecordDelete,
} from "../../../../app/api/v1/service-records/[id]/route";
import {
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  WS_ID,
  APPOINTMENT_ID,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";
const SERVICE_RECORD_ID = "66666666-6666-4666-8666-666666666666";

// The shared builder stub does not implement .or(); add it for the customer
// search path.
function withOr(client: MockSupabaseClient): MockSupabaseClient {
  const origFrom = client.from;
  client.from = jest.fn((table: string) => {
    const builder = origFrom(table) as unknown as Record<string, unknown>;
    if (typeof builder.or !== "function") builder.or = jest.fn(() => builder);
    return builder;
  }) as unknown as MockSupabaseClient["from"];
  return client;
}

describe("customers/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(await customersGet(makeRequest(`/api/v1/customers?workspace_id=${WS_ID}`)));
      expect(status).toBe(401);
    });

    it("returns 400 missing_workspace when workspace_id is absent", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status, body } = await readJson(await customersGet(makeRequest("/api/v1/customers")));
      expect(status).toBe(400);
      expect(body.error.code).toBe("missing_workspace");
    });

    it("returns 200 with paginated customers", async () => {
      const supabase = makeSupabaseClient({ customers: { data: [{ id: CUSTOMER_ID }], error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customersGet(makeRequest(`/api/v1/customers?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toEqual({ limit: 25, offset: 0 });
    });

    it("applies the search filter when provided", async () => {
      const supabase = withOr(
        makeSupabaseClient({ customers: { data: [{ id: CUSTOMER_ID, first_name: "Ava" }], error: null } }),
      );
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customersGet(makeRequest(`/api/v1/customers?workspace_id=${WS_ID}&search=ava`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
    });
  });

  describe("POST", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await customersPost(
          makeRequest("/api/v1/customers", {
            method: "POST",
            body: { workspace_id: WS_ID, first_name: "Ava" },
          }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status, body } = await readJson(
        await customersPost(makeRequest("/api/v1/customers", { method: "POST", body: { workspace_id: WS_ID } })),
      );
      expect(status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });

    it("returns 201 with the created customer", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, first_name: "Ava", last_name: "Roe" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customersPost(
          makeRequest("/api/v1/customers", {
            method: "POST",
            body: { workspace_id: WS_ID, first_name: "Ava", last_name: "Roe" },
          }),
        ),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(CUSTOMER_ID);
      expect(body.data.first_name).toBe("Ava");
    });
  });
});

describe("customers/[id]/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await customerGet(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await customerGet(
          makeRequest(`/api/v1/customers/nope?workspace_id=${WS_ID}`),
          contextWithParams({ id: "nope" }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the customer", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, first_name: "Ava" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customerGet(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(CUSTOMER_ID);
    });
  });

  describe("PATCH", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await customerPatch(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, first_name: "Ava" },
          }),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body has no updatable fields", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await customerPatch(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID },
          }),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the updated customer", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, first_name: "Ava" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customerPatch(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, first_name: "Ava" },
          }),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.first_name).toBe("Ava");
    });
  });

  describe("DELETE", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await customerDelete(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await customerDelete(
          makeRequest(`/api/v1/customers/nope?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: "nope" }),
        ),
      );
      expect(status).toBe(500);
    });

    it("archives the customer (soft delete)", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, status: "archived" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customerDelete(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.status).toBe("archived");
    });
  });
});

describe("customers/[id]/summary/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await customerSummaryGet(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the customer is not found", async () => {
      const supabase = makeSupabaseClient({ customers: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await customerSummaryGet(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the customer and related collections", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID, first_name: "Ava" }, error: null },
        vehicles: { data: [{ id: VEHICLE_ID }], error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await customerSummaryGet(
          makeRequest(`/api/v1/customers/${CUSTOMER_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: CUSTOMER_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.customer.id).toBe(CUSTOMER_ID);
      expect(body.data.vehicles).toHaveLength(1);
      expect(body.data.service_records).toEqual([]);
      expect(body.data.quotes).toEqual([]);
      expect(body.data.appointments).toEqual([]);
      expect(body.data.payments).toEqual([]);
    });
  });
});

describe("vehicles/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(await vehiclesGet(makeRequest(`/api/v1/vehicles?workspace_id=${WS_ID}`)));
      expect(status).toBe(401);
    });

    it("returns 500 when workspace_id is missing (route throws before auth)", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(await vehiclesGet(makeRequest("/api/v1/vehicles")));
      expect(status).toBe(500);
    });

    it("filters out archived vehicles and reports pagination from visible rows", async () => {
      const supabase = makeSupabaseClient({
        vehicles: {
          data: [
            { id: VEHICLE_ID, metadata: {} },
            { id: "archived-vehicle", metadata: { archived_at: "2026-01-01T00:00:00.000Z" } },
          ],
          error: null,
        },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehiclesGet(makeRequest(`/api/v1/vehicles?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(VEHICLE_ID);
      expect(body.pagination).toEqual({ limit: 1, offset: 0 });
    });

    it("applies explicit limit/offset pagination", async () => {
      const supabase = makeSupabaseClient({ vehicles: { data: [{ id: VEHICLE_ID, metadata: {} }], error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehiclesGet(makeRequest(`/api/v1/vehicles?workspace_id=${WS_ID}&limit=5&offset=10`)),
      );
      expect(status).toBe(200);
      expect(body.pagination).toEqual({ limit: 5, offset: 10 });
    });
  });

  describe("POST", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await vehiclesPost(
          makeRequest("/api/v1/vehicles", { method: "POST", body: { workspace_id: WS_ID, make: "Honda" } }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await vehiclesPost(makeRequest("/api/v1/vehicles", { method: "POST", body: {} })),
      );
      expect(status).toBe(500);
    });

    it("returns 500 when the customer does not belong to the workspace", async () => {
      const supabase = makeSupabaseClient({ customers: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await vehiclesPost(
          makeRequest("/api/v1/vehicles", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, make: "Honda" },
          }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 201 with the created vehicle", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, make: "Honda", model: "Civic" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehiclesPost(
          makeRequest("/api/v1/vehicles", {
            method: "POST",
            body: { workspace_id: WS_ID, make: "Honda", model: "Civic", year: 2020 },
          }),
        ),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(VEHICLE_ID);
    });

    it("upserts service specs when engine details are provided", async () => {
      const supabase = makeSupabaseClient({
        customers: { data: { id: CUSTOMER_ID }, error: null },
        vehicles: { data: { id: VEHICLE_ID, make: "Honda" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehiclesPost(
          makeRequest("/api/v1/vehicles", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, make: "Honda", engine: "2.0L", oil_type: "0W-20" },
          }),
        ),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(VEHICLE_ID);
      expect(supabase.from).toHaveBeenCalledWith("vehicle_service_specs");
    });
  });
});

describe("vehicles/[id]/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await vehicleGet(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await vehicleGet(
          makeRequest(`/api/v1/vehicles/nope?workspace_id=${WS_ID}`),
          contextWithParams({ id: "nope" }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the vehicle", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, make: "Honda" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehicleGet(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(VEHICLE_ID);
    });
  });

  describe("PATCH", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await vehiclePatch(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, make: "Toyota" },
          }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body has no updatable fields", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await vehiclePatch(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID },
          }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the updated vehicle", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, make: "Toyota" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehiclePatch(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, make: "Toyota" },
          }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.make).toBe("Toyota");
    });

    it("merges odometer_measure into existing metadata", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, metadata: { source: "dmv" } }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await vehiclePatch(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, odometer_measure: "actual" },
          }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(200);
      const updateCall = (supabase.from as jest.Mock).mock.calls.filter(([t]) => t === "vehicles");
      expect(updateCall.length).toBeGreaterThan(0);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await vehicleDelete(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the vehicle is not found", async () => {
      const supabase = makeSupabaseClient({ vehicles: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await vehicleDelete(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("archives the vehicle via metadata (soft delete)", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, metadata: { archived_at: "2026-09-22T12:00:00.000Z" } }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehicleDelete(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.metadata.archived_at).toBeDefined();
    });
  });
});

describe("vehicles/[id]/summary/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await vehicleSummaryGet(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the vehicle is not found", async () => {
      const supabase = makeSupabaseClient({ vehicles: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await vehicleSummaryGet(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the vehicle and related collections", async () => {
      const supabase = makeSupabaseClient({
        vehicles: { data: { id: VEHICLE_ID, make: "Honda" }, error: null },
        service_records: { data: [{ id: SERVICE_RECORD_ID }], error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await vehicleSummaryGet(
          makeRequest(`/api/v1/vehicles/${VEHICLE_ID}/summary?workspace_id=${WS_ID}`),
          contextWithParams({ id: VEHICLE_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.vehicle.id).toBe(VEHICLE_ID);
      expect(body.data.service_records).toHaveLength(1);
      expect(body.data.appointments).toEqual([]);
      expect(body.data.work_orders).toEqual([]);
      expect(body.data.invoices).toEqual([]);
    });
  });
});

describe("service-records/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await serviceRecordsGet(makeRequest(`/api/v1/service-records?workspace_id=${WS_ID}`)),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when workspace_id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(await serviceRecordsGet(makeRequest("/api/v1/service-records")));
      expect(status).toBe(500);
    });

    it("returns 200 with paginated service records", async () => {
      const supabase = makeSupabaseClient({
        service_records: { data: [{ id: SERVICE_RECORD_ID }], error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsGet(makeRequest(`/api/v1/service-records?workspace_id=${WS_ID}`)),
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
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, work_performed: "Oil change" },
          }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await serviceRecordsPost(makeRequest("/api/v1/service-records", { method: "POST", body: {} })),
      );
      expect(status).toBe(500);
    });

    it("returns 400 discount_exceeds_subtotal when the discount is too large", async () => {
      const supabase = makeSupabaseClient();
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, subtotal: 10, discount_amount: 20 },
          }),
        ),
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe("discount_exceeds_subtotal");
    });

    it("returns 400 financial_math_mismatch when totals do not add up", async () => {
      const supabase = makeSupabaseClient();
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, subtotal: 100, tax_amount: 10, total_amount: 50 },
          }),
        ),
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe("financial_math_mismatch");
    });

    it("returns 409 customer_not_found when the customer is not in the workspace", async () => {
      const supabase = makeSupabaseClient({ customers: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID },
          }),
        ),
      );
      expect(status).toBe(409);
      expect(body.error.code).toBe("customer_not_found");
    });

    it("returns 201 with the created service record", async () => {
      const supabase = makeSupabaseClient({
        service_records: { data: { id: SERVICE_RECORD_ID, work_performed: "Oil change" }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, work_performed: "Oil change" },
          }),
        ),
      );
      expect(status).toBe(201);
      expect(body.data.id).toBe(SERVICE_RECORD_ID);
    });

    it("reuses the existing record for the same appointment", async () => {
      const supabase = makeSupabaseClient({
        appointments: { data: { id: APPOINTMENT_ID, customer_id: null, vehicle_id: null }, error: null },
        service_records: { data: { id: SERVICE_RECORD_ID, metadata: {} }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordsPost(
          makeRequest("/api/v1/service-records", {
            method: "POST",
            body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, work_performed: "Oil change" },
          }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(SERVICE_RECORD_ID);
      expect(body.reused).toBe(true);
    });
  });
});

describe("service-records/[id]/route", () => {
  describe("GET", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await serviceRecordGet(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the id is not a uuid", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await serviceRecordGet(
          makeRequest(`/api/v1/service-records/nope?workspace_id=${WS_ID}`),
          contextWithParams({ id: "nope" }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 200 with the service record", async () => {
      const supabase = makeSupabaseClient({
        service_records: { data: { id: SERVICE_RECORD_ID }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordGet(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}?workspace_id=${WS_ID}`),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(SERVICE_RECORD_ID);
    });
  });

  describe("PATCH", () => {
    const currentRecord = () => ({
      id: SERVICE_RECORD_ID,
      customer_id: null,
      vehicle_id: null,
      work_order_id: null,
      quote_id: null,
      technician_id: null,
      subtotal: 100,
      tax_amount: 10,
      discount_amount: 0,
      total_amount: 110,
      status: "draft",
      metadata: {},
    });

    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await serviceRecordPatch(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, work_performed: "x" },
          }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the body fails zod validation", async () => {
      stubWorkspaceMember(api, makeSupabaseClient());
      const { status } = await readJson(
        await serviceRecordPatch(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}`, {
            method: "PATCH",
            body: {},
          }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("returns 400 discount_exceeds_subtotal when the discount is too large", async () => {
      const supabase = makeSupabaseClient({ service_records: { data: currentRecord(), error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordPatch(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, discount_amount: 200 },
          }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe("discount_exceeds_subtotal");
    });

    it("returns 200 with the updated service record", async () => {
      const supabase = makeSupabaseClient({ service_records: { data: currentRecord(), error: null } });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordPatch(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, work_performed: "Oil change" },
          }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.id).toBe(SERVICE_RECORD_ID);
    });

    it("stamps completed_by/completed_at when status becomes completed", async () => {
      const supabase = makeSupabaseClient({ service_records: { data: currentRecord(), error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await serviceRecordPatch(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}`, {
            method: "PATCH",
            body: { workspace_id: WS_ID, status: "completed" },
          }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(200);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when workspace membership check fails", async () => {
      stubWorkspaceMemberReject(api);
      const { status } = await readJson(
        await serviceRecordDelete(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(401);
    });

    it("returns 500 when the service record is not found", async () => {
      const supabase = makeSupabaseClient({ service_records: { data: null, error: null } });
      stubWorkspaceMember(api, supabase);
      const { status } = await readJson(
        await serviceRecordDelete(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(500);
    });

    it("voids the service record (soft delete)", async () => {
      const supabase = makeSupabaseClient({
        service_records: { data: { id: SERVICE_RECORD_ID, status: "voided", metadata: {} }, error: null },
      });
      stubWorkspaceMember(api, supabase);
      const { status, body } = await readJson(
        await serviceRecordDelete(
          makeRequest(`/api/v1/service-records/${SERVICE_RECORD_ID}?workspace_id=${WS_ID}`, { method: "DELETE" }),
          contextWithParams({ id: SERVICE_RECORD_ID }),
        ),
      );
      expect(status).toBe(200);
      expect(body.data.status).toBe("voided");
    });
  });
});
