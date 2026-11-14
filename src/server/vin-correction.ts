/**
 * VIN-correction reconciliation (Ty's requirement, 2026-11-13).
 *
 * A VIN correction on a job (PATCH /v1/tech-app/jobs/:id/vehicle)
 * is NOT a silent field edit. The VIN is the vehicle's identity:
 * when it changes, everything derived from the old VIN is wrong
 * until it is re-derived. The Brennan precedent: a capacity
 * mismatch (7 qt car priced at 5) produced a wrong invoice that
 * had to be corrected by hand on Nov 11. So, on a VIN change,
 * this module reconciles downstream, in order:
 *
 *   1. IDENTITY re-resolves from the corrected VIN (NHTSA decode
 *      → year/make/model/engine) and lands on the vehicles row.
 *   2. SPECS re-resolve through the QLD resolver for the new
 *      identity and REPLACE the vehicle's working spec
 *      (vehicle_service_specs): the old VIN's values are
 *      overwritten field by field — answered fields take the new
 *      values, unanswered fields are cleared — so the old specs
 *      cannot linger anywhere they are read from. (The booking
 *      snapshot is provenance and is never mutated; the learned
 *      tier outranks it in every merge, so overwritten learned
 *      values are what reads now see. The qld_spec_cache is keyed
 *      by canonical YMME, not by VIN, so no row in it belongs to
 *      the old VIN.)
 *   3. PRICE BASIS is re-checked, never repriced: extra quarts
 *      are recomputed from the old and new capacities at the
 *      workspace's per-quart price. A difference is returned as a
 *      flagged delta for the owner — this module NEVER writes an
 *      invoice, an appointment item, or a quote, issued or not.
 *   4. AUDIT: the correction is persisted on the job's audit
 *      trail (audit_events: old VIN → new VIN, actor, timestamp,
 *      before/after) and returned to the caller.
 *
 * Every step fails soft: the VIN write already landed before this
 * runs, and a reconciliation failure must never turn a saved
 * correction into an error. Partial results answer with the
 * fields that did resolve.
 */
import { calculateExtraOilQuarts } from "@/lib/oilCapacity";
import { recordOperationalAudit } from "./audit";
import {
  decodeVinWithNhtsa,
  type VinDecodeResult,
} from "./hono/lib/vin-decode";
import { resolveQldSpec, type QldSpecValues } from "./qld/spec-provider";

export const VIN_CORRECTION_ACTION = "tech_app.vin_correction";

export interface VinCorrectionIdentity {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
}

export interface VinCorrectionSpecs {
  engine: string | null;
  oilType: string | null;
  oilCapacity: string | null;
  oilFilter: string | null;
  drainPlugTorqueFtLbs: number | null;
}

export interface VinPriceBasisDelta {
  oldCapacity: string | null;
  newCapacity: string | null;
  oldExtraQuarts: number;
  newExtraQuarts: number;
  deltaQuarts: number;
  pricePerQuart: number;
  deltaAmount: number;
  invoiceIssued: boolean;
  /** Always flag-only: a delta is reported, never charged. */
  action: "flag_only";
}

export interface VinCorrectionRecord {
  action: typeof VIN_CORRECTION_ACTION;
  appointmentId: string;
  vehicleId: string;
  oldVin: string | null;
  newVin: string;
  correctedBy: string | null;
  correctedAt: string;
}

export interface VinCorrectionResult {
  identity: VinCorrectionIdentity;
  specs: VinCorrectionSpecs;
  priceBasisDelta: VinPriceBasisDelta | null;
  correctionRecord: VinCorrectionRecord;
}

export interface VinCorrectionDeps {
  decodeVin?: (vin: string) => Promise<VinDecodeResult>;
  resolveSpec?: typeof resolveQldSpec;
  now?: () => Date;
}

export interface VinCorrectionInput {
  workspaceId: string;
  appointmentId: string;
  vehicleId: string;
  oldVin: string | null;
  newVin: string;
  actorUserId: string | null;
  request?: Request;
}

const EMPTY_SPECS: VinCorrectionSpecs = {
  engine: null,
  oilType: null,
  oilCapacity: null,
  oilFilter: null,
  drainPlugTorqueFtLbs: null,
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function yearOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function specsFromValues(values: QldSpecValues | null): VinCorrectionSpecs {
  if (!values) return { ...EMPTY_SPECS };
  return {
    engine: text(values.engine),
    oilType: text(values.oilType),
    oilCapacity: text(values.oilCapacity),
    oilFilter: text(values.oilFilter),
    drainPlugTorqueFtLbs:
      typeof values.drainPlugTorqueFtLbs === "number" &&
      Number.isFinite(values.drainPlugTorqueFtLbs)
        ? values.drainPlugTorqueFtLbs
        : null,
  };
}

export async function reconcileVinCorrection(
  db: any,
  input: VinCorrectionInput,
  deps: VinCorrectionDeps = {},
): Promise<VinCorrectionResult> {
  const decodeVin = deps.decodeVin ?? ((vin: string) => decodeVinWithNhtsa(vin));
  const resolveSpec = deps.resolveSpec ?? resolveQldSpec;
  const now = deps.now ?? (() => new Date());
  const correctedAt = now().toISOString();

  const correctionRecord: VinCorrectionRecord = {
    action: VIN_CORRECTION_ACTION,
    appointmentId: input.appointmentId,
    vehicleId: input.vehicleId,
    oldVin: input.oldVin,
    newVin: input.newVin,
    correctedBy: input.actorUserId,
    correctedAt,
  };

  // Before-state: the vehicle row as the old VIN left it, and the
  // working spec written under the old identity.
  let beforeVehicle: Record<string, unknown> = {};
  let learned: Record<string, unknown> | null = null;
  try {
    const { data } = await db
      .from("vehicles")
      .select("id,year,make,model,vin")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.vehicleId)
      .maybeSingle();
    if (data) beforeVehicle = data as Record<string, unknown>;
  } catch {
    // Before-state is evidence, not a precondition.
  }
  try {
    const { data } = await db
      .from("vehicle_service_specs")
      .select("id,engine,oil_type,oil_capacity,oil_filter,metadata,updated_at")
      .eq("workspace_id", input.workspaceId)
      .eq("vehicle_id", input.vehicleId)
      .maybeSingle();
    if (data) learned = data as Record<string, unknown>;
  } catch {
    // No readable working spec — the resolutions below stand alone.
  }
  // Snapshot the learned values NOW, as plain values: step 2
  // overwrites that row, and the price-basis check + audit must
  // speak about the spec as it was BEFORE the correction.
  const learnedBefore = learned
    ? {
        engine: text(learned.engine),
        oilType: text(learned.oil_type),
        oilCapacity: text(learned.oil_capacity),
        oilFilter: text(learned.oil_filter),
        metadata:
          learned.metadata &&
          typeof learned.metadata === "object" &&
          !Array.isArray(learned.metadata)
            ? { ...(learned.metadata as Record<string, unknown>) }
            : {},
      }
    : null;

  // 1. Identity re-resolves from the corrected VIN.
  let identity: VinCorrectionIdentity = {
    vin: input.newVin,
    year: yearOf(beforeVehicle.year),
    make: text(beforeVehicle.make),
    model: text(beforeVehicle.model),
    engine: null,
  };
  try {
    const decoded = await decodeVin(input.newVin);
    if (decoded.success) {
      identity = {
        vin: input.newVin,
        year: decoded.vehicle.year,
        make: decoded.vehicle.make,
        model: decoded.vehicle.model,
        engine: decoded.vehicle.engine,
      };
      await db
        .from("vehicles")
        .update({
          year: decoded.vehicle.year,
          make: decoded.vehicle.make,
          model: decoded.vehicle.model,
        } as never)
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.vehicleId);
    }
  } catch {
    // Identity stays at the stored row's values; specs still resolve.
  }

  // 2. Specs re-resolve for the new identity through the resolver.
  let specs: VinCorrectionSpecs = { ...EMPTY_SPECS };
  try {
    if (identity.year && identity.make && identity.model) {
      const resolved = await resolveSpec(db, {
        year: identity.year,
        make: identity.make,
        model: identity.model,
        engine: identity.engine,
        vin: input.newVin,
      });
      if (resolved.status === "ok") specs = specsFromValues(resolved.values);
    }
  } catch {
    // Specs stay empty — honest "not recorded", never the old VIN's.
  }
  if (!identity.engine && specs.engine) identity.engine = specs.engine;

  // Replace the working spec: the old VIN's values must not
  // linger. Only an existing row is overwritten (a vehicle with no
  // learned row reads through the catalog tier, which now resolves
  // on the new identity — nothing stale can surface either way).
  if (learnedBefore) {
    try {
      const metadata = { ...learnedBefore.metadata };
      if (specs.drainPlugTorqueFtLbs !== null) {
        metadata.drain_plug_torque_ft_lbs = specs.drainPlugTorqueFtLbs;
      } else {
        delete metadata.drain_plug_torque_ft_lbs;
      }
      await db
        .from("vehicle_service_specs")
        .update({
          engine: specs.engine,
          oil_type: specs.oilType,
          oil_capacity: specs.oilCapacity,
          oil_filter: specs.oilFilter,
          metadata,
          updated_at: correctedAt,
        } as never)
        .eq("workspace_id", input.workspaceId)
        .eq("vehicle_id", input.vehicleId);
    } catch {
      // The correction record still carries the resolved specs.
    }
  }

  // 3. Price-basis re-check: old basis from the working spec the
  // job carried into the correction (or, when it had none, the
  // resolver's answer for the OLD identity), new basis from the
  // re-resolved specs. A difference is flagged, never charged.
  let priceBasisDelta: VinPriceBasisDelta | null = null;
  try {
    let oldCapacity = learnedBefore?.oilCapacity ?? null;
    if (!oldCapacity && beforeVehicle.year && beforeVehicle.make && beforeVehicle.model) {
      const oldResolved = await resolveSpec(db, {
        year: yearOf(beforeVehicle.year) ?? 0,
        make: String(beforeVehicle.make),
        model: String(beforeVehicle.model),
        engine: learnedBefore?.engine ?? null,
        vin: input.oldVin,
      }).catch(() => null);
      if (oldResolved && oldResolved.status === "ok") {
        oldCapacity = text(oldResolved.values.oilCapacity);
      }
    }
    const oldExtraQuarts = calculateExtraOilQuarts(oldCapacity);
    const newExtraQuarts = calculateExtraOilQuarts(specs.oilCapacity);
    if (oldExtraQuarts !== newExtraQuarts) {
      let pricePerQuart = 0;
      try {
        const { data } = await db
          .from("workspace_settings")
          .select("oil_price_per_quart")
          .eq("workspace_id", input.workspaceId)
          .maybeSingle();
        const raw = (data as { oil_price_per_quart?: unknown } | null)
          ?.oil_price_per_quart;
        const parsed = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) pricePerQuart = parsed;
      } catch {
        // The delta still reports the quart difference at $0.
      }
      let invoiceIssued = false;
      try {
        const { data } = await db
          .from("invoices")
          .select("id")
          .eq("workspace_id", input.workspaceId)
          .filter("metadata->>appointment_id", "eq", input.appointmentId)
          .limit(1);
        invoiceIssued = Array.isArray(data) && data.length > 0;
      } catch {
        // Unknown — the delta is flag-only either way.
      }
      const deltaQuarts = newExtraQuarts - oldExtraQuarts;
      priceBasisDelta = {
        oldCapacity,
        newCapacity: specs.oilCapacity,
        oldExtraQuarts,
        newExtraQuarts,
        deltaQuarts,
        pricePerQuart,
        deltaAmount: Math.round(deltaQuarts * pricePerQuart * 100) / 100,
        invoiceIssued,
        action: "flag_only",
      };
    }
  } catch {
    // A price check failure never reaches the saved correction.
  }

  // 4. Audit: the correction persists on the job's audit trail.
  await recordOperationalAudit({
    supabase: db,
    request: input.request,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: VIN_CORRECTION_ACTION,
    entityType: "appointment",
    entityId: input.appointmentId,
    metadata: {
      vehicle_id: input.vehicleId,
      old_vin: input.oldVin,
      new_vin: input.newVin,
      price_delta_quarts: priceBasisDelta?.deltaQuarts ?? 0,
      invoice_issued: priceBasisDelta?.invoiceIssued ?? false,
    },
    before: {
      vin: input.oldVin,
      year: yearOf(beforeVehicle.year),
      make: text(beforeVehicle.make),
      model: text(beforeVehicle.model),
      specs: learnedBefore
        ? {
            engine: learnedBefore.engine,
            oilType: learnedBefore.oilType,
            oilCapacity: learnedBefore.oilCapacity,
            oilFilter: learnedBefore.oilFilter,
          }
        : null,
    },
    after: { vin: input.newVin, identity, specs },
  });

  return { identity, specs, priceBasisDelta, correctionRecord };
}
