/**
 * CARFAX feed generator — builds the HIST and daily PROD files for one
 * workspace and, when asked, delivers them by SFTP.
 *
 * Pipeline (every step is recorded in public.carfax_feed_runs):
 *   1. Pull the workspace's completed service records with the exact query
 *      the /v1/carfax/export-services route serves, and the workspace's
 *      CARFAX identity from workspace_settings (the same composition the
 *      /v1/carfax/settings route returns).
 *   2. Map rows to feed records with the shared construction
 *      (src/lib/carfax/feed). HIST = all completed history; PROD = one
 *      service date (default today, UTC — the same day rule the manual
 *      export uses).
 *   3. Validate: every record must pass the creation-time rules and the
 *      built file must be structurally sound. Any failure refuses the
 *      whole file — nothing is emitted or uploaded.
 *   4. Deliver (only when upload is requested and this is not a dry run):
 *      SFTP with environment-only credentials. Missing configuration is a
 *      recorded, safe failure — never a crash, never a partial send.
 *
 * A dry run performs steps 1–3 and records the run; it makes no network
 * connection and writes no file anywhere.
 */
import { createHash } from "node:crypto";
import {
  carfaxFeedFileName,
  formatCarfaxFeed,
  mapCarfaxSourceRows,
} from "@/lib/carfax/feed";
import type {
  CarfaxFeedBusiness,
  CarfaxSourceRow,
} from "@/lib/carfax/feed";
import { validateCarfaxFeedContent, validateCarfaxFeedRecords } from "./validate";
import { readCarfaxSftpConfig, isCarfaxSftpConfigMissing } from "./sftp-config";
import type { CarfaxSftpConfigResult } from "./sftp-config";
import { uploadCarfaxFeedViaSftp } from "./transfer";
import type { CarfaxUploader } from "./transfer";
import type { CarfaxFeedRunRecorder, CarfaxFeedRunStatus } from "./runs";

/** The export query, identical to the /v1/carfax/export-services route. */
export const CARFAX_EXPORT_SERVICES_SELECT =
  "id,vehicle_id,work_performed,metadata,completed_at,created_at,vehicles(vin,make,model,year,license_plate,plate_region,mileage,mileage_unit),service_record_line_items(id,item_type,description,quantity,labor_hours,sort_order,created_at)";

export interface CarfaxWorkspaceIdentity {
  business: CarfaxFeedBusiness;
  productDataId: string | null;
  compCode: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * The workspace's CARFAX identity, composed exactly as the
 * /v1/carfax/settings route composes it: business fields from
 * workspace_settings + workspaces.name, CARFAX identifiers from
 * workspace_settings.operational_settings.carfax.
 */
export async function fetchCarfaxWorkspaceIdentity(
  db: any,
  workspaceId: string,
): Promise<CarfaxWorkspaceIdentity | null> {
  const [{ data: workspace }, { data: settings }] = await Promise.all([
    db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    db
      .from("workspace_settings")
      .select("phone,address_line1,address_line2,city,region,postal_code,website_url,operational_settings")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (!workspace) return null;
  const operational = asObject(settings?.operational_settings);
  const carfax = asObject(operational.carfax);
  return {
    business: {
      carfax_location_id: stringOrNull(carfax.location_id),
      business_name: workspace.name || "",
      address: [settings?.address_line1, settings?.address_line2].filter(Boolean).join(", "),
      city: settings?.city || "",
      state: settings?.region || "",
      postal_code: settings?.postal_code || "",
      phone: settings?.phone || "",
      website_url: settings?.website_url || "",
    },
    productDataId: stringOrNull(carfax.product_data_id),
    compCode: stringOrNull(carfax.comp_code),
  };
}

/** The workspace's completed service records, in the export query's shape. */
export async function fetchCarfaxSourceRows(db: any, workspaceId: string): Promise<CarfaxSourceRow[]> {
  const { data, error } = await db
    .from("service_records")
    .select(CARFAX_EXPORT_SERVICES_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .not("vehicle_id", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as CarfaxSourceRow[];
}

export interface GenerateCarfaxFeedOptions {
  /** Trusted server client (service role), e.g. createSupabaseAdminClient(). */
  db: unknown;
  workspaceId: string;
  kind: "HIST" | "PROD";
  /** PROD service date (YYYY-MM-DD). Defaults to today (UTC). */
  date?: string;
  /** Generate + validate + record only. No upload, no network. */
  dryRun?: boolean;
  /** Attempt SFTP delivery after a successful build. Ignored on dry runs. */
  upload?: boolean;
  recorder: CarfaxFeedRunRecorder;
  /** Injectable for tests; defaults to the environment. */
  sftpConfig?: CarfaxSftpConfigResult;
  /** Injectable for tests; defaults to the real SFTP uploader. */
  uploader?: CarfaxUploader;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface CarfaxFeedRunResult {
  ok: boolean;
  status: Exclude<CarfaxFeedRunStatus, "running">;
  runId: string;
  fileName: string;
  recordCount: number;
  rowCount: number;
  sha256: string | null;
  /** The built file text. Null when validation refused the file. */
  content: string | null;
  /** Validation failure reasons, when status is "validation_failed". */
  errors: string[];
  error: string | null;
}

export async function generateCarfaxFeedRun(
  options: GenerateCarfaxFeedOptions,
): Promise<CarfaxFeedRunResult> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const serviceDate = options.date ?? today;
  const fileName = carfaxFeedFileName(options.kind, now);
  const db = options.db as any;
  const recorder = options.recorder;

  const runId = await recorder.start({
    workspaceId: options.workspaceId,
    kind: options.kind,
    fileName,
    dryRun: Boolean(options.dryRun),
  });

  const base: Omit<CarfaxFeedRunResult, "ok" | "status"> = {
    runId,
    fileName,
    recordCount: 0,
    rowCount: 0,
    sha256: null,
    content: null,
    errors: [],
    error: null,
  };

  const fail = async (
    status: CarfaxFeedRunResult["status"],
    error: string,
    partial: Partial<CarfaxFeedRunResult> = {},
  ): Promise<CarfaxFeedRunResult> => {
    const result: CarfaxFeedRunResult = { ...base, ...partial, ok: false, status, error };
    await recorder.finish(runId, {
      status,
      recordCount: result.recordCount,
      rowCount: result.rowCount,
      sha256: result.sha256,
      error,
    });
    return result;
  };

  try {
    const identity = await fetchCarfaxWorkspaceIdentity(db, options.workspaceId);
    if (!identity) {
      return fail("failed", `Workspace ${options.workspaceId} was not found.`);
    }

    const rows = await fetchCarfaxSourceRows(db, options.workspaceId);
    const records = mapCarfaxSourceRows(rows, options.kind, serviceDate);
    base.recordCount = records.length;

    const recordErrors = validateCarfaxFeedRecords(records, identity.business);
    if (recordErrors.length > 0) {
      return fail("validation_failed", recordErrors.join("\n"), {
        recordCount: records.length,
        errors: recordErrors,
      });
    }

    const content = formatCarfaxFeed(records, identity.business);
    const contentErrors = validateCarfaxFeedContent(content);
    if (contentErrors.length > 0) {
      return fail("validation_failed", contentErrors.join("\n"), {
        recordCount: records.length,
        errors: contentErrors,
      });
    }

    const rowCount = content.split("\n").length - 1;
    const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
    const built: Partial<CarfaxFeedRunResult> = {
      recordCount: records.length,
      rowCount,
      sha256,
      content,
    };

    if (options.dryRun) {
      const result: CarfaxFeedRunResult = { ...base, ...built, ok: true, status: "dry_run" };
      await recorder.finish(runId, {
        status: "dry_run",
        recordCount: result.recordCount,
        rowCount: result.rowCount,
        sha256: result.sha256,
        error: null,
      });
      return result;
    }

    if (!options.upload) {
      const result: CarfaxFeedRunResult = { ...base, ...built, ok: true, status: "generated" };
      await recorder.finish(runId, {
        status: "generated",
        recordCount: result.recordCount,
        rowCount: result.rowCount,
        sha256: result.sha256,
        error: null,
      });
      return result;
    }

    const sftp = options.sftpConfig ?? readCarfaxSftpConfig();
    if (isCarfaxSftpConfigMissing(sftp)) {
      return fail(
        "upload_failed",
        `CARFAX SFTP is not configured: missing ${sftp.missing.join(", ")}.`,
        built,
      );
    }

    const uploader = options.uploader ?? uploadCarfaxFeedViaSftp;
    try {
      await uploader(sftp.config, fileName, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return fail("upload_failed", message, built);
    }

    const result: CarfaxFeedRunResult = { ...base, ...built, ok: true, status: "uploaded" };
    await recorder.finish(runId, {
      status: "uploaded",
      recordCount: result.recordCount,
      rowCount: result.rowCount,
      sha256: result.sha256,
      error: null,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    try {
      return await fail("failed", message, { recordCount: base.recordCount });
    } catch {
      throw error;
    }
  }
}

/**
 * Workspaces enrolled for the feed: a CARFAX location ID is set in
 * workspace_settings.operational_settings.carfax. Used by the daily cron to
 * find its shops. (The JSON filter is applied in memory — the settings table
 * is one row per workspace and the enrolled set is small.)
 */
export async function listCarfaxEnrolledWorkspaceIds(db: any): Promise<string[]> {
  const { data, error } = await db
    .from("workspace_settings")
    .select("workspace_id,operational_settings")
    .not("operational_settings", "is", null);
  if (error) throw error;
  const ids: string[] = [];
  for (const row of (data ?? []) as Array<{ workspace_id: string; operational_settings: unknown }>) {
    const carfax = asObject(asObject(row.operational_settings).carfax);
    if (stringOrNull(carfax.location_id)) ids.push(row.workspace_id);
  }
  return ids;
}
