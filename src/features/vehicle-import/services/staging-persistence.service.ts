import { supabase } from "@/integrations/supabase/client";
import type { VehicleImportBatch, VehicleImportRow } from "../types";

type DynamicTable = {
  upsert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
  insert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
  select: (columns?: string) => DynamicQuery;
  eq: (column: string, value: unknown) => DynamicQuery;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  order: (column: string) => Promise<{ data: unknown[]; error: { message: string } | null }>;
};

type DynamicQuery = {
  eq: (column: string, value: unknown) => DynamicQuery;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  order: (column: string) => Promise<{ data: unknown[]; error: { message: string } | null }>;
};

type DynamicSupabase = {
  from: (table: string) => DynamicTable;
};

const db = supabase as unknown as DynamicSupabase;

function fingerprintKey(hash: string) {
  return `vehicle_import_upload_${hash}`;
}

export async function persistImportBatch(batch: VehicleImportBatch): Promise<void> {
  const { error } = await db.from("vehicle_import_batches").upsert({
    id: batch.id,
    source_file_name: batch.sourceFileName,
    source_file_type: batch.sourceFileType,
    total_rows: batch.totalRows,
    parsed_rows: batch.parsedRows,
    ready_rows: batch.readyRows,
    warning_rows: batch.warningRows,
    error_rows: batch.errorRows,
    duplicate_rows: batch.duplicateRows,
    committed_rows: batch.committedRows,
    status: batch.status,
    created_at: batch.createdAt,
    created_by: batch.createdBy,
    mapping_payload: batch.mapping,
    headers_payload: batch.headers,
    context_payload: {
      sheetTitle: batch.sheetTitle ?? null,
      footnotes: batch.footnotes ?? [],
      droppedRows: batch.droppedRows ?? 0,
      jobSetup: batch.jobSetup ?? null,
    },
  });
  if (error) {
    console.warn("[vehicle-import] persistImportBatch failed", error.message);
  }
}

export async function persistImportRows(rows: VehicleImportRow[]): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((row) => ({
    id: row.id,
    batch_id: row.batchId,
    row_index: row.rowIndex,
    raw_payload: row.rawPayload,
    normalized_payload: row.normalizedPayload,
    mapped_payload: row.mappedPayload,
    decoded_payload: row.decodedPayload || null,
    validation_status: row.validationStatus,
    previous_validation_status: row.previousValidationStatus || null,
    validation_messages: row.validationMessages,
    duplicate_status: row.duplicateStatus,
    decode_status: row.decodeStatus,
    existing_vehicle_id: row.existingVehicleId || null,
    resolution_payload: row.resolutionPayload || null,
    spec_payload: row.specPayload || null,
    commit_status: row.commitStatus,
  }));

  const { error } = await db.from("vehicle_import_rows").upsert(payload);
  if (error) {
    console.warn("[vehicle-import] persistImportRows failed", error.message);
  }
}

type PersistedBatchRow = {
  id: string;
  source_file_name: string;
  source_file_type: "csv" | "xlsx" | "paste";
  total_rows: number;
  parsed_rows: number;
  ready_rows: number;
  warning_rows: number;
  error_rows: number;
  duplicate_rows: number;
  committed_rows: number;
  status: VehicleImportBatch["status"];
  created_at: string;
  created_by: string;
  mapping_payload: VehicleImportBatch["mapping"];
  headers_payload: string[];
  context_payload?: {
    sheetTitle?: string | null;
    footnotes?: string[];
    droppedRows?: number;
    jobSetup?: VehicleImportBatch["jobSetup"];
  } | null;
};

type PersistedRow = {
  id: string;
  batch_id: string;
  row_index: number;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  mapped_payload: VehicleImportRow["mappedPayload"];
  decoded_payload: VehicleImportRow["decodedPayload"] | null;
  validation_status: VehicleImportRow["validationStatus"];
  previous_validation_status?: VehicleImportRow["validationStatus"] | null;
  validation_messages: VehicleImportRow["validationMessages"];
  duplicate_status: VehicleImportRow["duplicateStatus"];
  decode_status: VehicleImportRow["decodeStatus"];
  existing_vehicle_id: string | null;
  resolution_payload: VehicleImportRow["resolutionPayload"] | null;
  spec_payload?: VehicleImportRow["specPayload"] | null;
  commit_status: VehicleImportRow["commitStatus"];
};

export async function hydrateImportSession(batchId: string): Promise<{ batch: VehicleImportBatch; rows: VehicleImportRow[] } | null> {
  const { data: batchData, error: batchError } = await db.from("vehicle_import_batches").select("*").eq("id", batchId).single();
  if (batchError || !batchData) return null;

  const { data: rowData, error: rowError } = await db.from("vehicle_import_rows").select("*").eq("batch_id", batchId).order("row_index");
  if (rowError) return null;

  const batchRow = batchData as PersistedBatchRow;
  const rows = ((rowData || []) as PersistedRow[]).map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    rowIndex: row.row_index,
    rawPayload: row.raw_payload,
    normalizedPayload: row.normalized_payload,
    mappedPayload: row.mapped_payload || {},
    decodedPayload: row.decoded_payload || undefined,
    validationStatus: row.validation_status,
    previousValidationStatus: row.previous_validation_status || undefined,
    validationMessages: row.validation_messages || [],
    duplicateStatus: row.duplicate_status,
    decodeStatus: row.decode_status,
    existingVehicleId: row.existing_vehicle_id || undefined,
    resolutionPayload: row.resolution_payload || undefined,
    specPayload: row.spec_payload || undefined,
    commitStatus: row.commit_status,
  }));

  return {
    batch: {
      id: batchRow.id,
      sourceFileName: batchRow.source_file_name,
      sourceFileType: batchRow.source_file_type,
      totalRows: batchRow.total_rows,
      parsedRows: batchRow.parsed_rows,
      readyRows: batchRow.ready_rows,
      warningRows: batchRow.warning_rows,
      errorRows: batchRow.error_rows,
      duplicateRows: batchRow.duplicate_rows,
      committedRows: batchRow.committed_rows,
      status: batchRow.status,
      createdAt: batchRow.created_at,
      createdBy: batchRow.created_by,
      mapping: batchRow.mapping_payload || [],
      headers: batchRow.headers_payload || [],
      sheetTitle: batchRow.context_payload?.sheetTitle ?? null,
      footnotes: batchRow.context_payload?.footnotes ?? [],
      droppedRows: batchRow.context_payload?.droppedRows ?? 0,
      jobSetup: batchRow.context_payload?.jobSetup ?? null,
    },
    rows,
  };
}

export async function listImportHistory(createdBy?: string): Promise<Array<{
  id: string;
  sourceFileName: string;
  status: VehicleImportBatch["status"];
  totalRows: number;
  committedRows: number;
  createdAt: string;
}>> {
  let query = db.from("vehicle_import_batches").select("id,source_file_name,status,total_rows,committed_rows,created_at");
  if (createdBy) {
    query = query.eq("created_by", createdBy) as unknown as typeof query;
  }
  const { data, error } = await query.order("created_at");
  if (error) {
    console.warn("[vehicle-import] listImportHistory failed", error.message);
    return [];
  }
  return ((data || []) as Array<{
    id: string;
    source_file_name: string;
    status: VehicleImportBatch["status"];
    total_rows: number;
    committed_rows: number;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    sourceFileName: row.source_file_name,
    status: row.status,
    totalRows: row.total_rows,
    committedRows: row.committed_rows,
    createdAt: row.created_at,
  }));
}

export async function appendImportAuditLog(input: {
  batchId: string;
  rowId?: string;
  eventType:
    | "import_started"
    | "mapping_applied"
    | "decode_completed"
    | "validation_completed"
    | "duplicates_detected"
    | "row_resolution_updated"
    | "commit_started"
    | "commit_completed"
    | "commit_failed";
  details: Record<string, unknown>;
  actorId: string;
}): Promise<void> {
  const { error } = await db.from("vehicle_import_audit_log").insert({
    batch_id: input.batchId,
    row_id: input.rowId || null,
    event_type: input.eventType,
    details: input.details,
    actor_id: input.actorId,
  });
  if (error) {
    console.warn("[vehicle-import] appendImportAuditLog failed", error.message);
  }
}

export async function findExistingBatchByFingerprint(input: {
  userId: string;
  fileHash: string;
}): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("fleet_operation_batches")
    .select("id,status,context")
    .eq("user_id", input.userId)
    .eq("operation_type", "vehicle_import_upload")
    .eq("idempotency_key", fingerprintKey(input.fileHash))
    .in("status", ["running", "completed"])
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error || !data) return null;
  return String((data.context as Record<string, unknown> | null)?.batch_id || "") || null;
}

export async function registerBatchFingerprint(input: {
  userId: string;
  fileHash: string;
  batchId: string;
  sourceFileName: string;
  totalRows: number;
}): Promise<void> {
  await (supabase as any)
    .from("fleet_operation_batches")
    .insert({
      user_id: input.userId,
      operation_type: "vehicle_import_upload",
      status: "completed",
      idempotency_key: fingerprintKey(input.fileHash),
      context: {
        batch_id: input.batchId,
        source_file_name: input.sourceFileName,
        total_rows: input.totalRows,
        file_hash: input.fileHash,
      },
      completed_at: new Date().toISOString(),
    });
}
