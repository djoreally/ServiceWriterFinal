/**
 * VIN-correction reconciliation — behavior tests (Ty's requirement,
 * 2026-11-13; the Brennan precedent: a capacity mismatch priced a
 * job wrong and the invoice had to be fixed by hand).
 *
 * A VIN change must re-resolve identity + specs, replace the old
 * VIN's working spec, re-check the price basis and FLAG any delta
 * (never charge it, never write an invoice), and persist the
 * correction on the job's audit trail.
 */
import {
  reconcileVinCorrection,
  VIN_CORRECTION_ACTION,
} from "../vin-correction";

const WS = "ws-vin-1";
const APPT = "appt-vin-1";
const VEH = "veh-vin-1";
const USER = "user-tech-1";
const OLD_VIN = "1FTBR1Y86PKB50000";
const NEW_VIN = "1FTBR1Y86PKB51521";

type Row = Record<string, unknown>;

interface Write {
  table: string;
  op: "insert" | "update";
  payload: Row;
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private limitN: number | null = null;

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
  filter(expr: string, _op: string, value: unknown) {
    if (expr === "metadata->>appointment_id") {
      this.filters.push(
        (row) => (row.metadata as Row | undefined)?.appointment_id === value,
      );
    }
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  async maybeSingle() {
    return { data: this.run()[0] ?? null, error: null };
  }
  async insert(row: Row) {
    this.db.recordWrite(this.table, "insert", row);
    (this.db.tables[this.table] ??= []).push({ ...row });
    return { data: null, error: null };
  }
  update(patch: Row) {
    const db = this.db;
    const table = this.table;
    const filters: Array<(row: Row) => boolean> = [];
    const chain = {
      eq(col: string, value: unknown) {
        filters.push((row) => row[col] === value);
        return chain;
      },
      then(onFulfilled: (value: { data: null; error: null }) => unknown) {
        for (const row of db.tables[table] ?? []) {
          if (filters.every((f) => f(row))) {
            db.recordWrite(table, "update", patch);
            Object.assign(row, patch);
          }
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      },
    };
    return chain;
  }
  private run(): Row[] {
    let rows = [...(this.db.tables[this.table] ?? [])];
    for (const filter of this.filters) rows = rows.filter(filter);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }
  then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.run(), error: null }).then(onFulfilled);
  }
}

class FakeDb {
  tables: Record<string, Row[]>;
  writes: Write[] = [];
  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }
  from(table: string) {
    return new FakeQuery(this, table);
  }
  recordWrite(table: string, op: Write["op"], payload: Row) {
    this.writes.push({ table, op, payload });
  }
  writesTo(table: string): Write[] {
    return this.writes.filter((w) => w.table === table);
  }
}

function seedDb(learnedCapacity: string | null = "5.0 qt"): FakeDb {
  return new FakeDb({
    vehicles: [
      {
        id: VEH,
        workspace_id: WS,
        vin: OLD_VIN,
        year: 2023,
        make: "Ford",
        model: "Transit T250",
      },
    ],
    vehicle_service_specs: [
      {
        vehicle_id: VEH,
        workspace_id: WS,
        engine: null,
        oil_type: null,
        oil_capacity: learnedCapacity,
        oil_filter: null,
        metadata: { drain_plug_torque_ft_lbs: 15 },
        updated_at: "2026-11-12T00:00:00.000Z",
      },
    ],
    workspace_settings: [{ workspace_id: WS, oil_price_per_quart: 14 }],
    invoices: [
      { id: "inv-1", workspace_id: WS, metadata: { appointment_id: APPT } },
    ],
    audit_events: [],
  });
}

const decodeTransit = async (vin: string) => ({
  success: true as const,
  vehicle: {
    vin,
    year: 2023,
    make: "Ford",
    model: "Transit-250",
    engine: "3.5L 6-cyl",
  },
});

const resolveTransit = async () => ({
  status: "ok" as const,
  values: {
    engine: "3.5",
    oilType: "5W-20",
    oilCapacity: "6.0 qt",
    oilFilter: "NAPA Gold 7502",
    drainPlugTorqueFtLbs: 19,
  },
});

const input = {
  workspaceId: WS,
  appointmentId: APPT,
  vehicleId: VEH,
  oldVin: OLD_VIN,
  newVin: NEW_VIN,
  actorUserId: USER,
};

describe("reconcileVinCorrection", () => {
  it("re-resolves identity + specs, replaces the working spec, flags the price delta, and audits the correction", async () => {
    const db = seedDb();
    const result = await reconcileVinCorrection(db as never, input, {
      decodeVin: decodeTransit,
      resolveSpec: resolveTransit as never,
      now: () => new Date("2026-11-13T20:45:00.000Z"),
    });

    // Identity from the corrected VIN.
    expect(result.identity).toEqual({
      vin: NEW_VIN,
      year: 2023,
      make: "Ford",
      model: "Transit-250",
      engine: "3.5L 6-cyl",
    });
    const vehicle = db.tables.vehicles[0];
    expect(vehicle.make).toBe("Ford");
    expect(vehicle.model).toBe("Transit-250");

    // Specs re-resolved; the working spec row now carries them,
    // including the torque in metadata (the old VIN's 15 is gone).
    expect(result.specs).toEqual({
      engine: "3.5",
      oilType: "5W-20",
      oilCapacity: "6.0 qt",
      oilFilter: "NAPA Gold 7502",
      drainPlugTorqueFtLbs: 19,
    });
    const learned = db.tables.vehicle_service_specs[0];
    expect(learned.oil_capacity).toBe("6.0 qt");
    expect(learned.oil_type).toBe("5W-20");
    expect(learned.oil_filter).toBe("NAPA Gold 7502");
    expect(learned.engine).toBe("3.5");
    expect((learned.metadata as Row).drain_plug_torque_ft_lbs).toBe(19);

    // Price basis: 5.0 qt priced 0 extra quarts; the corrected
    // 6.0 qt needs 1 — a +$14 delta, FLAG-ONLY, invoice untouched.
    expect(result.priceBasisDelta).toEqual({
      oldCapacity: "5.0 qt",
      newCapacity: "6.0 qt",
      oldExtraQuarts: 0,
      newExtraQuarts: 1,
      deltaQuarts: 1,
      pricePerQuart: 14,
      deltaAmount: 14,
      invoiceIssued: true,
      action: "flag_only",
    });
    expect(db.writesTo("invoices")).toEqual([]);

    // The correction record + the audit trail entry on the job.
    expect(result.correctionRecord).toEqual({
      action: VIN_CORRECTION_ACTION,
      appointmentId: APPT,
      vehicleId: VEH,
      oldVin: OLD_VIN,
      newVin: NEW_VIN,
      correctedBy: USER,
      correctedAt: "2026-11-13T20:45:00.000Z",
    });
    const audit = db.tables.audit_events;
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe(VIN_CORRECTION_ACTION);
    expect(audit[0].entity_type).toBe("appointment");
    expect(audit[0].entity_id).toBe(APPT);
    expect((audit[0].before_data as Row).vin).toBe(OLD_VIN);
    expect((audit[0].after_data as Row).vin).toBe(NEW_VIN);
  });

  it("answers no delta when the corrected specs price the same basis", async () => {
    const db = seedDb("6.0 qt");
    const result = await reconcileVinCorrection(db as never, input, {
      decodeVin: decodeTransit,
      resolveSpec: resolveTransit as never,
    });
    expect(result.priceBasisDelta).toBeNull();
    expect(result.specs.oilCapacity).toBe("6.0 qt");
    expect(db.tables.audit_events).toHaveLength(1);
    expect(db.writesTo("invoices")).toEqual([]);
  });

  it("fails soft when the decode cannot resolve the VIN: stored identity stands, audit still lands", async () => {
    const db = seedDb();
    const result = await reconcileVinCorrection(db as never, input, {
      decodeVin: async () => ({ success: false as const, error: "Vehicle not found" }),
      resolveSpec: resolveTransit as never,
    });
    expect(result.identity.year).toBe(2023);
    expect(result.identity.make).toBe("Ford");
    expect(result.identity.model).toBe("Transit T250");
    expect(result.correctionRecord.newVin).toBe(NEW_VIN);
    expect(db.tables.audit_events).toHaveLength(1);
  });
});
