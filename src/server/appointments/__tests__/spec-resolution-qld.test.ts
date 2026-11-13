/**
 * SW → QLD wire, end to end through the job spec resolution
 * (buildBookingConfiguration) with the REAL QLD provider and client
 * in the loop — only the network fetch and the database are faked.
 *
 * The scenario is the doctrine in one job: a human (learned) value
 * must survive, QLD (the source) must beat the legacy table for the
 * fields it answers, the table must fill what QLD leaves blank, and
 * a dead or unconfigured QLD must degrade to exactly the pre-wire
 * behavior.
 *
 * QLD payloads: the verbatim production captures in
 * src/server/qld/__tests__/fixtures (filters + engines verbatim; the
 * service-spec's oil block populated in the derived fixture, as
 * documented there).
 */
import { buildBookingConfiguration } from "../spec-resolution";
import populatedSpec from "../../qld/__tests__/fixtures/qld-service-spec-2023-ford-transit-250-turbo-3.5-populated.json";
import realFilters from "../../qld/__tests__/fixtures/qld-filters-2023-ford-transit-250-turbo-3.5.json";

const WS = "ws-qld-1";
const APPT = "appt-qld-1";
const VEH = "veh-transit-1";

type Row = Record<string, unknown>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private limitN: number | null = null;
  private orderSpec: { col: string; ascending: boolean } | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  ilike(col: string, value: unknown) {
    this.filters.push(
      (row) => String(row[col] ?? "").toLowerCase() === String(value).toLowerCase(),
    );
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[col]));
    return this;
  }
  filter(expr: string, _op: string, value: unknown) {
    if (expr === "metadata->>appointment_id") {
      this.filters.push((row) => (row.metadata as Row | undefined)?.appointment_id === value);
    }
    return this;
  }
  not(col: string, _op: string, value: unknown) {
    this.filters.push((row) => row[col] !== value && row[col] != null);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  async maybeSingle() {
    return { data: this.run()[0] ?? null, error: null };
  }
  async upsert(row: Row) {
    this.db.upsertRow(this.table, row);
    return { data: null, error: null };
  }
  private run(): Row[] {
    let rows = [...(this.db.tables[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter(filter);
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      rows.sort(
        (a, b) =>
          (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (ascending ? 1 : -1),
      );
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }
  then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.run(), error: null }).then(onFulfilled);
  }
}

class FakeDb {
  tables: Record<string, Row[]>;
  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }
  from(table: string) {
    return new FakeQuery(this, table);
  }
  upsertRow(table: string, row: Row) {
    const rows = (this.tables[table] ??= []);
    const key = String(row.cache_key ?? "");
    const index = rows.findIndex((entry) => entry.cache_key === key);
    const stored = { ...row, created_at: new Date().toISOString() };
    if (index >= 0) rows[index] = stored;
    else rows.push(stored);
  }
}

function seedDb(): FakeDb {
  return new FakeDb({
    appointment_items: [],
    invoices: [],
    invoice_lines: [],
    vehicles: [
      {
        id: VEH,
        workspace_id: WS,
        year: 2023,
        make: "Ford",
        model: "Transit-250",
        vin: "1FTBR1Y86PKB51521",
        license_plate: "ZXB-9797",
        mileage: 57700,
      },
    ],
    // The shop settled the oil TYPE by hand; capacity and filter are
    // still blank — the blanks QLD exists to fill.
    vehicle_service_specs: [
      {
        vehicle_id: VEH,
        workspace_id: WS,
        engine: "Turbo 3.5",
        oil_type: "5W-30",
        oil_capacity: null,
        oil_filter: null,
        updated_at: "2026-11-12T15:00:00.000Z",
      },
    ],
    // The legacy snapshot's answers for the same vehicle — wrong
    // capacity, placeholder filter: QLD must beat these where it
    // speaks.
    vehicle_specifications: [
      {
        year: 2023,
        make: "Ford",
        model: "Transit-250",
        engine: "Turbo 3.5",
        oil_type: "0W-20",
        oil_capacity: "5.0 qt",
        oil_filter: "Table Filter 123",
      },
    ],
    qld_spec_cache: [],
  });
}

function liveFetch() {
  return jest.fn(async (url: string) => {
    const href = String(url);
    if (href.includes("service-spec")) {
      return { status: 200, ok: true, json: async () => populatedSpec } as Response;
    }
    if (href.includes("filters")) {
      return { status: 200, ok: true, json: async () => realFilters } as Response;
    }
    throw new Error(`unexpected url ${href}`);
  });
}

const appointment = {
  id: APPT,
  workspace_id: WS,
  vehicle_id: VEH,
  created_at: "2026-11-13T13:00:00.000Z",
};

describe("buildBookingConfiguration with the QLD wire", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.QLD_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.QLD_API_KEY;
    else process.env.QLD_API_KEY = originalKey;
  });

  it("learned wins, QLD beats the table, and the merge reports its sources", async () => {
    process.env.QLD_API_KEY = "test-key";
    global.fetch = liveFetch() as unknown as typeof fetch;
    const db = seedDb();

    const config = await buildBookingConfiguration(db as never, appointment, null);
    expect(config).not.toBeNull();
    const vehicle = config!.vehicles[0];
    expect(vehicle.oil).toEqual({
      engine: "Turbo 3.5",
      oilType: "5W-30", // the human's learned value — QLD never overwrites it
      oilCapacity: "6.0 qt", // QLD's answer, not the table's 5.0 qt
      oilFilter: "NAPA Gold 7502", // QLD's verified cross-reference
      capacitySource: "db",
    });
    expect(vehicle.specSources).toEqual({
      engine: "learned",
      oilType: "learned",
      oilCapacity: "catalog",
      oilFilter: "catalog",
    });
    expect(vehicle.specStatus).toBe("from_catalog");
    // The live answer landed in the server cache for the next job.
    expect(db.tables.qld_spec_cache.length).toBe(1);
  });

  it("fails open to the legacy table resolution when QLD is down", async () => {
    process.env.QLD_API_KEY = "test-key";
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const db = seedDb();

    const config = await buildBookingConfiguration(db as never, appointment, null);
    const vehicle = config!.vehicles[0];
    expect(vehicle.oil?.oilType).toBe("5W-30");
    expect(vehicle.oil?.oilCapacity).toBe("5.0 qt");
    expect(vehicle.oil?.oilFilter).toBe("Table Filter 123");
  });

  it("runs dark without QLD_API_KEY: no fetch, table resolution only", async () => {
    delete process.env.QLD_API_KEY;
    const fetchImpl = liveFetch();
    global.fetch = fetchImpl as unknown as typeof fetch;
    const db = seedDb();

    const config = await buildBookingConfiguration(db as never, appointment, null);
    const vehicle = config!.vehicles[0];
    expect(vehicle.oil?.oilCapacity).toBe("5.0 qt");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
