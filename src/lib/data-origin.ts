/**
 * Data Origin utilities — filters and labels for the lineage system.
 */

export type DataOrigin = "system_created" | "legacy_import" | "integration";

export interface HasDataOrigin {
  data_origin?: DataOrigin | string | null;
}

/**
 * Filter an array to only system-created records (excludes legacy imports).
 * If `includeLegacy` is true, returns all records unfiltered.
 */
export function filterByOrigin<T extends HasDataOrigin>(
  records: T[],
  includeLegacy: boolean
): T[] {
  if (includeLegacy) return records;
  return records.filter(
    (r) => !r.data_origin || r.data_origin === "system_created"
  );
}

/** Human-readable label for a data origin value */
export function originLabel(origin?: string | null): string | null {
  if (!origin || origin === "system_created") return null;
  if (origin === "legacy_import") return "Imported";
  if (origin === "integration") return "Integration";
  return origin;
}

/** Whether a record is imported (legacy or integration) */
export function isImported(origin?: string | null): boolean {
  return origin === "legacy_import" || origin === "integration";
}
