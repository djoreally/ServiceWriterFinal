/**
 * SW-42 / SW-49 — partial updates must never erase data they do not mention.
 *
 * These tests run the REAL route handlers against a stateful in-memory
 * Supabase fake: `.update(patch)` applies the patch to the stored rows the
 * way Postgres does — only the columns present in the payload are written —
 * after a JSON round-trip that models the supabase-js -> PostgREST wire
 * (keys holding `undefined` never cross it). Assertions then read the
 * stored row back, so a handler that manufactures null/0 values for fields
 * the caller never sent fails here even though every individual mock call
 * "looked fine".
 *
 * Covered:
 * - POST /v1/service-records duplicate-create (reuse) path — the violation:
 *   a minimal re-POST used to rewrite the stored record's financials from
 *   the new request's (absent) inputs.
 * - PATCH /v1/customers/[id] — the known-safe control: zod-parsed spread,
 *   plus the preserved contract that an explicit null clears.
 */
import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));

import * as api from "@/server/api";
import { POST as serviceRecordsPost } from "../../../../app/api/v1/service-records/route";
import { PATCH as customerPatch } from "../../../../app/api/v1/customers/[id]/route";
import {
  makeRequest,
  readJson,
  contextWithParams,
  stubWorkspaceMember,
  WS_ID,
  USER_ID,
} from "../../../test/api-routes/helpers";

type Row = Record<string, unknown>;

const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const APPOINTMENT_2_ID = "33333333-3333-4333-8333-333333333334";
const RECORD_ID = "66666666-6666-4666-8666-666666666666";

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

/**
 * Stateful fake: tables hold real rows; update/insert mutate them with
 * wire semantics. Only the query-builder surface the routes under test use
 * is implemented.
 */
function makeStatefulSupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }

  function from(table: string) {
    let mode: "read" | "update" | "insert" = "read";
    let patch: Row | null = null;
    let insertRow: Row | null = null;
    const filters: Array<(row: Row) => boolean> = [];
    const matched = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const execute = (): Row[] => {
      if (mode === "update" && patch) {
        const rows = matched();
        for (const row of rows) Object.assign(row, wire(patch));
        return rows;
      }
      if (mode === "insert" && insertRow) {
        const row = wire(insertRow);
        (tables[table] ??= []).push(row);
        return [row];
      }
      return matched();
    };
    const builder: Record<string, unknown> = {};
    const chain = (name: string, apply?: (...args: never[]) => void) => {
      builder[name] = jest.fn((...args: never[]) => {
        apply?.(...args);
        return builder;
      });
    };
    chain("select");
    chain("eq", (col: string, val: unknown) => filters.push((row) => row[col] === val));
    chain("neq", (col: string, val: unknown) => filters.push((row) => row[col] !== val));
    chain("is");
    chain("in");
    chain("not");
    chain("ilike");
    chain("contains");
    chain("order");
    chain("limit");
    chain("range");
    builder.update = jest.fn((value: Row) => {
      mode = "update";
      patch = value;
      return builder;
    });
    builder.insert = jest.fn((value: Row) => {
      mode = "insert";
      insertRow = value;
      return builder;
    });
    builder.single = jest.fn(async () => {
      const rows = execute();
      return rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "Row not found", code: "PGRST116" } };
    });
    builder.maybeSingle = jest.fn(async () => {
      const rows = execute();
      return { data: rows[0] ?? null, error: null };
    });
    builder.then = (resolve: (value: { data: Row[]; error: null }) => void) =>
      resolve({ data: execute(), error: null });
    return builder;
  }

  const client = {
    from,
    rpc: jest.fn(async () => ({ data: null, error: null })),
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
  };
  return { client, tables };
}

function seedServiceRecords() {
  return makeStatefulSupabase({
    appointments: [
      { id: APPOINTMENT_ID, workspace_id: WS_ID, customer_id: CUSTOMER_ID, vehicle_id: VEHICLE_ID },
      { id: APPOINTMENT_2_ID, workspace_id: WS_ID, customer_id: CUSTOMER_ID, vehicle_id: VEHICLE_ID },
    ],
    customers: [{ id: CUSTOMER_ID, workspace_id: WS_ID, status: "active" }],
    vehicles: [{ id: VEHICLE_ID, workspace_id: WS_ID, customer_id: CUSTOMER_ID, status: "active" }],
    service_records: [
      {
        id: RECORD_ID,
        workspace_id: WS_ID,
        appointment_id: APPOINTMENT_ID,
        customer_id: CUSTOMER_ID,
        vehicle_id: VEHICLE_ID,
        status: "completed",
        complaint: "Grinding noise when braking",
        work_performed: "Full synthetic oil change",
        subtotal: 120,
        tax_rate: 8,
        tax_amount: 9.6,
        discount_amount: 0,
        total_amount: 129.6,
        completed_by: USER_ID,
        completed_at: "2026-11-10T15:00:00.000Z",
        metadata: { service_number: "SR-1001", labor_cost: 80 },
      },
    ],
  });
}

describe("POST /v1/service-records — duplicate create (reuse path)", () => {
  it("a minimal duplicate POST returns the record without rewriting stored fields", async () => {
    const { client, tables } = seedServiceRecords();
    stubWorkspaceMember(api, client as never);

    const { status, body } = await readJson(
      await serviceRecordsPost(
        makeRequest("/api/v1/service-records", {
          method: "POST",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    const stored = tables.service_records[0];
    // Financials the caller never mentioned survive untouched.
    expect(stored.subtotal).toBe(120);
    expect(stored.tax_rate).toBe(8);
    expect(stored.tax_amount).toBe(9.6);
    expect(stored.total_amount).toBe(129.6);
    // So do the narrative, linkage and completion fields.
    expect(stored.complaint).toBe("Grinding noise when braking");
    expect(stored.work_performed).toBe("Full synthetic oil change");
    expect(stored.customer_id).toBe(CUSTOMER_ID);
    expect(stored.vehicle_id).toBe(VEHICLE_ID);
    expect(stored.status).toBe("completed");
    expect(stored.completed_by).toBe(USER_ID);
    expect(stored.completed_at).toBe("2026-11-10T15:00:00.000Z");
    // Metadata keys the caller never mentioned survive the merge.
    expect((stored.metadata as Row).service_number).toBe("SR-1001");
    expect((stored.metadata as Row).labor_cost).toBe(80);
  });

  it("a duplicate POST that carries full financials still updates them", async () => {
    const { client, tables } = seedServiceRecords();
    stubWorkspaceMember(api, client as never);

    const { status, body } = await readJson(
      await serviceRecordsPost(
        makeRequest("/api/v1/service-records", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            appointment_id: APPOINTMENT_ID,
            subtotal: 200,
            tax_rate: 0,
            metadata: { labor_cost: 120, parts_cost: 80, shop_supplies: 0 },
          },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    const stored = tables.service_records[0];
    expect(stored.subtotal).toBe(200);
    expect(stored.tax_rate).toBe(0);
    expect(stored.tax_amount).toBe(0);
    expect(stored.total_amount).toBe(200);
    // Fields outside the financial picture are still untouched.
    expect(stored.complaint).toBe("Grinding noise when braking");
    expect(stored.completed_at).toBe("2026-11-10T15:00:00.000Z");
  });

  it("a duplicate POST carrying only a subtotal does not fabricate tax or total", async () => {
    const { client, tables } = seedServiceRecords();
    stubWorkspaceMember(api, client as never);

    const { status, body } = await readJson(
      await serviceRecordsPost(
        makeRequest("/api/v1/service-records", {
          method: "POST",
          body: { workspace_id: WS_ID, appointment_id: APPOINTMENT_ID, subtotal: 150 },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    const stored = tables.service_records[0];
    expect(stored.subtotal).toBe(150);
    // No tax/total inputs were sent, so the stored tax picture survives
    // instead of being overwritten with values derived from absent inputs.
    expect(stored.tax_rate).toBe(8);
    expect(stored.tax_amount).toBe(9.6);
    expect(stored.total_amount).toBe(129.6);
  });

  it("a first POST for a new appointment still inserts a full record", async () => {
    const { client, tables } = seedServiceRecords();
    stubWorkspaceMember(api, client as never);

    const { status } = await readJson(
      await serviceRecordsPost(
        makeRequest("/api/v1/service-records", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            appointment_id: APPOINTMENT_2_ID,
            work_performed: "Tire rotation",
            metadata: { labor_cost: 40, parts_cost: 0, shop_supplies: 0 },
          },
        }),
      ),
    );

    expect(status).toBe(201);
    expect(tables.service_records).toHaveLength(2);
    const inserted = tables.service_records[1];
    expect(inserted.appointment_id).toBe(APPOINTMENT_2_ID);
    expect(inserted.work_performed).toBe("Tire rotation");
    expect(inserted.subtotal).toBe(40);
  });
});

describe("PATCH /v1/customers/[id] — known-safe control", () => {
  function seedCustomers() {
    return makeStatefulSupabase({
      customers: [
        {
          id: CUSTOMER_ID,
          workspace_id: WS_ID,
          first_name: "Ava",
          last_name: "Roe",
          email: "ava@example.com",
          phone: "215-555-0100",
          address_line1: "12 Oak Street",
          city: "Ambler",
          notes: "Prefers text messages",
          status: "active",
        },
      ],
    });
  }

  it("a partial PATCH writes only the sent field", async () => {
    const { client, tables } = seedCustomers();
    stubWorkspaceMember(api, client as never);

    const { status } = await readJson(
      await customerPatch(
        makeRequest(`/api/v1/customers/${CUSTOMER_ID}`, {
          method: "PATCH",
          body: { workspace_id: WS_ID, phone: "215-555-0199" },
        }),
        contextWithParams({ id: CUSTOMER_ID }),
      ),
    );

    expect(status).toBe(200);
    const stored = tables.customers[0];
    expect(stored.phone).toBe("215-555-0199");
    expect(stored.email).toBe("ava@example.com");
    expect(stored.address_line1).toBe("12 Oak Street");
    expect(stored.notes).toBe("Prefers text messages");
    expect(stored.first_name).toBe("Ava");
  });

  it("an explicit null still clears the field (contract preserved)", async () => {
    const { client, tables } = seedCustomers();
    stubWorkspaceMember(api, client as never);

    const { status } = await readJson(
      await customerPatch(
        makeRequest(`/api/v1/customers/${CUSTOMER_ID}`, {
          method: "PATCH",
          body: { workspace_id: WS_ID, email: null },
        }),
        contextWithParams({ id: CUSTOMER_ID }),
      ),
    );

    expect(status).toBe(200);
    const stored = tables.customers[0];
    expect(stored.email).toBeNull();
    expect(stored.phone).toBe("215-555-0100");
  });
});
