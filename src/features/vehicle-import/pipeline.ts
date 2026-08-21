import { fetchFleetVehiclesList } from "@/application/queries";
import { buildBatch, recalcBatchStats, applyJobSetupToSession } from "./services/batch.service";
import { commitRows } from "./services/commit.service";
import { runDecodeOrchestration } from "./services/decode-orchestrator.service";
import { resolveSpecsForRows } from "./services/spec-enrichment.service";
import { detectDuplicates } from "./services/duplicate.service";
import { applyBatchMapping } from "./services/batch.service";
import { autoMapHeaders } from "./services/mapping.service";
import { detectImportType, classifyColumns } from "./services/import-detection.service";
import { parseImportFile as parseFile, parsePastedTable as parsePaste } from "./services/parser.service";
import { applyValidationToRows } from "./services/validation.service";
import type {
  FieldMapping,
  ImportJobSetup,
  ImportSummary,
  VehicleImportBatch,
  VehicleImportSession,
} from "./types";

export const parseImportFile = parseFile;
export const parsePastedTable = parsePaste;

export function createInitialSession(input: {
  headers: string[];
  rows: Record<string, unknown>[];
  sourceFileName: string;
  sourceFileType: "csv" | "xlsx" | "paste";
  createdBy: string;
  sheetTitle?: string | null;
  footnotes?: string[];
  droppedRows?: number;
}): VehicleImportSession {
  return buildBatch(input);
}

export function remapSession(session: VehicleImportSession, mapping: FieldMapping[]): VehicleImportSession {
  return applyBatchMapping(session, mapping);
}

export function applyJobSetup(session: VehicleImportSession, setup: ImportJobSetup): VehicleImportSession {
  return applyJobSetupToSession(session, setup);
}

export async function decodeValidateAndDetectDuplicates(
  session: VehicleImportSession,
  onProgress: (update: {
    decodedRows?: number;
    validatedRows?: number;
    duplicateCheckedRows?: number;
    specResolvedRows?: number;
  }) => void
): Promise<VehicleImportSession> {
  const decodedRows = await runDecodeOrchestration(session.rows, 4);
  onProgress({ decodedRows: decodedRows.length });

  const specResolvedRows = await resolveSpecsForRows(decodedRows, 4);
  onProgress({ specResolvedRows: specResolvedRows.length });

  const validatedRows = applyValidationToRows(specResolvedRows);
  onProgress({ validatedRows: validatedRows.length });

  const existingVehicles = await fetchFleetVehiclesList();
  const dedupedRows = detectDuplicates(validatedRows, existingVehicles);
  onProgress({ duplicateCheckedRows: dedupedRows.length });

  return {
    batch: recalcBatchStats(session.batch, dedupedRows, "review"),
    rows: dedupedRows,
  };
}

export async function commitImportSession(session: VehicleImportSession, userId: string): Promise<VehicleImportSession> {
  return commitRows(session, userId);
}

export function buildSummary(rows: VehicleImportSession["rows"]): ImportSummary {
  return {
    importedSuccessfully: rows.filter((row) => row.commitStatus === "committed").length,
    skipped: rows.filter((row) => row.commitStatus === "skipped").length,
    duplicatesFound: rows.filter((row) => row.duplicateStatus !== "new_record" && row.duplicateStatus !== "none").length,
    failedValidation: rows.filter((row) => row.validationStatus === "blocked" || row.validationStatus === "failed").length,
    warningsAccepted: rows.filter((row) => row.validationStatus === "imported" && row.validationMessages.some((m) => m.severity === "warning")).length,
  };
}

export { autoMapHeaders, detectImportType, classifyColumns };
export type { VehicleImportBatch };
