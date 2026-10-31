/**
 * B4 — booking-configuration assembly (truth rows T-2 / T-3 / T-4 / T-18).
 *
 * Builds the configuration the appointment-detail data path serves:
 *
 *   - Vehicle membership is the UNION of every partial source — the
 *     booking snapshot's vehicles, the vehicles pinned on
 *     `appointment_items` (metadata.vehicle_id, the same pin the list's
 *     service-lines projection reads), the vehicles on the job's
 *     invoice lines, and `appointments.vehicle_id`. List and detail
 *     therefore agree about how many vehicles a job has (F-3: Laurie
 *     Buckman's Crosstrek existed only as invoice lines and was
 *     invisible on detail).
 *   - Each vehicle's oil spec is the T-2 merge (learned working spec →
 *     catalog resolution → immutable snapshot as provenance), composed
 *     by the pure module `@/lib/vehicle-spec-merge`, with a per-vehicle
 *     `specStatus` and per-field `specSources` on the response. The
 *     stored snapshot is never mutated.
 *   - Each vehicle block groups its own service lines (the canonical
 *     appointment_items pinned to it), so money stays per-vehicle.
 *
 * Every enrichment read is best-effort, mirroring the endpoint's
 * existing mileage enrichment and B2's resolvers: a failed lookup logs
 * and degrades to the sources that did answer — it never fails the
 * configuration read itself. The catalog resolver RPCs are deliberately
 * not consulted: their repo definitions are reverse-engineered stubs
 * (production bodies unverified), while `vehicle_specifications` is the
 * typed, grounded catalog source.
 */
import type {
  AppointmentBookingConfiguration,
  BookingVehicleConfiguration,
} from "@/lib/booking-configuration";
import {
  mergeOilSpec,
  orderedUnion,
  resolveCatalogOilValues,
  type OilSpecValues,
} from "@/lib/vehicle-spec-merge";

interface AppointmentRow {
  id: string;
  workspace_id: string;
  vehicle_id: string | null;
  updated_at?: unknown;
  created_at?: unknown;
  starts_at?: unknown;
}

interface VehicleRow {
  id: string;
  year: unknown;
  make: unknown;
  model: unknown;
  vin: unknown;
  license_plate: unknown;
  mileage: unknown;
}

interface ItemRow {
  id: unknown;
  description: unknown;
  quantity: unknown;
  unit_price: unknown;
  metadata: unknown;
}

type SnapshotEntry = Record<string, unknown> & {
  clientVehicleId?: unknown;
  vehicle?: Record<string, unknown>;
  oil?: Record<string, unknown>;
  services?: unknown;
};

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeVin(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function yearNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function attempt<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[B4] ${label} failed`, error);
    return fallback;
  }
}

export async function buildBookingConfiguration(
  supabase: any,
  appointment: AppointmentRow,
  snapshot: Record<string, unknown> | null,
): Promise<AppointmentBookingConfiguration | null> {
  const workspaceId = appointment.workspace_id;
  const db = supabase as any;

  const snapshotEntries: SnapshotEntry[] =
    snapshot && Array.isArray(snapshot.vehicles)
      ? (snapshot.vehicles as SnapshotEntry[])
      : [];

  // -- The job's canonical service lines (items + their vehicle pins). --
  const items = await attempt(
    "appointment_items lookup",
    async () => {
      const { data, error } = await db
        .from("appointment_items")
        .select("id,description,quantity,unit_price,sort_order,created_at,metadata")
        .eq("workspace_id", workspaceId)
        .eq("appointment_id", appointment.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    [] as ItemRow[],
  );
  const itemPinOf = (item: ItemRow): string | null =>
    textOrUndefined(metadataObject(item.metadata).vehicle_id) ?? null;
  const itemPinsInOrder = items
    .map(itemPinOf)
    .filter((id): id is string => Boolean(id));

  // -- Vehicles that exist only on the job's invoice lines (F-3). --
  const invoiceVehicleIds = await attempt(
    "invoice vehicle lookup",
    async () => {
      const { data: invoices, error: invoiceError } = await db
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .filter("metadata->>appointment_id", "eq", appointment.id);
      if (invoiceError) throw invoiceError;
      const invoiceIds = ((invoices ?? []) as Array<{ id: unknown }>)
        .map((row) => textOrUndefined(row.id))
        .filter((id): id is string => Boolean(id));
      if (!invoiceIds.length) return [] as string[];
      const { data: lines, error: linesError } = await db
        .from("invoice_lines")
        .select("vehicle_id")
        .eq("workspace_id", workspaceId)
        .in("invoice_id", invoiceIds)
        .not("vehicle_id", "is", null);
      if (linesError) throw linesError;
      return orderedUnion(
        ((lines ?? []) as Array<{ vehicle_id: unknown }>).map((row) =>
          textOrUndefined(row.vehicle_id),
        ),
      );
    },
    [] as string[],
  );

  // -- Live vehicle rows for every candidate id + snapshot VINs. --
  const snapshotClientIds = snapshotEntries
    .map((entry) => textOrUndefined(entry.clientVehicleId))
    .filter((id): id is string => Boolean(id));
  const candidateIds = orderedUnion(
    [appointment.vehicle_id],
    itemPinsInOrder,
    invoiceVehicleIds,
    snapshotClientIds,
  );
  const snapshotVins = snapshotEntries
    .map((entry) => textOrUndefined(entry.vehicle?.vin))
    .filter((vin): vin is string => Boolean(vin));

  const vehiclesById = new Map<string, VehicleRow>();
  const addVehicleRows = (rows: VehicleRow[]) => {
    for (const row of rows) {
      if (row?.id && !vehiclesById.has(String(row.id))) {
        vehiclesById.set(String(row.id), row);
      }
    }
  };
  if (candidateIds.length) {
    addVehicleRows(
      await attempt(
        "vehicles by id lookup",
        async () => {
          const { data, error } = await db
            .from("vehicles")
            .select("id,year,make,model,vin,license_plate,mileage")
            .eq("workspace_id", workspaceId)
            .in("id", candidateIds);
          if (error) throw error;
          return (data ?? []) as VehicleRow[];
        },
        [] as VehicleRow[],
      ),
    );
  }
  if (snapshotVins.length) {
    addVehicleRows(
      await attempt(
        "vehicles by vin lookup",
        async () => {
          const { data, error } = await db
            .from("vehicles")
            .select("id,year,make,model,vin,license_plate,mileage")
            .eq("workspace_id", workspaceId)
            .in("vin", snapshotVins);
          if (error) throw error;
          return (data ?? []) as VehicleRow[];
        },
        [] as VehicleRow[],
      ),
    );
  }
  const vehicleByVin = new Map<string, VehicleRow>();
  for (const row of vehiclesById.values()) {
    const vin = normalizeVin(row.vin);
    if (vin && !vehicleByVin.has(vin)) vehicleByVin.set(vin, row);
  }

  // -- Match each snapshot entry to its live vehicle row (id → VIN →
  //    unique year/make/model), so learned specs can join it. --
  const matchSnapshotVehicle = (entry: SnapshotEntry): VehicleRow | null => {
    const clientId = textOrUndefined(entry.clientVehicleId);
    if (clientId && vehiclesById.has(clientId)) return vehiclesById.get(clientId)!;
    const vin = normalizeVin(entry.vehicle?.vin);
    if (vin && vehicleByVin.has(vin)) return vehicleByVin.get(vin)!;
    const year = yearNumber(entry.vehicle?.year);
    const make = normalizeText(entry.vehicle?.make);
    const model = normalizeText(entry.vehicle?.model);
    if (year && make && model) {
      const matches = [...vehiclesById.values()].filter(
        (row) =>
          yearNumber(row.year) === year &&
          normalizeText(row.make) === make &&
          normalizeText(row.model) === model,
      );
      if (matches.length === 1) return matches[0];
    }
    return null;
  };
  const snapshotLiveIds = snapshotEntries.map(
    (entry) => matchSnapshotVehicle(entry)?.id ?? null,
  );

  // -- The union: snapshot order first, then item pins, invoice pins,
  //    and the appointment FK (T-4, read across every source). --
  const unionIds = orderedUnion(
    snapshotLiveIds,
    itemPinsInOrder,
    invoiceVehicleIds,
    [appointment.vehicle_id],
  );

  // -- Learned working specs for every union vehicle (newest first per
  //    vehicle — the documents path reads them the same way). --
  const learnedByVehicle = new Map<string, OilSpecValues>();
  if (unionIds.length) {
    const specRows = await attempt(
      "vehicle_service_specs lookup",
      async () => {
        const { data, error } = await db
          .from("vehicle_service_specs")
          .select("vehicle_id,engine,oil_type,oil_capacity,oil_filter,updated_at")
          .eq("workspace_id", workspaceId)
          .in("vehicle_id", unionIds)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
      },
      [] as Array<Record<string, unknown>>,
    );
    for (const row of specRows) {
      const vehicleId = textOrUndefined(row.vehicle_id);
      if (!vehicleId || learnedByVehicle.has(vehicleId)) continue;
      learnedByVehicle.set(vehicleId, {
        engine: textOrUndefined(row.engine),
        oilType: textOrUndefined(row.oil_type),
        oilCapacity: textOrUndefined(row.oil_capacity),
        oilFilter: textOrUndefined(row.oil_filter),
      });
    }
  }

  // -- Catalog candidates per distinct year/make/model (global
  //    reference table; rows are matched exactly in code). --
  const catalogCache = new Map<string, Array<Record<string, unknown>>>();
  const catalogFor = async (
    year: unknown,
    make: unknown,
    model: unknown,
  ): Promise<Array<Record<string, unknown>>> => {
    const yearNum = yearNumber(year);
    const makeText = textOrUndefined(make);
    const modelText = textOrUndefined(model);
    if (!yearNum || !makeText || !modelText) return [];
    const key = `${yearNum}|${normalizeText(makeText)}|${normalizeText(modelText)}`;
    const cached = catalogCache.get(key);
    if (cached) return cached;
    const rows = await attempt(
      "vehicle_specifications lookup",
      async () => {
        const { data, error } = await db
          .from("vehicle_specifications")
          .select("year,make,model,engine,oil_type,oil_capacity,oil_filter")
          .eq("year", yearNum)
          .ilike("make", makeText)
          .ilike("model", modelText)
          .limit(25);
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).filter(
          (row) =>
            yearNumber(row.year) === yearNum &&
            normalizeText(row.make) === normalizeText(makeText) &&
            normalizeText(row.model) === normalizeText(modelText),
        );
      },
      [] as Array<Record<string, unknown>>,
    );
    catalogCache.set(key, rows);
    return rows;
  };

  // -- Service lines grouped per vehicle (canonical items win over the
  //    snapshot's booked copy; unpinned lines join only a single-vehicle
  //    job, where the grouping is unambiguous). --
  const servicesFor = (vehicleId: string | null): BookingVehicleConfiguration["services"] => {
    const pinned = items.filter((item) => itemPinOf(item) === vehicleId && vehicleId);
    const lines = pinned.length
      ? pinned
      : unionIds.length === 1 && vehicleId === unionIds[0]
        ? items
        : [];
    if (!lines.length) return undefined;
    return lines.map((item) => ({
      id: String(item.id ?? ""),
      name: textOrUndefined(item.description) ?? "",
      price: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 1),
    }));
  };

  const mergedOilFor = async (
    live: VehicleRow | null,
    snapshotOil: Record<string, unknown> | undefined,
    ymm: { year: unknown; make: unknown; model: unknown },
  ) => {
    const learned = live ? learnedByVehicle.get(String(live.id)) : undefined;
    const engineHint = learned?.engine ?? textOrUndefined(snapshotOil?.engine) ?? null;
    const candidates = await catalogFor(ymm.year, ymm.make, ymm.model);
    const catalog = resolveCatalogOilValues(
      candidates.map((row) => ({
        engine: textOrUndefined(row.engine),
        oilType: textOrUndefined(row.oil_type),
        oilCapacity: textOrUndefined(row.oil_capacity),
        oilFilter: textOrUndefined(row.oil_filter),
      })),
      engineHint,
    );
    return mergeOilSpec({
      learned,
      catalog,
      snapshot: snapshotOil
        ? {
            engine: textOrUndefined(snapshotOil.engine),
            oilType: textOrUndefined(snapshotOil.oilType),
            oilCapacity: textOrUndefined(snapshotOil.oilCapacity),
            oilFilter: textOrUndefined(snapshotOil.oilFilter),
            capacitySource: snapshotOil.capacitySource as
              | "db"
              | "ai"
              | "manual"
              | undefined,
          }
        : null,
    });
  };

  // -- Assemble the vehicle blocks: snapshot entries first (their
  //    booked extras — tire, detailing, package — ride along intact),
  //    then union vehicles the snapshot never knew. --
  const vehicles: BookingVehicleConfiguration[] = [];
  const coveredIds = new Set<string>();

  for (const [index, entry] of snapshotEntries.entries()) {
    const live = snapshotLiveIds[index]
      ? vehiclesById.get(snapshotLiveIds[index]!)
      : null;
    if (live) coveredIds.add(String(live.id));
    const snapshotVehicle = entry.vehicle ?? {};
    const merged = await mergedOilFor(
      live ?? null,
      entry.oil,
      {
        year: live?.year ?? snapshotVehicle.year,
        make: live?.make ?? snapshotVehicle.make,
        model: live?.model ?? snapshotVehicle.model,
      },
    );
    const liveMileage = live ? Number(live.mileage) : NaN;
    const vehicleBlock: Record<string, unknown> = { ...snapshotVehicle };
    if (vehicleBlock.mileage == null && Number.isFinite(liveMileage) && liveMileage > 0) {
      vehicleBlock.mileage = liveMileage;
    }
    if (!textOrUndefined(vehicleBlock.vin) && textOrUndefined(live?.vin)) {
      vehicleBlock.vin = textOrUndefined(live?.vin);
    }
    if (!textOrUndefined(vehicleBlock.licensePlate) && textOrUndefined(live?.license_plate)) {
      vehicleBlock.licensePlate = textOrUndefined(live?.license_plate);
    }
    const services = servicesFor(live ? String(live.id) : null);
    vehicles.push({
      ...(entry as unknown as BookingVehicleConfiguration),
      vehicle: vehicleBlock as unknown as BookingVehicleConfiguration["vehicle"],
      ...(services ? { services } : {}),
      ...(merged.oil ? { oil: merged.oil } : {}),
      specStatus: merged.specStatus,
      specSources: merged.specSources,
    });
  }

  for (const vehicleId of unionIds) {
    if (coveredIds.has(vehicleId)) continue;
    const live = vehiclesById.get(vehicleId);
    if (!live) continue;
    coveredIds.add(vehicleId);
    const merged = await mergedOilFor(live, undefined, {
      year: live.year,
      make: live.make,
      model: live.model,
    });
    const mileage = Number(live.mileage);
    const services = servicesFor(vehicleId);
    vehicles.push({
      clientVehicleId: vehicleId,
      vehicle: {
        year: String(live.year || ""),
        make: String(live.make || "Unknown"),
        model: String(live.model || "Unknown"),
        vin: textOrUndefined(live.vin),
        licensePlate: textOrUndefined(live.license_plate),
        ...(Number.isFinite(mileage) && mileage > 0 ? { mileage } : {}),
      },
      ...(services ? { services } : {}),
      ...(merged.oil ? { oil: merged.oil } : {}),
      specStatus: merged.specStatus,
      specSources: merged.specSources,
    });
  }

  if (!vehicles.length) return null;

  if (snapshot) {
    return {
      ...(snapshot as unknown as AppointmentBookingConfiguration),
      vehicles,
    };
  }
  return {
    schemaVersion: 2,
    capturedAt:
      textOrUndefined(appointment.updated_at) ||
      textOrUndefined(appointment.created_at) ||
      textOrUndefined(appointment.starts_at) ||
      new Date(0).toISOString(),
    vehicles,
  };
}
