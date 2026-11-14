/**
 * Field Data Collection — submission service (SW-137, Phase 1).
 *
 * The one door through which user-collected data enters the system.
 * Ty's law (2026-11-13): collected data is NEVER automatically added
 * to anything shared. Every submission lands in the quarantine table
 * (field_data_submissions) first. From there it may do exactly two
 * things in this phase:
 *
 *   1. Help the SUBMITTING workspace immediately — a blanks-only
 *      write-through into that workspace's learned tier
 *      (vehicle_service_specs), with provenance stamped into the
 *      row's metadata so renders can label it "From field entry".
 *      A value that disagrees with an existing learned value NEVER
 *      overwrites it; the submission stays in quarantine as
 *      corroboration signal.
 *   2. Accrue corroboration — agreement from other workspaces is
 *      counted by the database (record_field_submission_corroborations,
 *      a SECURITY DEFINER function), because no caller may ever read
 *      another workspace's raw submissions. Counts are all that
 *      come back out.
 *
 * Promotion into the shared catalog / QLD is a later phase and does
 * not exist here. This module never touches vehicle_specifications,
 * qld_spec_cache, or anything outside the submitting workspace.
 */
import {
  parseCapacityQuarts,
  specsFromWorkspaceRow,
  fieldEntrySources,
  FIELD_PROVENANCE_KEY,
  type DataCenterSpecs,
} from "./data-center";

/** Minimal client surface the service needs (the routes pass theirs). */
export interface FieldDataClient {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(
    fn: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

type LearnedHome =
  | { kind: "column"; column: "engine" | "oil_type" | "oil_capacity" | "oil_filter" }
  | { kind: "metadata"; key: string; numeric?: boolean }
  | { kind: "none" };

interface FieldDef {
  home: LearnedHome;
}

/**
 * The submittable fields. Spec fields have a learned-tier home
 * (columns for the oil group, the metadata pocket for the rest —
 * tire size/pressure live there per SW-137 Decision 2). Part
 * categories beyond the oil filter are collected as application
 * claims for the verification phases; the learned tier has no
 * per-vehicle column for them, so they are record-only in Phase 1.
 */
export const FIELD_DEFS: Record<string, FieldDef> = {
  engine: { home: { kind: "column", column: "engine" } },
  oil_type: { home: { kind: "column", column: "oil_type" } },
  oil_capacity: { home: { kind: "column", column: "oil_capacity" } },
  oil_filter: { home: { kind: "column", column: "oil_filter" } },
  drain_plug_torque: { home: { kind: "metadata", key: "drain_plug_torque_ft_lbs", numeric: true } },
  tire_size: { home: { kind: "metadata", key: "tire_size" } },
  tire_pressure: { home: { kind: "metadata", key: "tire_pressure_psi", numeric: true } },
  coolant_type: { home: { kind: "metadata", key: "coolant_type" } },
  battery_group: { home: { kind: "metadata", key: "battery_group" } },
  air_filter: { home: { kind: "none" } },
  cabin_filter: { home: { kind: "none" } },
  fuel_filter: { home: { kind: "none" } },
  wiper_blade_driver: { home: { kind: "none" } },
  wiper_blade_passenger: { home: { kind: "none" } },
  wiper_blade_rear: { home: { kind: "none" } },
};

export const FIELD_KEYS = Object.keys(FIELD_DEFS);

/** Part categories the parts registry can file (promote-parts re-point). */
export const PART_SUBMISSION_FIELDS = [
  "oil_filter",
  "air_filter",
  "cabin_filter",
  "fuel_filter",
  "wiper_blade_driver",
  "wiper_blade_passenger",
  "wiper_blade_rear",
] as const;

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** First number stated in a value ("25 ft-lb" -> 25); null when none. */
export function parseStatedNumber(value: string): number | null {
  const match = /([0-9]+(?:\.[0-9]+)?)/.exec(value);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The corroboration identity of a value: two submissions agree when
 * their normalized forms match. Normalization is deliberately
 * conservative — case and whitespace never carry meaning, units are
 * canonicalized only where a parser already exists (capacity ->
 * quarts), and part numbers are NOT squashed together across brands
 * ("NAPA Gold 7502" and "WIX 57502" stay different claims).
 */
export function normalizeFieldValue(field: string, value: string): string {
  const stated = collapse(value);
  if (field === "oil_capacity") {
    const quarts = parseCapacityQuarts(stated);
    if (quarts !== null) return String(quarts);
  }
  const def = FIELD_DEFS[field];
  if (def?.home.kind === "metadata" && def.home.numeric) {
    const numeric = parseStatedNumber(stated);
    if (numeric !== null) return String(numeric);
  }
  if (field === "tire_size") return stated.toUpperCase().replace(/\s+/g, "");
  return stated.toUpperCase();
}

export type WriteThroughReason =
  | "filled_blank"
  | "already_present"
  | "no_vehicle"
  | "no_learned_home"
  | "not_requested"
  | "value_not_numeric";

export interface SubmissionSummary {
  id: string;
  field: string;
  value_as_stated: string;
  value_normalized: string;
  status: string;
  corroboration_count: number;
}

export interface SubmitFieldValueInput {
  workspaceId: string;
  userId: string;
  role: string | null;
  vehicleId?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  field: string;
  value: string;
  sourceSurface: string;
  sourceJobId?: string | null;
  photoRef?: string | null;
  note?: string | null;
  /** Field capture writes through; office/registry filings record only. */
  writeThrough: boolean;
}

export interface SubmitFieldValueResult {
  submission: SubmissionSummary;
  writeThrough: { applied: boolean; reason: WriteThroughReason };
  /** The workspace's learned layer after the write (null: no vehicle). */
  learnedSpecs: DataCenterSpecs | null;
  /** Spec key -> submission id for values that are field entries. */
  fieldEntries: Record<string, string>;
}

interface VehicleRow {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}

interface LearnedRow {
  engine?: unknown;
  oil_type?: unknown;
  oil_capacity?: unknown;
  oil_filter?: unknown;
  source?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function metadataOf(row: LearnedRow | null): Record<string, unknown> {
  const metadata = row?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Record one submission and, for field capture, run the blanks-only
 * learned-tier write-through. Throws only on infrastructure failure
 * (the insert itself); corroboration bookkeeping is best-effort —
 * a counting failure must never lose the submission.
 */
export async function submitFieldValue(
  db: FieldDataClient,
  input: SubmitFieldValueInput,
): Promise<SubmitFieldValueResult> {
  const def = FIELD_DEFS[input.field];
  if (!def) throw new Error(`Unknown field submission field: ${input.field}`);
  const valueAsStated = collapse(input.value);
  if (!valueAsStated) throw new Error("Field submission value is empty");
  const valueNormalized = normalizeFieldValue(input.field, valueAsStated);

  // Resolve the workspace vehicle: an explicit id wins, then the VIN.
  // The stored row's identity always outranks the caller's claims;
  // caller identity fills only the row's blanks.
  let vehicle: VehicleRow | null = null;
  if (input.vehicleId) {
    const { data } = await db
      .from("vehicles")
      .select("id,vin,year,make,model")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.vehicleId)
      .maybeSingle();
    vehicle = (data as VehicleRow | null) ?? null;
  }
  if (!vehicle && input.vin) {
    const { data } = await db
      .from("vehicles")
      .select("id,vin,year,make,model")
      .eq("workspace_id", input.workspaceId)
      .eq("vin", input.vin.toUpperCase())
      .maybeSingle();
    vehicle = (data as VehicleRow | null) ?? null;
  }
  const identity = {
    vin: vehicle?.vin ?? (input.vin ? input.vin.toUpperCase() : null),
    year: vehicle?.year ?? input.year ?? null,
    make: vehicle?.make ?? cleanString(input.make),
    model: vehicle?.model ?? cleanString(input.model),
  };
  const vehicleId = vehicle?.id ?? null;

  // The current learned row (also the write-through's base).
  let learned: LearnedRow | null = null;
  if (vehicleId) {
    const { data } = await db
      .from("vehicle_service_specs")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    learned = (data as LearnedRow | null) ?? null;
  }
  const engine = cleanString(input.engine) ?? cleanString(learned?.engine);

  const { data: inserted, error: insertError } = await db
    .from("field_data_submissions")
    .insert({
      workspace_id: input.workspaceId,
      submitted_by: input.userId,
      submitted_by_role: input.role,
      vin: identity.vin,
      vehicle_id: vehicleId,
      year: identity.year,
      make: identity.make,
      model: identity.model,
      engine,
      field: input.field,
      value_as_stated: valueAsStated,
      value_normalized: valueNormalized,
      source_surface: input.sourceSurface,
      source_job_id: input.sourceJobId ?? null,
      photo_ref: input.photoRef ?? null,
      note: input.note ? collapse(input.note) : null,
      status: "submitted",
    })
    .select()
    .single();
  if (insertError) throw insertError;
  const submissionRow = inserted as { id: string; corroboration_count?: number };

  // Corroboration counting lives in the database (SECURITY DEFINER):
  // agreement across workspaces is counted without any cross-workspace
  // read. Best-effort — the submission already landed.
  let corroborationCount =
    typeof submissionRow.corroboration_count === "number" ? submissionRow.corroboration_count : 0;
  try {
    const { data: count } = await db.rpc("record_field_submission_corroborations", {
      p_submission_id: submissionRow.id,
    });
    if (typeof count === "number" && Number.isFinite(count)) corroborationCount = count;
  } catch {
    // Counting resumes on the next matching submission; never lose this one.
  }

  // Blanks-only write-through into the workspace's own learned tier.
  let writeThrough: SubmitFieldValueResult["writeThrough"] = {
    applied: false,
    reason: "not_requested",
  };
  let finalLearned = learned;
  if (input.writeThrough) {
    if (def.home.kind === "none") {
      writeThrough = { applied: false, reason: "no_learned_home" };
    } else if (!vehicleId) {
      writeThrough = { applied: false, reason: "no_vehicle" };
    } else {
      const metadata = metadataOf(learned);
      const home = def.home;
      const current =
        home.kind === "column" ? learned?.[home.column] : metadata[home.key];
      if (!isBlank(current)) {
        // The workspace already settled this field. The submission is
        // the disagreement record — quarantine keeps it, nothing moves.
        writeThrough = { applied: false, reason: "already_present" };
      } else {
        let storedValue: unknown = valueAsStated;
        if (home.kind === "metadata" && home.numeric) {
          const numeric = parseStatedNumber(valueAsStated);
          if (numeric === null) {
            writeThrough = { applied: false, reason: "value_not_numeric" };
            storedValue = null;
          } else {
            storedValue = numeric;
          }
        }
        if (storedValue !== null) {
          const provenance = {
            ...((metadata[FIELD_PROVENANCE_KEY] as Record<string, unknown> | undefined) ?? {}),
            [input.field]: {
              submission_id: submissionRow.id,
              by: input.userId,
              at: new Date().toISOString(),
            },
          };
          const nextMetadata =
            home.kind === "metadata"
              ? { ...metadata, [home.key]: storedValue, [FIELD_PROVENANCE_KEY]: provenance }
              : { ...metadata, [FIELD_PROVENANCE_KEY]: provenance };
          const nextRow: Record<string, unknown> = {
            workspace_id: input.workspaceId,
            vehicle_id: vehicleId,
            engine: cleanString(learned?.engine),
            oil_type: cleanString(learned?.oil_type),
            oil_capacity: cleanString(learned?.oil_capacity),
            oil_filter: cleanString(learned?.oil_filter),
            source: cleanString(learned?.source) ?? "field_entry",
            metadata: nextMetadata,
          };
          if (home.kind === "column") nextRow[home.column] = storedValue;
          const { error: upsertError } = await db
            .from("vehicle_service_specs")
            .upsert(nextRow, { onConflict: "workspace_id,vehicle_id" });
          if (upsertError) throw upsertError;
          finalLearned = nextRow as LearnedRow;
          writeThrough = { applied: true, reason: "filled_blank" };
        }
      }
    }
  }

  const learnedSpecs = finalLearned ? specsFromWorkspaceRow(finalLearned) : null;
  const fieldEntries = finalLearned
    ? fieldEntrySources(finalLearned, learnedSpecs as DataCenterSpecs, cleanString(finalLearned.engine))
    : {};

  return {
    submission: {
      id: submissionRow.id,
      field: input.field,
      value_as_stated: valueAsStated,
      value_normalized: valueNormalized,
      status: "submitted",
      corroboration_count: corroborationCount,
    },
    writeThrough,
    learnedSpecs,
    fieldEntries,
  };
}

/**
 * Owner retraction (SW-137 Decision 1): the submission is withdrawn
 * (status -> superseded) and, when the learned tier still shows
 * exactly this submission's write-through, that value is cleared
 * too — a retracted claim must not keep speaking for the shop.
 * Returns null when the submission does not exist in the workspace.
 */
export async function retractFieldSubmission(
  db: FieldDataClient,
  input: { workspaceId: string; submissionId: string },
): Promise<
  | { ok: true; learnedCleared: boolean }
  | { ok: false; reason: "already_promoted" }
  | null
> {
  const { data } = await db
    .from("field_data_submissions")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.submissionId)
    .maybeSingle();
  const submission = data as
    | {
        id: string;
        status: string;
        field: string;
        vehicle_id: string | null;
        value_normalized: string;
      }
    | null;
  if (!submission) return null;
  if (submission.status === "promoted") return { ok: false, reason: "already_promoted" };
  if (submission.status === "superseded" || submission.status === "rejected") {
    return { ok: true, learnedCleared: false };
  }

  const { error: updateError } = await db
    .from("field_data_submissions")
    .update({ status: "superseded" })
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.submissionId);
  if (updateError) throw updateError;

  let learnedCleared = false;
  const def = FIELD_DEFS[submission.field];
  if (submission.vehicle_id && def && def.home.kind !== "none") {
    const { data: learnedData } = await db
      .from("vehicle_service_specs")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .eq("vehicle_id", submission.vehicle_id)
      .maybeSingle();
    const learned = learnedData as LearnedRow | null;
    if (learned) {
      const metadata = metadataOf(learned);
      const provenance = {
        ...((metadata[FIELD_PROVENANCE_KEY] as Record<string, unknown> | undefined) ?? {}),
      };
      const stamp = provenance[submission.field] as { submission_id?: unknown } | undefined;
      if (stamp?.submission_id === submission.id) {
        const home = def.home;
        const nextMetadata = { ...metadata };
        const nextRow: Record<string, unknown> = {
          workspace_id: input.workspaceId,
          vehicle_id: submission.vehicle_id,
          engine: cleanString(learned.engine),
          oil_type: cleanString(learned.oil_type),
          oil_capacity: cleanString(learned.oil_capacity),
          oil_filter: cleanString(learned.oil_filter),
          source: cleanString(learned.source) ?? "service_writer",
          metadata: nextMetadata,
        };
        if (home.kind === "column") {
          // Clear only when the column still carries this claim.
          const current = cleanString(learned[home.column]);
          if (current && normalizeFieldValue(submission.field, current) === submission.value_normalized) {
            nextRow[home.column] = null;
            learnedCleared = true;
          }
        } else {
          const current = metadata[home.key];
          const currentText =
            typeof current === "number" ? String(current) : cleanString(current);
          if (
            currentText &&
            normalizeFieldValue(submission.field, currentText) === submission.value_normalized
          ) {
            delete nextMetadata[home.key];
            learnedCleared = true;
          }
        }
        if (learnedCleared) {
          delete provenance[submission.field];
          if (Object.keys(provenance).length > 0) {
            nextMetadata[FIELD_PROVENANCE_KEY] = provenance;
          } else {
            delete nextMetadata[FIELD_PROVENANCE_KEY];
          }
          const { error: upsertError } = await db
            .from("vehicle_service_specs")
            .upsert(nextRow, { onConflict: "workspace_id,vehicle_id" });
          if (upsertError) throw upsertError;
        }
      }
    }
  }
  return { ok: true, learnedCleared };
}

/**
 * Office entries file submissions too (SW-137 Decision 4): when the
 * office doors settle a spec value directly (their write is trusted
 * for their own account and already happened), the same claim is
 * filed silently so the platform's collection holds its highest-
 * quality source. Record-only — no write-through, the office write
 * IS the learned value. Callers wrap this in try/catch: filing must
 * never fail the office's own save.
 */
export async function fileOfficeSpecSubmissions(
  db: FieldDataClient,
  input: {
    workspaceId: string;
    userId: string;
    role: string | null;
    vehicleId: string;
    vin?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    values: Partial<Record<string, string | null>>;
    sourceSurface: string;
  },
): Promise<number> {
  let filed = 0;
  for (const [field, value] of Object.entries(input.values)) {
    if (!FIELD_DEFS[field]) continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    await submitFieldValue(db, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      vehicleId: input.vehicleId,
      vin: input.vin ?? null,
      year: input.year ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      engine: input.engine ?? null,
      field,
      value,
      sourceSurface: input.sourceSurface,
      writeThrough: false,
    });
    filed += 1;
  }
  return filed;
}
