/**
 * The VIN-less job (Ariane Klepacki's 2024 Chevrolet Suburban,
 * Ty's screenshot 2026-11-13): no VIN on the job, no workspace
 * vehicle row — only the booking snapshot's identity and its booked
 * engine. The job page must still resolve specs: the snapshot
 * engine is the hint, QLD's hierarchy canonicalizes the identity,
 * and the catalog tier answers. Nothing here may require a VIN.
 *
 * Fakes: the database (same FakeDb shape as spec-resolution-qld)
 * and the network. QLD bodies are built in the REAL captured shapes
 * (see src/server/qld/__tests__/fixtures).
 */
import { buildBookingConfiguration } from "../spec-resolution";

const WS = "ws-vinless-1";
const APPT = "appt-vinless-1";
const VEH = "veh-suburban-1";

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

const suburbanSpecBody = {
  success: true,
  spec: {
    vehicle: { year: 2024, make: "Chevrolet", model: "Suburban", engine: "5.3" },
    oil: {
      viscosity: "0W-20",
      capacity: { display: "8.0 qt", quarts: 8, liters: 7.6 },
      drainPlugTorque: { display: "18 ft-lbs", ftLbs: 18, nm: 24 },
    },
  },
};

const suburbanFiltersBody = {
  success: true,
  spec: {
    vehicle: { year: 2024, make: "Chevrolet", model: "Suburban", engine: "5.3" },
    filters: { wix: "57060", napaGold: "7060", stp: "S45008" },
  },
};

function liveFetch() {
  return jest.fn(async (url: string) => {
    const href = String(url);
    const respond = (body: unknown) =>
      ({ status: 200, ok: true, json: async () => body }) as Response;
    if (href.includes("service-spec")) return respond(suburbanSpecBody);
    if (href.includes("filters")) return respond(suburbanFiltersBody);
    if (href.includes("/engines")) return respond({ success: true, engines: ["5.3", "6.2"] });
    if (href.includes("/models")) return respond({ success: true, models: ["Suburban", "Tahoe"] });
    if (href.includes("/makes")) return respond({ success: true, makes: ["Chevrolet", "Ford"] });
    throw new Error(`unexpected url ${href}`);
  });
}

const appointment = {
  id: APPT,
  workspace_id: WS,
  vehicle_id: null,
  created_at: "2026-11-13T13:00:00.000Z",
};

function snapshotWith(oil: Row) {
  return {
    schemaVersion: 2,
    vehicles: [
      {
        clientVehicleId: VEH,
        vehicle: { year: 2024, make: "Chevrolet", model: "Suburban" },
        oil,
      },
    ],
  };
}

describe("buildBookingConfiguration — the VIN-less job", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.QLD_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.QLD_API_KEY;
    else process.env.QLD_API_KEY = originalKey;
  });

  it("resolves specs from year/make/model + the BOOKED snapshot engine — no VIN anywhere", async () => {
    process.env.QLD_API_KEY = "test-key";
    global.fetch = liveFetch() as unknown as typeof fetch;
    const db = new FakeDb({
      appointment_items: [],
      invoices: [],
      invoice_lines: [],
      vehicles: [],
      vehicle_service_specs: [],
      vehicle_specifications: [],
      qld_spec_cache: [],
    });

    const config = await buildBookingConfiguration(
      db as never,
      appointment,
      snapshotWith({ engine: "5.3L V8" }),
    );
    expect(config).not.toBeNull();
    const vehicle = config!.vehicles[0];
    expect(vehicle.vehicle).toMatchObject({ year: 2024, make: "Chevrolet", model: "Suburban" });
    expect(vehicle.oil?.oilType).toBe("0W-20");
    expect(vehicle.oil?.oilCapacity).toBe("8.0 qt");
    expect(vehicle.oil?.oilFilter).toBe("NAPA Gold 7060");
    expect(vehicle.specSources?.oilCapacity).toBe("catalog");
  });
});
