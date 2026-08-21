import { applyMapping, autoMapHeaders } from "./mapping.service";
import { extractServiceHistory } from "./import-detection.service";
import type {
  BatchStatus,
  FieldMapping,
  ImportJobSetup,
  VehicleImportBatch,
  VehicleImportRow,
  VehicleImportSession,
  VehicleProfileInput,
} from "../types";

/**
 * Map a source row to a vehicle payload, then fold in the service history
 * captured from YES/NO date columns (which are not vehicle fields).
 */
function buildRowPayload(raw: Record<string, unknown>, mapping: FieldMapping[]): Partial<VehicleProfileInput> {
  const mapped = applyMapping(raw, mapping);
  const history = extractServiceHistory(raw);
  if (history.lastServiceDate) mapped.lastServiceDate = history.lastServiceDate;
  if (history.note) mapped.serviceHistoryNote = history.note;
  return mapped;
}

export function buildBatch(args: {
  sourceFileName: string;
  sourceFileType: "csv" | "xlsx" | "paste";
  createdBy: string;
  headers: string[];
  rows: Record<string, unknown>[];
  sheetTitle?: string | null;
  footnotes?: string[];
  droppedRows?: number;
}): VehicleImportSession {
  const mapping = autoMapHeaders(args.headers);
  const batchId = crypto.randomUUID();

  const rows: VehicleImportRow[] = args.rows.map((raw, index) => ({
    id: crypto.randomUUID(),
    batchId,
    rowIndex: index + 1,
    rawPayload: raw,
    normalizedPayload: raw,
    mappedPayload: buildRowPayload(raw, mapping),
    validationStatus: "pending",
    validationMessages: [] as VehicleImportRow["validationMessages"],
    duplicateStatus: "none",
    decodeStatus: "not_started",
    commitStatus: "pending",
  }));

  const batch: VehicleImportBatch = {
    id: batchId,
    sourceFileName: args.sourceFileName,
    sourceFileType: args.sourceFileType,
    totalRows: rows.length,
    parsedRows: rows.length,
    readyRows: 0,
    warningRows: 0,
    errorRows: 0,
    duplicateRows: 0,
    committedRows: 0,
    status: "parsed",
    createdAt: new Date().toISOString(),
    createdBy: args.createdBy,
    mapping,
    headers: args.headers,
    sheetTitle: args.sheetTitle ?? null,
    footnotes: args.footnotes ?? [],
    droppedRows: args.droppedRows ?? 0,
    jobSetup: null,
  };

  return { batch, rows };
}

export function applyBatchMapping(session: VehicleImportSession, mapping: FieldMapping[]): VehicleImportSession {
  const rows = session.rows.map((row) => ({ ...row, mappedPayload: buildRowPayload(row.normalizedPayload, mapping) }));
  return {
    batch: recalcBatchStats({ ...session.batch, mapping }, rows, "mapped"),
    rows,
  };
}

/**
 * Client and location come from the Job Setup step, not from the sheet, so they
 * are stamped onto every row's payload before validation and commit.
 */
export function applyJobSetupToSession(session: VehicleImportSession, setup: ImportJobSetup): VehicleImportSession {
  const rows = session.rows.map((row) => ({
    ...row,
    mappedPayload: {
      ...row.mappedPayload,
      customerId: setup.fleetClientId ?? row.mappedPayload.customerId,
      locationId: setup.fleetLocationId ?? row.mappedPayload.locationId,
      contractId: setup.fleetContractId ?? row.mappedPayload.contractId,
      serviceProfile: setup.serviceRuleId ?? row.mappedPayload.serviceProfile,
    },
  }));

  return { batch: { ...session.batch, jobSetup: setup }, rows };
}

export function recalcBatchStats(batch: VehicleImportBatch, rows: VehicleImportRow[], nextStatus?: BatchStatus): VehicleImportBatch {
  const readyRows = rows.filter((row) => row.validationStatus === "valid").length;
  const warningRows = rows.filter((row) => row.validationStatus === "needs_review" || row.validationStatus === "pending").length;
  const errorRows = rows.filter((row) => row.validationStatus === "blocked" || row.validationStatus === "failed").length;
  const duplicateRows = rows.filter((row) => row.duplicateStatus === "exact_match" || row.duplicateStatus === "likely_duplicate" || row.duplicateStatus === "conflict").length;
  const committedRows = rows.filter((row) => row.commitStatus === "committed").length;

  return {
    ...batch,
    readyRows,
    warningRows,
    errorRows,
    duplicateRows,
    committedRows,
    status: nextStatus ?? batch.status,
  };
}
