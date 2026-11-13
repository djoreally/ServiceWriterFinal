/**
 * QLD spec provider — tests.
 *
 * Fixture provenance (all captured from the production QLD Developer
 * API on 2026-11-13 with the workspace's own developer key; total
 * capture spend: one service-spec call + one filters call):
 *   - qld-service-spec-2023-ford-transit-250-turbo-3.5.json — VERBATIM
 *     capture. Note its oil fields are null (QLD answered with
 *     dataQuality.coreOilSpecAvailable=false for this engine): the
 *     honest "QLD answered, oil not recorded" case.
 *   - qld-filters-2023-ford-transit-250-turbo-3.5.json — VERBATIM
 *     capture (WIX 57502 / NAPA Gold 7502 / STP S10590, verified).
 *   - qld-engines-2023-ford-transit-250.json — VERBATIM capture of
 *     the 0-credit hierarchy endpoint.
 *   - qld-service-spec-...-populated.json — DERIVED: the verbatim
 *     capture's envelope with the oil block populated, to exercise
 *     the populated-oil mapping the null capture cannot reach.
 *   - The HTTP 400 body below is the VERBATIM error the API returned
 *     when the engine was omitted for this vehicle.
 */
import {
  combineCatalogValues,
  mapQldSpecValues,
  qldCacheKey,
  resolveQldSpec,
} from "../spec-provider";
import realSpec from "./fixtures/qld-service-spec-2023-ford-transit-250-turbo-3.5.json";
import populatedSpec from "./fixtures/qld-service-spec-2023-ford-transit-250-turbo-3.5-populated.json";
import realFilters from "./fixtures/qld-filters-2023-ford-transit-250-turbo-3.5.json";
import realEngines from "./fixtures/qld-engines-2023-ford-transit-250.json";

const TRANSIT = { year: 2023, make: "Ford", model: "Transit-250", engine: "Turbo 3.5" };

type CacheRow = { cache_key: string; request: unknown; response: unknown; created_at: string };

/** Minimal supabase-shaped fake carrying only qld_spec_cache. */
function fakeDb(seed: CacheRow[] = []) {
  const rows = new Map(seed.map((row) => [row.cache_key, { ...row }]));
  const db = {
    rows,
    from(table: string) {
      if (table !== "qld_spec_cache") throw new Error(`unexpected table ${table}`);
      let filterKey: string | null = null;
      const query = {
        select: () => query,
        eq: (_col: string, value: string) => {
          filterKey = value;
          return query;
        },
        maybeSingle: async () => ({
          data: filterKey ? (rows.get(filterKey) ?? null) : null,
          error: null,
        }),
        upsert: async (row: CacheRow) => {
          rows.set(row.cache_key, { ...row, created_at: new Date().toISOString() });
          return { data: null, error: null };
        },
      };
      return query;
    },
  };
  return db;
}

function fetchReturning(handler: (url: string) => { status: number; body: unknown }) {
  return jest.fn(async (url: string) => {
    const { status, body } = handler(String(url));
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  });
}

const liveFetch = () =>
  fetchReturning((url) => {
    if (url.includes("service-spec")) return { status: 200, body: populatedSpec };
    if (url.includes("filters")) return { status: 200, body: realFilters };
    if (url.includes("engines")) return { status: 200, body: realEngines };
    throw new Error(`unexpected url ${url}`);
  });

describe("mapQldSpecValues", () => {
  it("maps the verbatim capture honestly: filter + engine land, null oil fields stay absent", () => {
    const values = mapQldSpecValues(realSpec as never, realFilters as never);
    expect(values.engine).toBe("Turbo 3.5");
    expect(values.oilFilter).toBe("NAPA Gold 7502");
    expect(values.oilType).toBeUndefined();
    expect(values.oilCapacity).toBeUndefined();
    expect(values.drainPlugTorqueFtLbs).toBeUndefined();
  });

  it("maps a populated oil block into house formats", () => {
    const values = mapQldSpecValues(populatedSpec as never, realFilters as never);
    expect(values.oilType).toBe("5W-20");
    expect(values.oilCapacity).toBe("6.0 qt");
    expect(values.drainPlugTorqueFtLbs).toBe(18);
    expect(values.oilFilter).toBe("NAPA Gold 7502");
  });

  it("answers empty values for null bodies", () => {
    expect(mapQldSpecValues(null, null)).toEqual({});
  });
});

describe("resolveQldSpec", () => {
  it("resolves live values and writes the cache; the second call spends no fetch", async () => {
    const db = fakeDb();
    const fetchImpl = liveFetch();
    const first = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(first).toEqual({
      status: "ok",
      values: {
        engine: "Turbo 3.5",
        oilType: "5W-20",
        oilCapacity: "6.0 qt",
        oilFilter: "NAPA Gold 7502",
        drainPlugTorqueFtLbs: 18,
      },
    });
    expect(db.rows.size).toBe(1);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(second.status).toBe("ok");
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it("serves a fresh cache row without any fetch", async () => {
    const key = qldCacheKey(TRANSIT);
    const db = fakeDb([
      {
        cache_key: key,
        request: TRANSIT,
        response: { values: { oilType: "5W-20", oilFilter: "NAPA Gold 7502" }, serviceSpec: null, filters: null },
        created_at: new Date().toISOString(),
      },
    ]);
    const fetchImpl = liveFetch();
    const result = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({
      status: "ok",
      values: { oilType: "5W-20", oilFilter: "NAPA Gold 7502" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ignores a cache row older than 90 days and goes live", async () => {
    const key = qldCacheKey(TRANSIT);
    const stale = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const db = fakeDb([
      { cache_key: key, request: TRANSIT, response: { values: { oilType: "STALE" } }, created_at: stale },
    ]);
    const fetchImpl = liveFetch();
    const result = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.values.oilType).toBe("5W-20");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("surfaces engine_required (documented shape) with QLD's engine list and no values", async () => {
    const db = fakeDb();
    const fetchImpl = fetchReturning((url) => {
      if (url.includes("service-spec")) {
        return { status: 200, body: { status: "engine_required", engines: ["3.5", "Diesel 2", "Turbo 3.5"] } };
      }
      if (url.includes("filters")) {
        return { status: 200, body: { status: "engine_required", engines: ["3.5", "Diesel 2", "Turbo 3.5"] } };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const result = await resolveQldSpec(db, { ...TRANSIT, engine: null }, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({
      status: "engine_required",
      engines: ["3.5", "Diesel 2", "Turbo 3.5"],
    });
    expect(db.rows.size).toBe(0);
  });

  it("surfaces engine_required from the verbatim HTTP 400 body, filling the list from the hierarchy", async () => {
    const db = fakeDb();
    const fetchImpl = fetchReturning((url) => {
      if (url.includes("service-spec") || url.includes("filters")) {
        return {
          status: 400,
          body: { success: false, message: "Valid year, make, model, and engine are required" },
        };
      }
      if (url.includes("engines")) return { status: 200, body: realEngines };
      throw new Error(`unexpected url ${url}`);
    });
    const result = await resolveQldSpec(db, { ...TRANSIT, engine: null }, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({
      status: "engine_required",
      engines: ["3.5", "Diesel 2", "Turbo 3.5"],
    });
  });

  it("fails open when QLD is down: rejected fetches answer unavailable", async () => {
    const db = fakeDb();
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({ status: "unavailable" });
  });

  it("fails open on HTTP 500 answers", async () => {
    const db = fakeDb();
    const fetchImpl = fetchReturning(() => ({ status: 500, body: { success: false } }));
    const result = await resolveQldSpec(db, TRANSIT, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({ status: "unavailable" });
  });

  it("runs dark without a key: unavailable and zero fetches", async () => {
    const db = fakeDb();
    const fetchImpl = liveFetch();
    const result = await resolveQldSpec(db, TRANSIT, { apiKey: "", fetchImpl });
    expect(result).toEqual({ status: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("combineCatalogValues", () => {
  it("QLD wins the fields it answers; the table fills only QLD's blanks", () => {
    const combined = combineCatalogValues(
      { engine: "Turbo 3.5", oilType: "0W-20", oilCapacity: "5.0 qt", oilFilter: "Table Filter 123" },
      { oilType: "5W-20", oilCapacity: "6.0 qt" },
    );
    expect(combined).toEqual({
      engine: "Turbo 3.5",
      oilType: "5W-20",
      oilCapacity: "6.0 qt",
      oilFilter: "Table Filter 123",
    });
  });

  it("passes the table resolution through untouched when QLD has nothing", () => {
    const table = { oilType: "0W-20" };
    expect(combineCatalogValues(table, null)).toBe(table);
  });
});
