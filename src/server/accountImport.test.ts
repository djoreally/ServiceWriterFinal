import type { SupabaseClient, User } from "@supabase/supabase-js";
// Must run before `@/server/api` (via accountImport) pulls in `next/server`,
// which subclasses the Request/Response globals at import time.
import "@/test/web-globals";
import { ApiError } from "@/server/api";
import {
  accountExportSchema,
  createImportBatch,
  executeImportBatch,
  rollbackImportBatch,
} from "@/server/accountImport";

type DbRow = Record<string, unknown>;
type Filter = { column: string; value: unknown };

/**
 * Minimal in-memory Supabase stand-in that understands the exact query-builder
 * chains used by accountImport.ts (select/insert/upsert/update/delete with
 * eq/limit/order and single/maybeSingle terminals, plus bare-awaited builders).
 */
class FakeDb {
  private tables = new Map<string, DbRow[]>();
  private seq = 0;
  readonly failInsertFor = new Set<string>();
  readonly calls = {
    inserted: [] as Array<{ table: string; row: DbRow }>,
    upserted: [] as Array<{ table: string; row: unknown }>,
    updated: [] as Array<{ table: string; payload: unknown; filters: Filter[] }>,
    deleted: [] as Array<{ table: string; filters: Filter[] }>,
  };

  rows(table: string): DbRow[] {
    const existing = this.tables.get(table);
    if (existing) return existing;
    const created: DbRow[] = [];
    this.tables.set(table, created);
    return created;
  }

  seed(table: string, rows: DbRow[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })));
  }

  matches(row: DbRow, filters: Filter[]): boolean {
    return filters.every((f) => row[f.column] === f.value);
  }

  removeWhere(table: string, filters: Filter[]): void {
    this.tables.set(
      table,
      this.rows(table).filter((r) => !this.matches(r, filters)),
    );
  }

  insert(table: string, payload: DbRow): DbRow {
    const row: DbRow = { ...payload };
    if (row.id == null) {
      this.seq += 1;
      row.id = `generated-${this.seq}`;
    }
    this.rows(table).push(row);
    this.calls.inserted.push({ table, row });
    return row;
  }
}

class FakeQuery {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: unknown = null;
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private terminal: "array" | "single" | "maybeSingle" = "array";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(): this {
    return this;
  }
  insert(payload: unknown): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown): this {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }
  order(): this {
    return this;
  }
  limit(n: number): this {
    this.limitCount = n;
    return this;
  }
  single(): Promise<{ data: unknown; error: unknown }> {
    this.terminal = "single";
    return this.run();
  }
  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    this.terminal = "maybeSingle";
    return this.run();
  }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<{ data: unknown; error: unknown }> {
    const table = this.table;
    switch (this.op) {
      case "insert": {
        if (this.db.failInsertFor.has(table)) {
          return { data: null, error: new Error("db boom") };
        }
        const row = this.db.insert(table, (this.payload ?? {}) as DbRow);
        return { data: { id: row.id }, error: null };
      }
      case "upsert": {
        this.db.calls.upserted.push({ table, row: this.payload });
        if (table === "account_import_mappings") {
          const p = (this.payload ?? {}) as DbRow;
          const rows = this.db.rows(table);
          const idx = rows.findIndex(
            (r) => r.batch_id === p.batch_id && r.source_section === p.source_section && r.source_id === p.source_id,
          );
          if (idx >= 0) rows[idx] = { ...p };
          else rows.push({ ...p });
        }
        return { data: null, error: null };
      }
      case "update": {
        this.db.calls.updated.push({ table, payload: this.payload, filters: [...this.filters] });
        for (const row of this.db.rows(table)) {
          if (this.db.matches(row, this.filters)) Object.assign(row, this.payload as DbRow);
        }
        return { data: null, error: null };
      }
      case "delete": {
        this.db.calls.deleted.push({ table, filters: [...this.filters] });
        this.db.removeWhere(table, this.filters);
        return { data: null, error: null };
      }
      case "select":
      default: {
        let rows = this.db.rows(table).filter((r) => this.db.matches(r, this.filters));
        if (this.limitCount != null) rows = rows.slice(0, this.limitCount);
        if (this.terminal === "array") return { data: rows, error: null };
        return { data: rows[0] ?? null, error: null };
      }
    }
  }
}

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const BATCH_ID = "batch-1";

function makeCtx(db: FakeDb) {
  const supabase = { from: jest.fn((table: string) => new FakeQuery(db, table)) } as unknown as SupabaseClient;
  const user = { id: USER_ID } as unknown as User;
  return {
    supabase,
    user,
    batchId: BATCH_ID,
    workspaceId: WORKSPACE_ID,
    mappings: new Map<string, { targetTable: string; targetId: string }>(),
  };
}

function validExport() {
  return {
    exportDate: "2026-09-20T00:00:00.000Z",
    userId: USER_ID,
    email: "owner@example.com",
    exportVersion: "1.0",
    data: {
      customers: [
        {
          id: "c1",
          first_name: "Jane",
          last_name: "Doe",
          email: "  Jane@Example.com ",
          phone: "(215) 555-0100",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        },
        { id: "c2", name: "Bob Smith", email: "existing@example.com", created_at: "not-a-date" },
      ],
      vehicles: [
        { id: "v1", customer_id: "c1", vin: " 1HGCM82633A123456 ", year: 2019, make: "Honda", model: "Civic" },
        { id: "v2", customer_id: "missing-customer", year: 2020 },
      ],
      service_catalog: [],
      appointments: [],
      services: [],
      invoices: [],
      payment_records: [],
      loyalty_points: [{ id: "lp1", points: 100 }],
    },
  };
}

describe("accountExportSchema", () => {
  it("accepts a fully valid export and preserves extra top-level keys (passthrough)", () => {
    const parsed = accountExportSchema.safeParse({ ...validExport(), sourceApp: "lovable" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("owner@example.com");
      expect(parsed.data.data.customers).toHaveLength(2);
      expect((parsed.data as Record<string, unknown>).sourceApp).toBe("lovable");
    }
  });

  it("accepts empty section arrays and an empty data object", () => {
    const base = validExport();
    const parsed = accountExportSchema.safeParse({ ...base, data: {} });
    expect(parsed.success).toBe(true);
  });

  it("accepts rows with mixed value types", () => {
    const base = validExport();
    base.data.customers = [{ id: 7, weird: null, nested: { a: [1, 2] }, flag: true }];
    expect(accountExportSchema.safeParse(base).success).toBe(true);
  });

  it("rejects missing or empty required fields", () => {
    const base = validExport();
    expect(accountExportSchema.safeParse({ ...base, exportDate: "" }).success).toBe(false);
    const { email: _omit, ...noEmail } = base;
    expect(accountExportSchema.safeParse(noEmail).success).toBe(false);
    const { data: _omitData, ...noData } = base;
    expect(accountExportSchema.safeParse(noData).success).toBe(false);
  });

  it("rejects an invalid userId and email", () => {
    const base = validExport();
    expect(accountExportSchema.safeParse({ ...base, userId: "not-a-uuid" }).success).toBe(false);
    expect(accountExportSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects wrong field types", () => {
    const base = validExport();
    expect(accountExportSchema.safeParse({ ...base, exportVersion: 3 }).success).toBe(false);
    expect(accountExportSchema.safeParse({ ...base, data: "customers" }).success).toBe(false);
    expect(
      accountExportSchema.safeParse({ ...base, data: { customers: { id: "c1" } } }).success,
    ).toBe(false);
  });
});

describe("createImportBatch", () => {
  it("rejects an invalid export with ApiError 400 invalid_export", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    await expect(
      createImportBatch({
        supabase: ctx.supabase,
        user: ctx.user,
        workspaceId: WORKSPACE_ID,
        fileName: "export.json",
        input: { ...validExport(), email: "bad" },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_export" });
    expect(db.calls.inserted).toHaveLength(0);
  });

  it("stages a batch row with the expected shape and returns the batch plus parsed export", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    const input = validExport();
    const result = await createImportBatch({
      supabase: ctx.supabase,
      user: ctx.user,
      workspaceId: WORKSPACE_ID,
      fileName: "export.json",
      input,
    });
    expect(db.calls.inserted).toHaveLength(1);
    const inserted = db.calls.inserted[0];
    expect(inserted.table).toBe("account_import_batches");
    expect(inserted.row).toMatchObject({
      workspace_id: WORKSPACE_ID,
      created_by: USER_ID,
      source_version: "1.0",
      source_file_name: "export.json",
      status: "staged",
      dry_run: true,
      total_records: 5,
    });
    expect(inserted.row.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.batch).toMatchObject({ id: inserted.row.id });
    expect(result.exportData.email).toBe("owner@example.com");
    expect(result.exportData.data.loyalty_points).toHaveLength(1);
  });

  it("propagates supabase insert errors", async () => {
    const supabase = {
      from: jest.fn(() => ({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: "db down", code: "500" } }),
          })),
        })),
      })),
    } as unknown as SupabaseClient;
    const user = { id: USER_ID } as unknown as User;
    await expect(
      createImportBatch({ supabase, user, workspaceId: WORKSPACE_ID, fileName: "export.json", input: validExport() }),
    ).rejects.toMatchObject({ message: "db down" });
  });
});

describe("executeImportBatch", () => {
  it("imports customers, matches pre-existing ones by email, fails orphan vehicles, and skips unknown sections", async () => {
    const db = new FakeDb();
    db.seed("customers", [{ id: "cust-existing", workspace_id: WORKSPACE_ID, email: "existing@example.com" }]);
    const ctx = makeCtx(db);

    const result = await executeImportBatch(ctx, accountExportSchema.parse(validExport()));

    expect(result.status).toBe("completed_with_errors");
    // White-box: `created` counts every non-failed row (the `matched` counter is never incremented).
    expect(result.counts).toEqual({ created: 3, matched: 0, skipped: 1, failed: 1 });

    const mappings = db.rows("account_import_mappings");
    expect(mappings).toHaveLength(3);
    const bySource = new Map(mappings.map((m) => [String(m.source_id), m]));
    expect(bySource.get("c2")).toMatchObject({ target_table: "customers", target_id: "cust-existing" });

    // c1 was created with normalized contact fields
    const createdCustomer = db.calls.inserted.find(
      (c) => c.table === "customers" && c.row.email === "jane@example.com",
    );
    expect(createdCustomer).toBeDefined();
    expect(createdCustomer?.row).toMatchObject({ phone: "2155550100", country_code: "US", workspace_id: WORKSPACE_ID });
    expect(bySource.get("c1")).toMatchObject({ target_table: "customers", target_id: createdCustomer?.row.id });

    // v1 was created and linked to the imported c1 customer
    const createdVehicle = db.calls.inserted.find((c) => c.table === "vehicles");
    expect(createdVehicle?.row).toMatchObject({ customer_id: createdCustomer?.row.id, vin: "1HGCM82633A123456" });

    // v2 failed with the orphan-customer code, lp1 was skipped as an unsupported section
    const failed = db.calls.upserted.find(
      (u) => u.table === "account_import_records" && (u.row as DbRow).source_id === "v2",
    );
    expect(failed?.row).toMatchObject({ action: "failed", error_code: "orphan_customer" });
    const skipped = db.calls.upserted.find(
      (u) => u.table === "account_import_records" && (u.row as DbRow).source_id === "lp1",
    );
    expect(skipped?.row).toMatchObject({ action: "skipped", error_code: "unsupported_target" });

    // batch summary update
    const batchUpdate = db.calls.updated.find((u) => u.table === "account_import_batches");
    expect(batchUpdate?.payload).toMatchObject({
      status: "completed_with_errors",
      dry_run: false,
      imported_records: 3,
      skipped_records: 1,
      failed_records: 1,
      error_summary: [{ code: "row_failures", count: 1 }],
    });
  });

  it("completes cleanly with an empty error summary when every row imports", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    const input = accountExportSchema.parse({
      ...validExport(),
      data: { customers: [{ id: "c1", name: "Solo Customer" }] },
    });

    const result = await executeImportBatch(ctx, input);

    expect(result.status).toBe("completed");
    expect(result.counts).toEqual({ created: 1, matched: 0, skipped: 0, failed: 0 });
    const batchUpdate = db.calls.updated.find((u) => u.table === "account_import_batches");
    expect(batchUpdate?.payload).toMatchObject({ status: "completed", error_summary: [] });
  });

  it("records import_error when a row insert fails with a non-ApiError", async () => {
    const db = new FakeDb();
    db.failInsertFor.add("customers");
    const ctx = makeCtx(db);
    const input = accountExportSchema.parse({
      ...validExport(),
      data: { customers: [{ id: "c1", name: "Broken Row" }] },
    });

    const result = await executeImportBatch(ctx, input);

    expect(result.status).toBe("completed_with_errors");
    expect(result.counts.failed).toBe(1);
    const failed = db.calls.upserted.find((u) => u.table === "account_import_records");
    expect(failed?.row).toMatchObject({ action: "failed", error_code: "import_error", error_message: "db boom" });
    // The thrown insert error must not create a mapping entry.
    expect(db.rows("account_import_mappings")).toHaveLength(0);
  });

  it("links service records and invoices through imported customer/vehicle mappings", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    const input = accountExportSchema.parse({
      ...validExport(),
      data: {
        customers: [{ id: "c1", name: "Jane Doe" }],
        vehicles: [{ id: "v1", customer_id: "c1", year: 2021 }],
        appointments: [{ id: "a1", customer_id: "c1", vehicle_id: "v1", status: "confirmed", scheduled_date: "2026-09-20", scheduled_time: "10:00" }],
        invoices: [{ id: "i1", customer_id: "c1", vehicle_id: "v1", total: 129.99, status: "issued" }],
      },
    });

    const result = await executeImportBatch(ctx, input);

    expect(result.status).toBe("completed");
    expect(result.counts).toEqual({ created: 4, matched: 0, skipped: 0, failed: 0 });
    const customerId = db.calls.inserted.find((c) => c.table === "customers")?.row.id;
    const vehicleId = db.calls.inserted.find((c) => c.table === "vehicles")?.row.id;
    const appointment = db.calls.inserted.find((c) => c.table === "appointments");
    expect(appointment?.row).toMatchObject({ customer_id: customerId, vehicle_id: vehicleId, status: "confirmed" });
    const invoice = db.calls.inserted.find((c) => c.table === "invoices");
    expect(invoice?.row).toMatchObject({ customer_id: customerId, vehicle_id: vehicleId, status: "issued", total: 129.99 });
  });

  it("treats appointments without customer or vehicle links as valid historical records", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    const input = accountExportSchema.parse({
      ...validExport(),
      data: { appointments: [{ id: "a1", title: "Legacy visit", scheduled_date: "2025-03-01" }] },
    });

    const result = await executeImportBatch(ctx, input);

    expect(result.status).toBe("completed");
    expect(result.counts.created).toBe(1);
    const appointment = db.calls.inserted.find((c) => c.table === "appointments");
    expect(appointment?.row).toMatchObject({ customer_id: null, vehicle_id: null });
  });
});

describe("rollbackImportBatch", () => {
  function seedCompletedBatch(db: FakeDb) {
    db.seed("account_import_batches", [{ id: BATCH_ID, workspace_id: WORKSPACE_ID, status: "completed" }]);
    db.seed("account_import_records", [
      { id: "r1", batch_id: BATCH_ID, workspace_id: WORKSPACE_ID, action: "created", status: "committed", target_table: "customers", target_id: "cust-1" },
      { id: "r2", batch_id: BATCH_ID, workspace_id: WORKSPACE_ID, action: "created", status: "committed", target_table: "invoices", target_id: "inv-1" },
      { id: "r3", batch_id: BATCH_ID, workspace_id: WORKSPACE_ID, action: "matched", status: "committed", target_table: "customers", target_id: "cust-2" },
      { id: "r4", batch_id: BATCH_ID, workspace_id: WORKSPACE_ID, action: "created", status: "committed", target_table: "audit_events", target_id: "ae-1" },
      { id: "r5", batch_id: BATCH_ID, workspace_id: WORKSPACE_ID, action: "created", status: "committed", target_table: "customers", target_id: null },
    ]);
    db.seed("customers", [
      { id: "cust-1", workspace_id: WORKSPACE_ID },
      { id: "cust-2", workspace_id: WORKSPACE_ID },
    ]);
    db.seed("invoices", [{ id: "inv-1", workspace_id: WORKSPACE_ID }]);
    db.seed("audit_events", [{ id: "ae-1", workspace_id: WORKSPACE_ID }]);
  }

  it("deletes created rows, marks records rolled back, and closes the batch", async () => {
    const db = new FakeDb();
    seedCompletedBatch(db);
    const ctx = makeCtx(db);

    const result = await rollbackImportBatch(ctx);

    expect(result).toEqual({ status: "rolled_back", deleted: 2 });
    expect(db.rows("customers").map((r) => r.id)).toEqual(["cust-2"]);
    expect(db.rows("invoices")).toHaveLength(0);
    // Disallowed target tables are left alone.
    expect(db.rows("audit_events")).toHaveLength(1);

    const rolledBack = db.rows("account_import_records").filter((r) => r.status === "rolled_back").map((r) => r.id);
    expect(rolledBack.sort()).toEqual(["r1", "r2"]);

    const batchUpdate = db.calls.updated.find((u) => u.table === "account_import_batches");
    expect(batchUpdate?.payload).toMatchObject({ status: "rolled_back" });
    expect(batchUpdate?.payload).toHaveProperty("rolled_back_at");
  });

  it("throws ApiError 404 not_found when the batch does not exist", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db);
    await expect(rollbackImportBatch(ctx)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("throws ApiError 409 invalid_batch_state when the batch is not completed", async () => {
    const db = new FakeDb();
    db.seed("account_import_batches", [{ id: BATCH_ID, workspace_id: WORKSPACE_ID, status: "staged" }]);
    const ctx = makeCtx(db);
    await expect(rollbackImportBatch(ctx)).rejects.toMatchObject({ status: 409, code: "invalid_batch_state" });
  });

  it("accepts batches that completed with errors", async () => {
    const db = new FakeDb();
    db.seed("account_import_batches", [{ id: BATCH_ID, workspace_id: WORKSPACE_ID, status: "completed_with_errors" }]);
    db.seed("account_import_records", []);
    const ctx = makeCtx(db);
    const result = await rollbackImportBatch(ctx);
    expect(result).toEqual({ status: "rolled_back", deleted: 0 });
  });
});
