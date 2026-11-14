/**
 * Spec backfill — tests.
 *
 * The Ariane shape is Ty's screenshot (2026-11-13): a 2024 Chevrolet
 * Suburban job with NO VIN recorded, every spec "Not recorded",
 * even though year/make/model + the booked engine resolve through
 * the now-live QLD connection. The backfill must fill that vehicle's
 * learned tier from the snapshot engine — and must refuse to guess
 * when nothing settles the engine.
 */
import { runSpecBackfill, settleEngine } from "../spec-backfill";
import type { QldSpecResult } from "../spec-provider";

const WS = "11111111-1111-4111-8111-111111111111";
const SUBURBAN_ID = "22222222-2222-4222-8222-222222222222";

interface FakeState {
  vehicles: Array<Record<string, unknown>>;
  specs: Map<string, Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  upserts: Array<Record<string, unknown>>;
}

function key(workspaceId: string, vehicleId: string) {
  return `${workspaceId}|${vehicleId}`;
}

function fakeDb(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    vehicles: seed.vehicles ?? [],
    specs: seed.specs ?? new Map(),
    appointments: seed.appointments ?? [],
    upserts: [],
  };
  const db = {
    state,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let range: [number, number] | null = null;
      let limitN: number | null = null;
      const eqVal = (col: string) => filters.find(([c]) => c === col)?.[1];
      const resolveList = () => {
        if (table === "vehicles") {
          let rows = state.vehicles.filter(
            (row) => !eqVal("workspace_id") || row.workspace_id === eqVal("workspace_id"),
          );
          rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return rows;
        }
        if (table === "appointments") {
          let rows = state.appointments.filter(
            (row) =>
              row.workspace_id === eqVal("workspace_id") &&
              row.vehicle_id === eqVal("vehicle_id"),
          );
          rows = [...rows].sort((a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)),
          );
          if (limitN) rows = rows.slice(0, limitN);
          return rows;
        }
        throw new Error(`unexpected list table ${table}`);
      };
      const query: Record<string, unknown> = {
        select: () => query,
        eq: (col: string, value: unknown) => {
          filters.push([col, value]);
          return query;
        },
        order: () => query,
        range: (a: number, b: number) => {
          range = [a, b];
          return query;
        },
        limit: (n: number) => {
          limitN = n;
          return query;
        },
        maybeSingle: async () => {
          if (table !== "vehicle_service_specs") throw new Error(`unexpected single table ${table}`);
          const row = state.specs.get(key(String(eqVal("workspace_id")), String(eqVal("vehicle_id"))));
          return { data: row ?? null, error: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          state.upserts.push(row);
          state.specs.set(key(String(row.workspace_id), String(row.vehicle_id)), { ...row });
          return { data: null, error: null };
        },
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          resolve({ data: resolveList(), error: null }),
      };
      return query;
    },
  };
  return db;
}

const suburban = {
  id: SUBURBAN_ID,
  workspace_id: WS,
  vin: null,
  year: 2024,
  make: "Chevrolet",
  model: "Suburban",
};

function snapshotAppointment(engine: string) {
  return {
    workspace_id: WS,
    vehicle_id: SUBURBAN_ID,
    created_at: "2026-11-13T12:00:00Z",
    metadata: {
      booking_configuration: {
        vehicles: [
          {
            clientVehicleId: SUBURBAN_ID,
            vehicle: { year: 2024, make: "Chevrolet", model: "Suburban", vin: null },
            oil: { engine },
          },
        ],
      },
    },
  };
}

const okSpec =
  (values: Record<string, unknown>) =>
  async (): Promise<QldSpecResult> =>
    ({ status: "ok", values }) as QldSpecResult;

describe("settleEngine", () => {
  it("settles on an exact hint match", () => {
    expect(settleEngine(["Turbo 3.5", "3.7"], [{ source: "stored", value: "Turbo 3.5" }]))
      .toEqual({ engine: "Turbo 3.5", source: "stored" });
  });

  it("settles a human engine string on the plain displacement token (the oil row)", () => {
    expect(settleEngine(["3.5", "Turbo 3.5"], [{ source: "snapshot", value: "3.5L 6-cyl" }]))
      .toEqual({ engine: "3.5", source: "snapshot" });
  });

  it("settles when the hint token singles out one engine", () => {
    expect(settleEngine(["5.3", "6.2"], [{ source: "decode", value: "5.3L V8" }]))
      .toEqual({ engine: "5.3", source: "decode" });
  });

  it("refuses several engines with no settling evidence", () => {
    expect(settleEngine(["5.3", "6.2"], [])).toBeNull();
  });

  it("settles a lone hierarchy engine with no hints at all", () => {
    expect(settleEngine(["4"], [])).toEqual({ engine: "4", source: "hierarchy" });
  });

  it("trusts a sourced hint when the hierarchy cannot be read", () => {
    expect(settleEngine(null, [{ source: "snapshot", value: "5.3L V8" }]))
      .toEqual({ engine: "5.3L V8", source: "snapshot" });
  });
});

describe("runSpecBackfill", () => {
  it("the Ariane shape: VIN-less Suburban fills from the BOOKED snapshot engine", async () => {
    const db = fakeDb({ vehicles: [suburban], appointments: [snapshotAppointment("5.3L V8")] });
    const seen: Array<Record<string, unknown>> = [];
    const report = await runSpecBackfill(db as never, {
      resolveSpec: async (_db: unknown, input: Record<string, unknown>) => {
        seen.push(input);
        return {
          status: "ok",
          values: {
            engine: "5.3",
            oilType: "0W-20",
            oilCapacity: "8.0 qt",
            oilFilter: "PF63",
            drainPlugTorqueFtLbs: 18,
          },
        } as QldSpecResult;
      },
      fetchEngines: async () => ["5.3", "6.2"],
      decodeVin: null,
      now: () => new Date("2026-11-14T03:30:00Z"),
    });
    expect(report).toMatchObject({ scanned: 1, withBlanks: 1, filled: 1, ambiguousEngine: 0 });
    // The resolver was handed the snapshot-settled canonical engine.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ year: 2024, make: "Chevrolet", model: "Suburban", engine: "5.3", vin: null });
    const row = db.state.specs.get(key(WS, SUBURBAN_ID));
    expect(row).toMatchObject({
      engine: "5.3",
      oil_type: "0W-20",
      oil_capacity: "8.0 qt",
      oil_filter: "PF63",
      source: "qld_catalog_backfill",
    });
    expect((row?.metadata as Record<string, unknown>).drain_plug_torque_ft_lbs).toBe(18);
    expect((row?.metadata as Record<string, unknown>).spec_backfill).toMatchObject({
      source: "qld_catalog_backfill",
      engine_source: "snapshot",
    });
  });

  it("the same job WITHOUT a snapshot engine and several QLD engines: honest ambiguity, nothing written", async () => {
    const db = fakeDb({ vehicles: [suburban], appointments: [] });
    let resolveCalls = 0;
    const report = await runSpecBackfill(db as never, {
      resolveSpec: async () => {
        resolveCalls += 1;
        return { status: "ok", values: {} } as QldSpecResult;
      },
      fetchEngines: async () => ["5.3", "6.2"],
      decodeVin: null,
    });
    expect(report).toMatchObject({ scanned: 1, filled: 0, ambiguousEngine: 1 });
    expect(resolveCalls).toBe(0);
    expect(db.state.upserts).toHaveLength(0);
    expect(db.state.specs.size).toBe(0);
  });

  it("blanks only: a learned oil filter survives a backfill that would change it", async () => {
    const specs = new Map([
      [
        key(WS, SUBURBAN_ID),
        {
          engine: "5.3",
          oil_type: null,
          oil_capacity: null,
          oil_filter: "STP S6607",
          source: "service_writer",
          metadata: {},
        },
      ],
    ]);
    const db = fakeDb({ vehicles: [suburban], specs });
    const report = await runSpecBackfill(db as never, {
      resolveSpec: okSpec({ engine: "5.3", oilType: "0W-20", oilCapacity: "8.0 qt", oilFilter: "NAPA Gold 7055" }),
      fetchEngines: async () => ["5.3", "6.2"],
      decodeVin: null,
    });
    expect(report.filled).toBe(1);
    const row = db.state.specs.get(key(WS, SUBURBAN_ID));
    expect(row).toMatchObject({
      oil_filter: "STP S6607",
      oil_type: "0W-20",
      oil_capacity: "8.0 qt",
      source: "service_writer",
    });
  });

  it("is idempotent: the second run fills nothing and writes nothing", async () => {
    const db = fakeDb({ vehicles: [suburban], appointments: [snapshotAppointment("5.3L V8")] });
    const deps = {
      resolveSpec: okSpec({ engine: "5.3", oilType: "0W-20", oilCapacity: "8.0 qt", oilFilter: "PF63" }),
      fetchEngines: async () => ["5.3", "6.2"],
      decodeVin: null,
    };
    const first = await runSpecBackfill(db as never, deps);
    const second = await runSpecBackfill(db as never, deps);
    expect(first.filled).toBe(1);
    expect(second).toMatchObject({ filled: 0, alreadyPresent: 1 });
    expect(db.state.upserts).toHaveLength(1);
  });

  it("dry-run counts the fill but writes nothing", async () => {
    const db = fakeDb({ vehicles: [suburban], appointments: [snapshotAppointment("5.3L V8")] });
    const report = await runSpecBackfill(db as never, {
      resolveSpec: okSpec({ engine: "5.3", oilType: "0W-20", oilCapacity: "8.0 qt", oilFilter: "PF63" }),
      fetchEngines: async () => ["5.3", "6.2"],
      decodeVin: null,
      dryRun: true,
    });
    expect(report).toMatchObject({ filled: 1, dryRun: true });
    expect(db.state.upserts).toHaveLength(0);
  });

  it("a fully populated learned row is already_present and never resolved", async () => {
    const specs = new Map([
      [
        key(WS, SUBURBAN_ID),
        { engine: "5.3", oil_type: "0W-20", oil_capacity: "8.0 qt", oil_filter: "PF63", source: "service_writer", metadata: {} },
      ],
    ]);
    const db = fakeDb({ vehicles: [suburban], specs });
    let resolveCalls = 0;
    const report = await runSpecBackfill(db as never, {
      resolveSpec: async () => {
        resolveCalls += 1;
        return { status: "ok", values: {} } as QldSpecResult;
      },
      fetchEngines: async () => ["5.3"],
      decodeVin: null,
    });
    expect(report).toMatchObject({ alreadyPresent: 1, withBlanks: 0 });
    expect(resolveCalls).toBe(0);
  });

  it("a lone hierarchy engine settles a VIN-less vehicle with no snapshot", async () => {
    const nissan = {
      id: "33333333-3333-4333-8333-333333333333",
      workspace_id: WS,
      vin: null,
      year: 2018,
      make: "Nissan",
      model: "NV2500",
    };
    const db = fakeDb({ vehicles: [nissan] });
    const report = await runSpecBackfill(db as never, {
      resolveSpec: okSpec({ engine: "4", oilType: "5W-30", oilCapacity: "5.4 qt" }),
      fetchEngines: async () => ["4"],
      decodeVin: null,
    });
    expect(report.filled).toBe(1);
    const row = db.state.specs.get(key(WS, nissan.id));
    expect((row?.metadata as Record<string, unknown>).spec_backfill).toMatchObject({
      engine_source: "hierarchy",
    });
  });
});
