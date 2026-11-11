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

export type LocalJobStatus = "assigned" | "en_route" | "in_progress" | "completed";

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
  address: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: LocalJobStatus;
  estimated_cost: number | null;
  notes: string | null;
  services_json: string | null;
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
  address: string | null;
  startsAt: string;
  endsAt: string | null;
  durationMinutes: number | null;
  estimatedCost: number | null;
  notes: string | null;
  services: Array<{ name: string; price: number }>;
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
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return "assigned";
  }
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
    address: appt.address,
    starts_at: appt.startsAt,
    ends_at: endsAt,
    duration_minutes: duration,
    status: localJobStatus(appt.serverStatus),
    estimated_cost: appt.estimatedCost,
    notes: appt.notes,
    services_json: appt.services.length > 0 ? JSON.stringify(appt.services) : null,
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
