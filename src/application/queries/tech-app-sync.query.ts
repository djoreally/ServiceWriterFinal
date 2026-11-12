/**
 * tech-app-sync.query — pure mapping + bucketing for the tech app's
 * Watermelon sync pull (SYNC-1, 2026-11-11).
 *
 * The external tech app (lovable-tech-partner) speaks the
 * WatermelonDB synchronize() protocol against two doors:
 *   GET  /v1/tech-app/sync/pull?last_pulled_at=<ms>
 *   POST /v1/tech-app/sync/push            (SYNC-2 — not here)
 * The wire contract is pinned by the client's swSyncMapping.ts:
 * table names match the local schema (jobs, inspection_reports,
 * inspection_steps, recommendations, job_photos,
 * technician_locations), change sets are
 * { created: [raw], updated: [raw], deleted: [id] } per table, and
 * date columns travel as ISO 8601 strings.
 *
 * This module is the pure half: given composed appointment rows
 * (the same composition GET /v1/tech-app/jobs serves — see the
 * sync pull handler in src/server/hono/routes/work-orders.ts), it
 * produces the local jobs rows and buckets them against the
 * client's last_pulled_at. No I/O lives here; the handler owns the
 * reads.
 */

export type LocalJobStatus = "assigned" | "en_route" | "arrived" | "in_progress" | "completed";

/** A jobs row in the tech app's local (Watermelon) shape, dates as ISO strings. */
export interface LocalJobRaw {
  id: string;
  server_id: string;
  title: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle: string;
  vin: string | null;
  mileage_in: number | null;
  plate: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: LocalJobStatus;
  estimated_cost: number | null;
  notes: string | null;
  services_json: string | null;
  /** Travel leg (job flow, 2026-11-12): stamped by technician_transition_job_v2. */
  en_route_at: string | null;
  arrived_at: string | null;
  /** Null when the tap had no location — distance is then not captured, never estimated. */
  en_route_lat: number | null;
  en_route_lng: number | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  created_at: string;
  updated_at: string;
}

/** One composed appointment, in the shape the jobs door composes. */
export interface ComposedSyncAppointment {
  id: string;
  /** Raw server appointment status (scheduled / en_route / … / cancelled). */
  serverStatus: string | null;
  title: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicleDisplay: string;
  vin: string | null;
  mileageIn: number | null;
  plate: string | null;
  address: string | null;
  startsAt: string;
  endsAt: string | null;
  durationMinutes: number | null;
  estimatedCost: number | null;
  notes: string | null;
  services: Array<{
    name: string;
    price: number;
    /** What the service includes, item by item (playbook components). */
    components: string[];
    /** The SOP procedure steps for the service (playbook steps). */
    sopSteps: string[];
  }>;
  /** metadata.dispatch_status (en_route / arrived / started …), when set. */
  dispatchStatus?: string | null;
  enRouteAt?: string | null;
  arrivedAt?: string | null;
  enRouteLat?: number | null;
  enRouteLng?: number | null;
  arrivedLat?: number | null;
  arrivedLng?: number | null;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Server appointment status → the local jobs status vocabulary
 * (assigned | en_route | in_progress | completed — schema.ts).
 * Anything unrecognized reads as "assigned": a job the tech has
 * not started yet. "cancelled" never reaches this function — the
 * bucketer routes cancelled rows to the deleted set.
 */
export function localJobStatus(serverStatus: string | null | undefined): LocalJobStatus {
  switch ((serverStatus ?? "").trim().toLowerCase()) {
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return "assigned";
  }
}

/**
 * The status the device should show for a composed appointment.
 * The appointment's own status only moves at start/complete; the
 * travel leg (en_route / arrived) lives in dispatch_status, so it
 * wins whenever the job itself has not started or finished. A
 * started/completed job reports its own status, never a stale
 * dispatch value.
 */
export function effectiveJobStatus(
  serverStatus: string | null | undefined,
  dispatchStatus: string | null | undefined,
): LocalJobStatus {
  const server = (serverStatus ?? "").trim().toLowerCase();
  if (server === "in_progress" || server === "completed" || server === "cancelled") {
    return localJobStatus(server);
  }
  const dispatch = (dispatchStatus ?? "").trim().toLowerCase();
  if (dispatch === "en_route" || dispatch === "arrived") {
    return dispatch;
  }
  return localJobStatus(server);
}

/** "2022 BMW X5 xDrive40i" — the single display string the local schema stores. */
export function composeVehicleDisplay(
  vehicle: { year?: number | null; make?: string | null; model?: string | null; trim?: string | null } | null | undefined,
): string {
  if (!vehicle) return "";
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .join(" ");
}

/** Fallback job length when the appointment carries no ends_at (minutes). */
export const FALLBACK_DURATION_MINUTES = 45;

export function mapComposedAppointmentToLocalJob(appt: ComposedSyncAppointment): LocalJobRaw {
  const startsMs = Date.parse(appt.startsAt);
  const duration = appt.durationMinutes ?? FALLBACK_DURATION_MINUTES;
  const endsAt =
    appt.endsAt ??
    (Number.isFinite(startsMs) ? new Date(startsMs + duration * 60_000).toISOString() : appt.startsAt);
  return {
    id: appt.id,
    server_id: appt.id,
    title: appt.title,
    customer_name: appt.customerName ?? "Customer",
    customer_phone: appt.customerPhone,
    customer_email: appt.customerEmail,
    vehicle: appt.vehicleDisplay,
    vin: appt.vin,
    mileage_in: appt.mileageIn,
    plate: appt.plate,
    address: appt.address,
    starts_at: appt.startsAt,
    ends_at: endsAt,
    duration_minutes: duration,
    status: effectiveJobStatus(appt.serverStatus, appt.dispatchStatus),
    estimated_cost: appt.estimatedCost,
    notes: appt.notes,
    services_json: appt.services.length > 0 ? JSON.stringify(appt.services) : null,
    en_route_at: appt.enRouteAt ?? null,
    arrived_at: appt.arrivedAt ?? null,
    en_route_lat: appt.enRouteLat ?? null,
    en_route_lng: appt.enRouteLng ?? null,
    arrived_lat: appt.arrivedLat ?? null,
    arrived_lng: appt.arrivedLng ?? null,
    created_at: appt.createdAt,
    updated_at: appt.updatedAt ?? appt.createdAt,
  };
}

export interface JobChangeSet {
  created: LocalJobRaw[];
  updated: LocalJobRaw[];
  deleted: string[];
}

/**
 * Bucket composed appointments against the client's last_pulled_at
 * (epoch ms; 0 = first pull, everything is "created").
 *
 * - A cancelled appointment is a deletion, never a row.
 * - A row created after last_pulled_at is "created"; a row that
 *   existed before but changed after it is "updated"; an unchanged
 *   row is omitted.
 * - Change time is max(created_at, updated_at) — a row whose
 *   updated_at was never stamped still moves when it is created.
 * - `extraDeletedIds` carries ids the caller learned about outside
 *   this row set (e.g. appointments reassigned away from the
 *   caller): deleting an id the device never held is a Watermelon
 *   no-op, so over-reporting deletes is safe.
 */
export function bucketJobChanges(
  appointments: ComposedSyncAppointment[],
  lastPulledAtMs: number,
  extraDeletedIds: string[] = [],
): JobChangeSet {
  const created: LocalJobRaw[] = [];
  const updated: LocalJobRaw[] = [];
  const deleted = new Set<string>(extraDeletedIds);

  for (const appt of appointments) {
    if ((appt.serverStatus ?? "").trim().toLowerCase() === "cancelled") {
      deleted.add(appt.id);
      continue;
    }
    const createdMs = Date.parse(appt.createdAt);
    const updatedMs = appt.updatedAt ? Date.parse(appt.updatedAt) : NaN;
    const changedMs = Math.max(
      Number.isFinite(createdMs) ? createdMs : 0,
      Number.isFinite(updatedMs) ? updatedMs : 0,
    );
    if (lastPulledAtMs <= 0) {
      created.push(mapComposedAppointmentToLocalJob(appt));
    } else if (Number.isFinite(createdMs) && createdMs > lastPulledAtMs) {
      created.push(mapComposedAppointmentToLocalJob(appt));
    } else if (changedMs > lastPulledAtMs) {
      updated.push(mapComposedAppointmentToLocalJob(appt));
    }
  }

  // An id cannot be both deleted and upserted in one change set.
  const upserted = new Set([...created, ...updated].map((row) => row.id));
  for (const id of upserted) deleted.delete(id);

  return { created, updated, deleted: [...deleted] };
}

// ---------------------------------------------------------------------------
// SYNC-1b (2026-11-11): inspections, recommendations, photos, locations.
//
// Server sources, all pinned to the live production shape by the
// selects test (tech-app-sync-pull-selects.test.ts):
// - service_inspections: the report header. status vocabulary is
//   draft | completed | cancelled (repo DDL
//   20260917215245_reconcile_inspection_runtime). There is NO
//   completed_at column; a completed report's updated_at is the
//   completion stamp the wire carries.
// - inspection_results: the per-step rows. NO updated_at — change
//   detection rides on the parent report (below). status is the
//   production union vocabulary (migration
//   20261110170000_inspection_results_status_vocabulary):
//   attention, fail, good, not_applicable, not_checked, pass,
//   urgent, warning.
// - service_recommendations: the office's advisory rows (migration
//   20260917233000_vehicle_scoped_service_recommendations), with
//   real created_at/updated_at.
// - job_photos: NO updated_at; rows are create-only on the wire
//   (updated_at mirrors created_at, as the local schema requires
//   the column).
// - location_history: append-only pings keyed by technicians.id
//   (NOT the auth id — the column the client's own GPS hook stamps,
//   AuthContext technicianId = technicians.id ?? auth id). NO
//   created_at/updated_at; recorded_at fills all three wire stamps.
//
// Watermelon's applyRemoteChanges (verified in the client's own
// @nozbe/watermelondb 0.28 sources) is forgiving in both
// directions: a "created" row that already exists locally is
// updated in place, and an "updated" row missing locally is
// created. The bucketers below lean on that: when in doubt, send
// the row. Deletes of ids the device never held are no-ops.
// ---------------------------------------------------------------------------

/** Shared change-set shape for the SYNC-1b tables. */
export interface SyncChangeSet<Raw> {
  created: Raw[];
  updated: Raw[];
  deleted: string[];
}

/**
 * created_at/updated_at bucketing, the same rule bucketJobChanges
 * applies: first pull (lastPulledAt <= 0) creates everything; a row
 * created after last_pulled_at is "created"; a row that existed
 * before but changed after it is "updated"; unchanged rows omit.
 */
function bucketByTimestamps<Row extends { created_at: string; updated_at: string }>(
  rows: Row[],
  lastPulledAtMs: number,
): { created: Row[]; updated: Row[] } {
  const created: Row[] = [];
  const updated: Row[] = [];
  for (const row of rows) {
    const createdMs = Date.parse(row.created_at);
    const updatedMs = Date.parse(row.updated_at);
    if (lastPulledAtMs <= 0 || (Number.isFinite(createdMs) && createdMs > lastPulledAtMs)) {
      created.push(row);
    } else if (Number.isFinite(updatedMs) && updatedMs > lastPulledAtMs) {
      updated.push(row);
    }
  }
  return { created, updated };
}

/** created_at-only bucketing for append-only tables (photos, locations). */
function bucketByCreatedAt<Row extends { created_at: string }>(
  rows: Row[],
  lastPulledAtMs: number,
): Row[] {
  if (lastPulledAtMs <= 0) return [...rows];
  return rows.filter((row) => {
    const createdMs = Date.parse(row.created_at);
    return Number.isFinite(createdMs) && createdMs > lastPulledAtMs;
  });
}

// --- inspection_reports ← service_inspections ------------------------------

export interface ServerInspectionRow {
  id: string;
  appointment_id: string | null;
  user_id: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LocalInspectionReportRaw {
  id: string;
  appointment_id: string;
  technician_id: string;
  overall_notes: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Server inspection status → the local report vocabulary
 * (in_progress | completed). "cancelled" never reaches the
 * mapper — the bucketer routes cancelled reports to deleted.
 */
export function localReportStatus(serverStatus: string | null | undefined): string {
  return (serverStatus ?? "").trim().toLowerCase() === "completed" ? "completed" : "in_progress";
}

export function mapInspectionToLocalReport(row: ServerInspectionRow): LocalInspectionReportRaw {
  const status = localReportStatus(row.status);
  const updatedAt = row.updated_at ?? row.created_at;
  return {
    id: row.id,
    appointment_id: row.appointment_id ?? "",
    technician_id: row.user_id ?? "",
    overall_notes: row.notes,
    status,
    completed_at: status === "completed" ? updatedAt : null,
    created_at: row.created_at,
    updated_at: updatedAt,
  };
}

export function bucketInspectionReports(
  rows: ServerInspectionRow[],
  lastPulledAtMs: number,
  deletedAppointmentIds: ReadonlySet<string> = new Set(),
): SyncChangeSet<LocalInspectionReportRaw> {
  const deleted = new Set<string>();
  const live: LocalInspectionReportRaw[] = [];
  for (const row of rows) {
    const cancelled = (row.status ?? "").trim().toLowerCase() === "cancelled";
    if (cancelled || (row.appointment_id !== null && deletedAppointmentIds.has(row.appointment_id))) {
      deleted.add(row.id);
      continue;
    }
    live.push(mapInspectionToLocalReport(row));
  }
  const { created, updated } = bucketByTimestamps(live, lastPulledAtMs);
  const upserted = new Set([...created, ...updated].map((row) => row.id));
  for (const id of upserted) deleted.delete(id);
  return { created, updated, deleted: [...deleted] };
}

// --- inspection_steps ← inspection_results ---------------------------------

export interface ServerInspectionResultRow {
  id: string;
  inspection_id: string;
  item_name: string;
  item_category: string | null;
  status: string | null;
  notes: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface LocalInspectionStepRaw {
  id: string;
  report_id: string;
  step_key: string;
  label: string;
  category: string;
  status: string;
  notes: string | null;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * Production result vocabulary → the local step vocabulary
 * (pass | fail | warn | na | unchecked). The severity ladder is
 * the legacy voice-inspection model (good < attention < urgent):
 * good/pass are clean, attention/warning are the middle bucket,
 * fail/urgent are the severe bucket.
 */
export function localStepStatus(serverStatus: string | null | undefined): string {
  switch ((serverStatus ?? "").trim().toLowerCase()) {
    case "good":
    case "pass":
      return "pass";
    case "fail":
    case "urgent":
      return "fail";
    case "attention":
    case "warning":
      return "warn";
    case "not_applicable":
      return "na";
    case "not_checked":
      return "unchecked";
    default:
      return "unchecked";
  }
}

export function mapResultToLocalStep(row: ServerInspectionResultRow): LocalInspectionStepRaw {
  const sortIndex = typeof row.sort_order === "number" ? row.sort_order : 0;
  return {
    id: row.id,
    report_id: row.inspection_id,
    // The server keys steps by item name, not by template-item id;
    // sort_order is the only stable key the row carries. (SYNC-2's
    // push owns translating local template keys back.)
    step_key: String(sortIndex),
    label: row.item_name,
    category: row.item_category ?? "",
    status: localStepStatus(row.status),
    notes: row.notes,
    sort_index: sortIndex,
    created_at: row.created_at,
    // inspection_results has no updated_at; the parent report's
    // change stamp is what re-sends a step (see the bucketer).
    updated_at: row.created_at,
  };
}

/**
 * Steps have no change stamp of their own, so they ride on their
 * parent report: a step is sent when its report was created or
 * updated in this pull, or when the step itself was created after
 * last_pulled_at. Sent as "created" — the client's apply step
 * upserts a created row that already exists locally, so a re-sent
 * step updates in place instead of duplicating. Steps of a deleted
 * report are deleted. Known limit: the office's full re-save
 * (/perform adopt path) deletes and re-creates result rows under
 * new ids, so a superseded id can linger on the device as a ghost
 * step until the report itself is deleted; in-place step edits
 * (§E advance) keep their ids and propagate through the parent.
 */
export function bucketInspectionSteps(
  rows: ServerInspectionResultRow[],
  reportChanges: SyncChangeSet<LocalInspectionReportRaw>,
  lastPulledAtMs: number,
): SyncChangeSet<LocalInspectionStepRaw> {
  const changedReportIds = new Set([
    ...reportChanges.created.map((row) => row.id),
    ...reportChanges.updated.map((row) => row.id),
  ]);
  const deletedReportIds = new Set(reportChanges.deleted);
  const created: LocalInspectionStepRaw[] = [];
  const deleted = new Set<string>();
  for (const row of rows) {
    if (deletedReportIds.has(row.inspection_id)) {
      deleted.add(row.id);
      continue;
    }
    const step = mapResultToLocalStep(row);
    const ownChange = bucketByCreatedAt([step], lastPulledAtMs).length > 0;
    if (changedReportIds.has(row.inspection_id) || ownChange) {
      created.push(step);
    }
  }
  const upserted = new Set(created.map((row) => row.id));
  for (const id of upserted) deleted.delete(id);
  return { created, updated: [], deleted: [...deleted] };
}

// --- recommendations ← service_recommendations ------------------------------

export interface ServerRecommendationRow {
  id: string;
  appointment_id: string | null;
  inspection_id: string;
  inspection_result_id: string | null;
  description: string;
  technician_notes: string | null;
  price: number | string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LocalRecommendationRaw {
  id: string;
  report_id: string;
  step_id: string | null;
  recommended_service: string;
  urgency: string | null;
  estimated_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function mapRecommendationToLocal(row: ServerRecommendationRow): LocalRecommendationRaw {
  const price = row.price === null || row.price === undefined ? NaN : Number(row.price);
  return {
    id: row.id,
    report_id: row.inspection_id,
    step_id: row.inspection_result_id,
    recommended_service: row.description,
    // The server's own status (pending/approved/declined/…) is a
    // decision state, not an urgency — the local urgency stays
    // null rather than inventing a severity the server never set.
    urgency: null,
    estimated_cost: Number.isFinite(price) ? price : null,
    notes: row.technician_notes,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

export function bucketRecommendations(
  rows: ServerRecommendationRow[],
  lastPulledAtMs: number,
  deletedAppointmentIds: ReadonlySet<string> = new Set(),
): SyncChangeSet<LocalRecommendationRaw> {
  const deleted = new Set<string>();
  const live: LocalRecommendationRaw[] = [];
  for (const row of rows) {
    if (row.appointment_id !== null && deletedAppointmentIds.has(row.appointment_id)) {
      deleted.add(row.id);
      continue;
    }
    live.push(mapRecommendationToLocal(row));
  }
  const { created, updated } = bucketByTimestamps(live, lastPulledAtMs);
  const upserted = new Set([...created, ...updated].map((row) => row.id));
  for (const id of upserted) deleted.delete(id);
  return { created, updated, deleted: [...deleted] };
}

// --- job_photos ← job_photos -------------------------------------------------

export interface ServerJobPhotoRow {
  id: string;
  appointment_id: string | null;
  technician_id: string | null;
  user_id: string | null;
  photo_type: string | null;
  photo_url: string | null;
  storage_path: string | null;
  caption: string | null;
  created_at: string;
}

export interface LocalJobPhotoRaw {
  id: string;
  appointment_id: string;
  technician_id: string;
  photo_url: string;
  local_path: string | null;
  caption: string | null;
  photo_type: string | null;
  created_at: string;
  updated_at: string;
}

export function mapJobPhotoToLocal(row: ServerJobPhotoRow): LocalJobPhotoRaw {
  return {
    id: row.id,
    appointment_id: row.appointment_id ?? "",
    technician_id: row.technician_id ?? row.user_id ?? "",
    // photo_url is the stored reference when the row carries one;
    // otherwise the storage path is the reference (the same value
    // the office's own photo reads key on).
    photo_url: row.photo_url ?? row.storage_path ?? "",
    local_path: null,
    caption: row.caption,
    photo_type: row.photo_type,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

export function bucketJobPhotos(
  rows: ServerJobPhotoRow[],
  lastPulledAtMs: number,
  deletedAppointmentIds: ReadonlySet<string> = new Set(),
): SyncChangeSet<LocalJobPhotoRaw> {
  const deleted = new Set<string>();
  const live: LocalJobPhotoRaw[] = [];
  for (const row of rows) {
    if (row.appointment_id !== null && deletedAppointmentIds.has(row.appointment_id)) {
      deleted.add(row.id);
      continue;
    }
    live.push(mapJobPhotoToLocal(row));
  }
  return { created: bucketByCreatedAt(live, lastPulledAtMs), updated: [], deleted: [...deleted] };
}

// --- technician_locations ← location_history ---------------------------------

export interface ServerLocationRow {
  id: string;
  technician_id: string;
  latitude: number | string;
  longitude: number | string;
  accuracy: number | string | null;
  heading: number | string | null;
  speed: number | string | null;
  recorded_at: string;
}

export interface LocalTechnicianLocationRaw {
  id: string;
  technician_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

function numericOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapLocationToLocal(row: ServerLocationRow): LocalTechnicianLocationRaw {
  return {
    id: row.id,
    technician_id: row.technician_id,
    latitude: numericOrNull(row.latitude) ?? 0,
    longitude: numericOrNull(row.longitude) ?? 0,
    accuracy: numericOrNull(row.accuracy),
    heading: numericOrNull(row.heading),
    speed: numericOrNull(row.speed),
    recorded_at: row.recorded_at,
    created_at: row.recorded_at,
    updated_at: row.recorded_at,
  };
}

export function bucketLocations(
  rows: ServerLocationRow[],
  lastPulledAtMs: number,
): SyncChangeSet<LocalTechnicianLocationRaw> {
  const mapped = rows.map(mapLocationToLocal);
  return { created: bucketByCreatedAt(mapped, lastPulledAtMs), updated: [], deleted: [] };
}

// --- sop_steps ← job_execution_checklists (job flow, 2026-11-12) ------------
//
// The SOP checklist's performed record. Definitions live on the
// service playbook (service_playbooks.steps / components, with the
// global service_playbook_templates as fallback); the per-job
// checked state lives in job_execution_checklists — the canonical
// per-job step table (job_id + job_source 'appointment').

/** Playbook steps jsonb → ordered labels. Entries are {label} objects or plain strings. */
export function playbookStepLabels(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const labels: string[] = [];
  for (const entry of steps) {
    if (typeof entry === "string" && entry.trim() !== "") labels.push(entry.trim());
    else if (entry && typeof entry === "object" && typeof (entry as { label?: unknown }).label === "string") {
      const label = ((entry as { label: string }).label ?? "").trim();
      if (label !== "") labels.push(label);
    }
  }
  return labels;
}

/** Playbook components jsonb → the itemized "what's included" list. */
export function playbookComponentNames(components: unknown): string[] {
  return playbookStepLabels(components);
}

export interface ServerSopStepRow {
  id: string;
  job_id: string;
  step_key: string;
  step_name: string;
  step_order: number | string | null;
  status: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface LocalSopStepRaw {
  id: string;
  job_id: string;
  step_key: string;
  label: string;
  sort_index: number;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Server checklist status → the local SOP vocabulary (pending | completed). */
export function localSopStatus(serverStatus: string | null | undefined): string {
  return (serverStatus ?? "").trim().toLowerCase() === "completed" ? "completed" : "pending";
}

export function mapExecutionChecklistToLocalSopStep(row: ServerSopStepRow): LocalSopStepRaw {
  const order = typeof row.step_order === "number" ? row.step_order : Number(row.step_order ?? 0);
  return {
    id: row.id,
    job_id: row.job_id,
    step_key: row.step_key,
    label: row.step_name,
    sort_index: Number.isFinite(order) ? order : 0,
    status: localSopStatus(row.status),
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

export function bucketSopSteps(
  rows: ServerSopStepRow[],
  lastPulledAtMs: number,
  deletedAppointmentIds: ReadonlySet<string> = new Set(),
): SyncChangeSet<LocalSopStepRaw> {
  const deleted = new Set<string>();
  const live: LocalSopStepRaw[] = [];
  for (const row of rows) {
    if (deletedAppointmentIds.has(row.job_id)) {
      deleted.add(row.id);
      continue;
    }
    live.push(mapExecutionChecklistToLocalSopStep(row));
  }
  const { created, updated } = bucketByTimestamps(live, lastPulledAtMs);
  const upserted = new Set([...created, ...updated].map((row) => row.id));
  for (const id of upserted) deleted.delete(id);
  return { created, updated, deleted: [...deleted] };
}
