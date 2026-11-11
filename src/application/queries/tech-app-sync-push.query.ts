/**
 * tech-app-sync-push.query — pure mapping for the tech app's
 * Watermelon sync push (SYNC-2, 2026-11-11): POST
 * /v1/tech-app/sync/push applies the device change sets to the
 * server tables.
 *
 * The wire rows are the LOCAL shapes (see tech-app-sync.query.ts
 * for the pull inverses): jobs, inspection_reports,
 * inspection_steps, inspection_media, recommendations, job_photos,
 * technician_locations, each { created, updated, deleted }.
 *
 * Rules the handler is built on, all decided with the pull:
 * - Jobs are server-born: the push never creates or deletes an
 *   appointment; a job status change rides the canonical
 *   technician_transition_job_v1 RPC.
 * - Locally-born rows carry client-generated UUIDs (the app seam
 *   assigns them at creation) and the server adopts a UUID id as
 *   the row's primary key, so a push is idempotent. A legacy
 *   non-UUID id gets a server-generated UUID instead — the local
 *   row keeps its own id on the device, so pre-update rows can
 *   duplicate once on the next pull; bounded and known.
 * - Steps are REPLACE-BY-REPORT: the app seam destroys and
 *   recreates a report's steps on every save (the office /perform
 *   save does the same full replace), so the push replaces the
 *   server's result rows for any report it applies.
 * - Dates travel as ISO strings; inspection_media historically
 *   sent epoch-ms numbers, so both forms parse here.
 * - Nothing is invented: a field the device did not send stays
 *   null on the server, exactly as the pull keeps unknown null.
 */

export interface PushChangeSet<Raw = Record<string, unknown>> {
  created: Raw[];
  updated: Raw[];
  deleted: string[];
}

export type PushChanges = Record<string, PushChangeSet>;

export interface TableCounts {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export const emptyCounts = (): TableCounts => ({
  created: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Adopt a client UUID as the server id; anything else gets a fresh one. */
export function adoptId(value: unknown, generate: () => string): string {
  return isUuid(value) ? value : generate();
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** ISO string or epoch-ms number → ISO string; anything else null. */
export function parseWireDate(value: unknown): string | null {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return null;
}

/** Local step vocabulary → the production inspection_results union. */
export function serverStepStatus(local: unknown): string {
  switch (typeof local === "string" ? local.trim().toLowerCase() : "") {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "warn":
      return "warning";
    case "na":
      return "not_applicable";
    case "unchecked":
      return "not_checked";
    default:
      return "not_checked";
  }
}

/** Local report vocabulary → service_inspections status. */
export function serverReportStatus(local: unknown): string {
  return typeof local === "string" && local.trim().toLowerCase() === "completed"
    ? "completed"
    : "draft";
}

/**
 * Local job status → the technician_transition_job_v1 next_status
 * the RPC performs, or null when the push must not move the job
 * (assigned is the server's own starting state; anything unknown
 * is not a transition). in_progress rides "started" — the dispatch
 * event vocabulary the RPC speaks.
 */
export function jobTransitionFor(local: unknown): string | null {
  switch (typeof local === "string" ? local.trim().toLowerCase() : "") {
    case "en_route":
      return "en_route";
    case "in_progress":
      return "started";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

/** A stored reference that never left the device (photoFiles.ts). */
export function isLocalOnlyReference(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("local-file://");
}

/** The tables the push applies, in apply order. */
export const PUSH_TABLES = [
  "jobs",
  "inspection_reports",
  "inspection_steps",
  "inspection_media",
  "recommendations",
  "job_photos",
  "technician_locations",
] as const;

/** Read one table's change set out of the push body, defensively. */
export function changeSetFor(
  changes: PushChanges | null | undefined,
  table: string,
): PushChangeSet {
  const raw = changes && typeof changes === "object" ? changes[table] : undefined;
  if (!raw || typeof raw !== "object") {
    return { created: [], updated: [], deleted: [] };
  }
  return {
    created: Array.isArray(raw.created) ? raw.created : [],
    updated: Array.isArray(raw.updated) ? raw.updated : [],
    deleted: Array.isArray(raw.deleted)
      ? raw.deleted.filter((id): id is string => typeof id === "string")
      : [],
  };
}
