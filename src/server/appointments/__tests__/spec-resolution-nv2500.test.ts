/**
 * The job-path twin of the NV2500 blank-model disease (PR #293
 * fixed the Data Center route; this pins the appointment /
 * booking-configuration path).
 *
 * Dave Hamilton's 2018 Nissan lives in production as a vehicles
 * row with year + make and model NULL. Every spec layer in
 * buildBookingConfiguration keys on a full year/make/model, so the
 * job's "Oil service specifications" stayed "Not recorded" even
 * after the resolver learned to answer — the QLD tier was never
 * consulted with a complete identity. The fix completes BLANKS
 * ONLY from the NHTSA VIN decode (fillVehicleIdentityBlanks, the
 * same helper PR #293 wired into the Data Center route): the
 * decode says model "NV", and the resolver's family expansion
 * (PR #293) takes it from there.
 *
 * The fakes are the real shapes: the QLD server implements the
 * production exact-match contract fed by the verbatim captures in
 * src/server/qld/__tests__/fixtures (the NV family's oil blocks
 * are byte-identical for engine "4": 5W-30 / 5.39 qt → house
 * format "5.4 qt" / 25 ft-lb; filters 422 for 2018, honestly
 * blank), and the vPIC payload is what NHTSA answers for this
 * VIN — Model "NV", displacement 4.0L, 6 cylinders.
 */
import { buildBookingConfiguration } from "../spec-resolution";
import makes2018 from "../../qld/__tests__/fixtures/qld-makes-2018.json";
import models2018Nissan from "../../qld/__tests__/fixtures/qld-models-2018-nissan.json";
import enginesNv1500 from "../../qld/__tests__/fixtures/qld-engines-2018-nissan-nv1500.json";
import enginesNv200 from "../../qld/__tests__/fixtures/qld-engines-2018-nissan-nv200.json";
import enginesNv2500 from "../../qld/__tests__/fixtures/qld-engines-2018-nissan-nv2500.json";
import enginesNv3500 from "../../qld/__tests__/fixtures/qld-engines-2018-nissan-nv3500.json";
import specNv15004 from "../../qld/__tests__/fixtures/qld-service-spec-2018-nissan-nv1500-4.json";
import specNv25004 from "../../qld/__tests__/fixtures/qld-service-spec-2018-nissan-nv2500-4.json";
import specNv250056 from "../../qld/__tests__/fixtures/qld-service-spec-2018-nissan-nv2500-5.6.json";
import specNv35004 from "../../qld/__tests__/fixtures/qld-service-spec-2018-nissan-nv3500-4.json";
import filtersNv1500422 from "../../qld/__tests__/fixtures/qld-filters-2018-nissan-nv1500-422.json";
import filtersNv2500422 from "../../qld/__tests__/fixtures/qld-filters-2018-nissan-nv2500-422.json";
import filtersNv3500422 from "../../qld/__tests__/fixtures/qld-filters-2018-nissan-nv3500-422.json";

const WS = "ws-nv-1";
const APPT = "appt-nv-1";
const VEH = "veh-nv2500-1";
const NV_VIN = "1N6BF0KY7JN800080";

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

/** Dave Hamilton's Nissan as production stores it: model NULL. */
function nissanRow(overrides: Row = {}): Row {
  return {
    id: VEH,
    workspace_id: WS,
    year: 2018,
    make: "Nissan",
    model: null,
    vin: NV_VIN,
    license_plate: null,
    mileage: 123966,
    ...overrides,
  };
}

function seedDb(vehicle: Row): FakeDb {
  return new FakeDb({
    appointment_items: [],
    invoices: [],
    invoice_lines: [],
    vehicles: [vehicle],
    vehicle_service_specs: [],
    vehicle_specifications: [],
    qld_spec_cache: [],
  });
}

/** What NHTSA vPIC answers for Dave's VIN (variables the mapper reads). */
const VPIC_NV = {
  Results: [
    { Variable: "Model Year", Value: "2018" },
    { Variable: "Make", Value: "Nissan" },
    { Variable: "Model", Value: "NV" },
    { Variable: "Displacement (L)", Value: "4.0" },
    { Variable: "Engine Number of Cylinders", Value: "6" },
  ],
};

const NOT_FOUND = { success: false, message: "Vehicle specification not found" };
const ENGINE_REQUIRED_400 = {
  success: false,
  message: "Valid year, make, model, and engine are required",
};

interface RecordedRequest {
  path: string;
  params: Record<string, string>;
}

/**
 * One fake network for both outbound doors: NHTSA vPIC (keyed by
 * the VIN in the URL) and QLD with its exact-match contract.
 */
function fakeNetwork(vpicByVin: Record<string, unknown> = { [NV_VIN]: VPIC_NV }) {
  const requests: RecordedRequest[] = [];
  const vpicVins: string[] = [];
  const specTable: Record<string, unknown> = {
    "2018|Nissan|NV1500|4": specNv15004,
    "2018|Nissan|NV2500|4": specNv25004,
    "2018|Nissan|NV2500|5.6": specNv250056,
    "2018|Nissan|NV3500|4": specNv35004,
  };
  const filtersTable: Record<string, { status: number; body: unknown }> = {
    "2018|Nissan|NV1500|4": { status: 422, body: filtersNv1500422 },
    "2018|Nissan|NV2500|4": { status: 422, body: filtersNv2500422 },
    "2018|Nissan|NV2500|5.6": { status: 422, body: filtersNv2500422 },
    "2018|Nissan|NV3500|4": { status: 422, body: filtersNv3500422 },
  };
  const fetchImpl = jest.fn(async (url: string) => {
    const href = String(url);
    const respond = (status: number, body: unknown) =>
      ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

    if (href.includes("vpic.nhtsa.dot.gov")) {
      const vin = decodeURIComponent(href.split("/decodevin/")[1].split("?")[0]);
      vpicVins.push(vin);
      const body = vpicByVin[vin];
      return body ? respond(200, body) : respond(404, {});
    }

    const parsed = new URL(href);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    requests.push({ path: parsed.pathname, params });

    if (parsed.pathname.endsWith("/makes")) {
      return respond(200, params.year === "2018" ? makes2018 : { success: true, makes: [] });
    }
    if (parsed.pathname.endsWith("/models")) {
      return respond(
        200,
        params.year === "2018" && params.make === "Nissan"
          ? models2018Nissan
          : { success: true, models: [] },
      );
    }
    if (parsed.pathname.endsWith("/engines")) {
      const byModel: Record<string, unknown> = {
        NV1500: enginesNv1500,
        NV200: enginesNv200,
        NV2500: enginesNv2500,
        NV3500: enginesNv3500,
      };
      const body = params.make === "Nissan" ? byModel[params.model] : undefined;
      return respond(200, body ?? { success: true, engines: [] });
    }
    if (parsed.pathname.endsWith("/service-spec") || parsed.pathname.endsWith("/filters")) {
      const { year, make, model, engine } = params;
      if (!year || !make || !model || !engine) return respond(400, ENGINE_REQUIRED_400);
      const key = `${year}|${make}|${model}|${engine}`;
      if (parsed.pathname.endsWith("/service-spec")) {
        const body = specTable[key];
        return body ? respond(200, body) : respond(404, NOT_FOUND);
      }
      const entry = filtersTable[key];
      return entry ? respond(entry.status, entry.body) : respond(404, NOT_FOUND);
    }
    throw new Error(`unexpected url ${href}`);
  });
  const specRequests = () => requests.filter((r) => r.path.endsWith("/service-spec"));
  return { fetchImpl, requests, specRequests, vpicVins };
}

const appointment = {
  id: APPT,
  workspace_id: WS,
  vehicle_id: VEH,
  created_at: "2026-11-12T14:00:00.000Z",
};

describe("buildBookingConfiguration — blank-model job (the NV2500 job-path twin)", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.QLD_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.QLD_API_KEY;
    else process.env.QLD_API_KEY = originalKey;
  });

  it("completes the blank model from the VIN decode and resolves QLD specs for Dave's Nissan", async () => {
    process.env.QLD_API_KEY = "test-key";
    const net = fakeNetwork();
    global.fetch = net.fetchImpl as unknown as typeof fetch;
    const db = seedDb(nissanRow());

    const config = await buildBookingConfiguration(db as never, appointment, null);
    expect(config).not.toBeNull();
    const vehicle = config!.vehicles[0];
    // QLD's answers, in the house format — the filter stays
    // honestly absent (QLD 422s filter data for 2018).
    expect(vehicle.oil).toEqual({
      engine: "4",
      oilType: "5W-30",
      oilCapacity: "5.4 qt",
      capacitySource: "db",
    });
    expect(vehicle.specSources).toEqual({
      engine: "catalog",
      oilType: "catalog",
      oilCapacity: "catalog",
    });
    // One core field (the filter) is still unrecorded, so the
    // group status stays honest instead of claiming "from catalog".
    expect(vehicle.specStatus).toBe("needs_verification");
    // The decode ran for this VIN (identity completion decodes
    // once; the provider may decode again for its engine hint —
    // both are this VIN and no other), and the wire never sent
    // the family string "NV" itself to the spec endpoint — the
    // resolver probed the family's cargo vans and they agreed.
    expect(net.vpicVins.length).toBeGreaterThan(0);
    expect(new Set(net.vpicVins)).toEqual(new Set([NV_VIN]));
    expect(net.specRequests().map((r) => `${r.params.model}|${r.params.engine}`)).toEqual([
      "NV1500|4",
      "NV2500|4",
      "NV3500|4",
    ]);
    // The resolution cached under the family key.
    expect(db.tables.qld_spec_cache.map((row) => row.cache_key)).toContain("2018|nissan|nv|4");
  });

  it("stays fail-open with no VIN: no decode, no QLD call, honest 'Not recorded'", async () => {
    process.env.QLD_API_KEY = "test-key";
    const net = fakeNetwork({});
    global.fetch = net.fetchImpl as unknown as typeof fetch;
    const db = seedDb(nissanRow({ vin: null }));

    const config = await buildBookingConfiguration(db as never, appointment, null);
    const vehicle = config!.vehicles[0];
    expect(vehicle.oil).toBeUndefined();
    expect(vehicle.specStatus).toBe("needs_verification");
    expect(vehicle.specSources).toEqual({});
    expect(net.vpicVins).toEqual([]);
    expect(net.requests).toEqual([]);
    expect(db.tables.qld_spec_cache).toEqual([]);
  });

  it("stored model wins: a row that names 'NV2500' never triggers a decode", async () => {
    process.env.QLD_API_KEY = "test-key";
    const net = fakeNetwork();
    global.fetch = net.fetchImpl as unknown as typeof fetch;
    const db = seedDb(nissanRow({ model: "NV2500" }));

    const config = await buildBookingConfiguration(db as never, appointment, null);
    const vehicle = config!.vehicles[0];
    expect(vehicle.oil).toEqual({
      engine: "4",
      oilType: "5W-30",
      oilCapacity: "5.4 qt",
      capacitySource: "db",
    });
    // Identity was already complete — no decode was spent, and the
    // spec probe went straight to the stored model (the VIN still
    // rides along as the provider's engine-hint source, decoded
    // inside the provider, not by the identity completion).
    expect(net.vpicVins).toEqual([NV_VIN]);
    expect(net.specRequests().map((r) => `${r.params.model}|${r.params.engine}`)).toEqual([
      "NV2500|4",
    ]);
  });
});
