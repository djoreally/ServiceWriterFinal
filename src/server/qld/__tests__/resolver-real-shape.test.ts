/**
 * QLD resolver — REAL-SHAPE tests.
 *
 * The SW-89 wire shipped broken because its tests mocked fetch and
 * only ever fed QLD-canonical inputs ("Transit-250", "Turbo 3.5").
 * These tests do the opposite: the fake QLD server below implements
 * the production contract EXACTLY as diagnosed on 2026-11-13 —
 * all four params required (HTTP 400 otherwise, verbatim body),
 * literal model/engine matching (404 otherwise), hierarchy lists
 * holding the canonical spellings — and the inputs are Service
 * Writer's REAL stored strings: model "Transit T250", engine null,
 * the NHTSA format "3.5L 6-cyl". Payloads are verbatim captures
 * from the production API (see fixtures; capture spend: the "3.5"
 * spec + filters, the NV2500 specs, and the 422 filters refusal —
 * hierarchy calls are free).
 */
import { resolveQldSpec } from "../spec-provider";
import makes2023 from "./fixtures/qld-makes-2023.json";
import models2023Ford from "./fixtures/qld-models-2023-ford.json";
import enginesTransit from "./fixtures/qld-engines-2023-ford-transit-250.json";
import specTransit35 from "./fixtures/qld-service-spec-2023-ford-transit-250-3.5.json";
import filtersTransit35 from "./fixtures/qld-filters-2023-ford-transit-250-3.5.json";
import specTransitTurbo from "./fixtures/qld-service-spec-2023-ford-transit-250-turbo-3.5.json";
import filtersTransitTurbo from "./fixtures/qld-filters-2023-ford-transit-250-turbo-3.5.json";
import makes2018 from "./fixtures/qld-makes-2018.json";
import models2018Nissan from "./fixtures/qld-models-2018-nissan.json";
import enginesNv2500 from "./fixtures/qld-engines-2018-nissan-nv2500.json";
import specNv4 from "./fixtures/qld-service-spec-2018-nissan-nv2500-4.json";
import specNv56 from "./fixtures/qld-service-spec-2018-nissan-nv2500-5.6.json";
import filtersNv422 from "./fixtures/qld-filters-2018-nissan-nv2500-422.json";

const NOT_FOUND = { success: false, message: "Vehicle specification not found" };
const ENGINE_REQUIRED_400 = {
  success: false,
  message: "Valid year, make, model, and engine are required",
};

type CacheRow = { cache_key: string; request: unknown; response: unknown; created_at: string };

function fakeDb(seed: CacheRow[] = []) {
  const rows = new Map(seed.map((row) => [row.cache_key, { ...row }]));
  return {
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
}

interface RecordedRequest {
  path: string;
  params: Record<string, string>;
}

/** A fake QLD server with the production API's exact-match semantics. */
function fakeQldServer() {
  const requests: RecordedRequest[] = [];
  const specTable: Record<string, unknown> = {
    "2023|Ford|Transit-250|3.5": specTransit35,
    "2023|Ford|Transit-250|Turbo 3.5": specTransitTurbo,
    "2018|Nissan|NV2500|4": specNv4,
    "2018|Nissan|NV2500|5.6": specNv56,
  };
  const filtersTable: Record<string, { status: number; body: unknown }> = {
    "2023|Ford|Transit-250|3.5": { status: 200, body: filtersTransit35 },
    "2023|Ford|Transit-250|Turbo 3.5": { status: 200, body: filtersTransitTurbo },
    "2018|Nissan|NV2500|4": { status: 422, body: filtersNv422 },
    "2018|Nissan|NV2500|5.6": { status: 422, body: filtersNv422 },
  };
  const fetchImpl = jest.fn(async (url: string) => {
    const parsed = new URL(String(url));
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    requests.push({ path: parsed.pathname, params });
    const respond = (status: number, body: unknown) =>
      ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

    if (parsed.pathname.endsWith("/makes")) {
      if (params.year === "2023") return respond(200, makes2023);
      if (params.year === "2018") return respond(200, makes2018);
      return respond(200, { success: true, makes: [] });
    }
    if (parsed.pathname.endsWith("/models")) {
      if (params.year === "2023" && params.make === "Ford") return respond(200, models2023Ford);
      if (params.year === "2018" && params.make === "Nissan") return respond(200, models2018Nissan);
      return respond(200, { success: true, models: [] });
    }
    if (parsed.pathname.endsWith("/engines")) {
      if (params.year === "2023" && params.make === "Ford" && params.model === "Transit-250") {
        return respond(200, enginesTransit);
      }
      if (params.year === "2018" && params.make === "Nissan" && params.model === "NV2500") {
        return respond(200, enginesNv2500);
      }
      return respond(200, { success: true, engines: [] });
    }
    if (parsed.pathname.endsWith("/service-spec") || parsed.pathname.endsWith("/filters")) {
      const { year, make, model, engine } = params;
      if (!year || !make || !model || !engine) {
        return respond(400, ENGINE_REQUIRED_400);
      }
      const key = `${year}|${make}|${model}|${engine}`;
      if (parsed.pathname.endsWith("/service-spec")) {
        const body = specTable[key];
        return body ? respond(200, body) : respond(404, NOT_FOUND);
      }
      const entry = filtersTable[key];
      return entry ? respond(entry.status, entry.body) : respond(404, NOT_FOUND);
    }
    throw new Error(`unexpected url ${url}`);
  });
  const specRequests = () =>
    requests.filter((r) => r.path.endsWith("/service-spec"));
  return { fetchImpl, requests, specRequests };
}

const TRANSIT_VALUES = {
  engine: "3.5",
  oilType: "5W-20",
  oilCapacity: "6.0 qt",
  oilFilter: "NAPA Gold 7502",
  drainPlugTorqueFtLbs: 19,
};

describe("resolveQldSpec against the real QLD contract (SW's real stored strings)", () => {
  it("resolves Dave's Transit as SW stores it: model 'Transit T250', engine null", async () => {
    const db = fakeDb();
    const qld = fakeQldServer();
    const result = await resolveQldSpec(
      db,
      { year: 2023, make: "Ford", model: "Transit T250", engine: null },
      { apiKey: "test-key", fetchImpl: qld.fetchImpl as never },
    );
    expect(result).toEqual({ status: "ok", values: TRANSIT_VALUES });
    // The wire never sent SW's spelling to the spec endpoint, and
    // the first (only) probe was the plain displacement token.
    for (const req of qld.specRequests()) {
      expect(req.params.model).toBe("Transit-250");
    }
    expect(qld.specRequests().map((r) => r.params.engine)).toEqual(["3.5"]);
    // One cache row, under the canonical key.
    expect([...db.rows.keys()]).toEqual(["2023|ford|transit-250|3.5"]);
    // A repeat lookup spends no further spec probes.
    const probesBefore = qld.specRequests().length;
    const second = await resolveQldSpec(
      db,
      { year: 2023, make: "Ford", model: "Transit T250", engine: null },
      { apiKey: "test-key", fetchImpl: qld.fetchImpl as never },
    );
    expect(second).toEqual({ status: "ok", values: TRANSIT_VALUES });
    expect(qld.specRequests().length).toBe(probesBefore);
  });

  it("resolves the NHTSA shape: make 'Ford Trucks', engine '3.5L 6-cyl'", async () => {
    const db = fakeDb();
    const qld = fakeQldServer();
    const result = await resolveQldSpec(
      db,
      { year: 2023, make: "Ford Trucks", model: "Transit T250", engine: "3.5L 6-cyl" },
      { apiKey: "test-key", fetchImpl: qld.fetchImpl as never },
    );
    expect(result).toEqual({ status: "ok", values: TRANSIT_VALUES });
    expect(qld.specRequests().map((r) => r.params.engine)).toEqual(["3.5"]);
    expect(qld.specRequests()[0].params.make).toBe("Ford");
  });

  it("avoids the oil trap: a 'Turbo 3.5' hint still lands on the oil-carrying '3.5' row", async () => {
    const db = fakeDb();
    const qld = fakeQldServer();
    const result = await resolveQldSpec(
      db,
      { year: 2023, make: "Ford", model: "Transit-250", engine: "Turbo 3.5" },
      { apiKey: "test-key", fetchImpl: qld.fetchImpl as never },
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.values.oilType).toBe("5W-20");
      expect(result.values.engine).toBe("3.5");
      expect(result.values.oilFilter).toBe("NAPA Gold 7502");
    }
    // The plain token was probed first and won; Turbo was never spent.
    expect(qld.specRequests().map((r) => r.params.engine)).toEqual(["3.5"]);
  });

  it("resolves the NV2500 from a decoded hint ('4.0L 6-cyl' → token '4'); the 422 filters refusal stays an honest blank", async () => {
    const db = fakeDb();
    const qld = fakeQldServer();
    const result = await resolveQldSpec(
      db,
      {
        year: 2018,
        make: "Nissan",
        model: "NV2500",
        engine: null,
        vin: "1N6BF0KY7JN800080",
      },
      {
        apiKey: "test-key",
        fetchImpl: qld.fetchImpl as never,
        decodeEngineHint: async () => "4.0L 6-cyl",
      },
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.values).toEqual({
        engine: "4",
        oilType: "5W-30",
        oilCapacity: "5.4 qt",
        drainPlugTorqueFtLbs: 25,
      });
      expect(result.values.oilFilter).toBeUndefined();
    }
    expect(qld.specRequests().map((r) => r.params.engine)).toEqual(["4"]);
  });

  it("an unknown vehicle stays honest: engine_required, no values, no cache row", async () => {
    const db = fakeDb();
    const qld = fakeQldServer();
    const result = await resolveQldSpec(
      db,
      { year: 2030, make: "Ford", model: "Nonexistent", engine: null },
      { apiKey: "test-key", fetchImpl: qld.fetchImpl as never },
    );
    expect(result).toEqual({ status: "engine_required", engines: [] });
    expect(db.rows.size).toBe(0);
  });
});
