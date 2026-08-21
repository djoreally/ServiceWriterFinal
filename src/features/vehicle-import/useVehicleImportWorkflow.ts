import { useMemo, useState } from "react";
import {
  applyJobSetup,
  buildSummary,
  commitImportSession,
  createInitialSession,
  decodeValidateAndDetectDuplicates,
  parseImportFile,
  parsePastedTable,
  remapSession,
} from "./pipeline";
import {
  appendImportAuditLog,
  findExistingBatchByFingerprint,
  hydrateImportSession,
  persistImportBatch,
  persistImportRows,
  registerBatchFingerprint,
} from "./services/staging-persistence.service";
import { runDecodeForRow } from "./services/decode-orchestrator.service";
import { resolveRowSpecs } from "./services/spec-enrichment.service";
import { applyValidation } from "./services/validation.service";
import { rollbackImportedBatch } from "./services/commit.service";
import { createWorkOrdersForBatch, type WorkOrderHandoffResult } from "./services/work-order-handoff.service";

import type {
  FieldMapping,
  ImportJobSetup,
  ImportProcessingProgress,
  ImportStep,
  ImportSummary,
  VehicleImportRowStatus,
  VehicleImportSession,
} from "./types";

export function useVehicleImportWorkflow(userId?: string) {
  const [step, setStep] = useState<ImportStep>("landing");
  const [session, setSession] = useState<VehicleImportSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ImportProcessingProgress>({
    parsedRows: 0,
    decodedRows: 0,
    validatedRows: 0,
    duplicateCheckedRows: 0,
    specResolvedRows: 0,
    totalRows: 0,
  });
  const [workOrderResult, setWorkOrderResult] = useState<WorkOrderHandoffResult | null>(null);
  const [decodingRowIds, setDecodingRowIds] = useState<string[]>([]);


  const summary: ImportSummary = useMemo(() => buildSummary(session?.rows || []), [session]);

  const statusCounts = useMemo(() => {
    const rows = session?.rows || [];
    const base: Record<VehicleImportRowStatus, number> = {
      pending: 0,
      valid: 0,
      needs_review: 0,
      blocked: 0,
      imported: 0,
      failed: 0,
    };

    rows.forEach((row) => {
      base[row.validationStatus] += 1;
    });

    return base;
  }, [session]);

  const computeFingerprint = async (input: string): Promise<string> => {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const loadFile = async (file: File, createdBy: string) => {
    setLoading(true);
    const content = await file.text();
    const fileHash = await computeFingerprint(`${file.name}:${file.type}:${content}`);
    const existingBatchId = await findExistingBatchByFingerprint({ userId: createdBy, fileHash });
    if (existingBatchId) {
      await resumeBatch(existingBatchId);
      setLoading(false);
      return;
    }
    const parsed = await parseImportFile(file);
    const next = createInitialSession({
      headers: parsed.headers,
      rows: parsed.rows,
      sourceFileName: file.name,
      sourceFileType: parsed.fileType,
      createdBy,
      sheetTitle: parsed.sheetTitle,
      footnotes: parsed.footnotes,
      droppedRows: parsed.droppedRows,
    });
    setSession(next);
    await persistImportBatch(next.batch);
    await persistImportRows(next.rows);
    await registerBatchFingerprint({
      userId: createdBy,
      fileHash,
      batchId: next.batch.id,
      sourceFileName: file.name,
      totalRows: parsed.rows.length,
    });
    await appendImportAuditLog({
      batchId: next.batch.id,
      actorId: createdBy,
      eventType: "import_started",
      details: { sourceFileType: parsed.fileType, sourceFileName: file.name, totalRows: parsed.rows.length, file_hash: fileHash },
    });
    setProcessingProgress((prev) => ({ ...prev, parsedRows: parsed.rows.length, totalRows: parsed.rows.length }));
    setStep("setup");
    setLoading(false);
  };

  const loadPaste = async (input: string, createdBy: string) => {
    const fileHash = await computeFingerprint(`paste:${input}`);
    const existingBatchId = await findExistingBatchByFingerprint({ userId: createdBy, fileHash });
    if (existingBatchId) {
      await resumeBatch(existingBatchId);
      return;
    }
    const parsed = parsePastedTable(input);
    const next = createInitialSession({
      headers: parsed.headers,
      rows: parsed.rows,
      sourceFileName: "manual-paste",
      sourceFileType: "paste",
      createdBy,
      sheetTitle: parsed.sheetTitle,
      footnotes: parsed.footnotes,
      droppedRows: parsed.droppedRows,
    });
    setSession(next);
    void persistImportBatch(next.batch);
    void persistImportRows(next.rows);
    void registerBatchFingerprint({
      userId: createdBy,
      fileHash,
      batchId: next.batch.id,
      sourceFileName: "manual-paste",
      totalRows: parsed.rows.length,
    });
    void appendImportAuditLog({
      batchId: next.batch.id,
      actorId: createdBy,
      eventType: "import_started",
      details: { sourceFileType: "paste", sourceFileName: "manual-paste", totalRows: parsed.rows.length, file_hash: fileHash },
    });
    setProcessingProgress((prev) => ({ ...prev, parsedRows: parsed.rows.length, totalRows: parsed.rows.length }));
    setStep("setup");
  };

  /** Stamp the client/location/job intent from the Job Setup step onto every row. */
  const applyJobSetupStep = (setup: ImportJobSetup) => {
    if (!session) return;
    const next = applyJobSetup(session, setup);
    setSession(next);
    void persistImportBatch(next.batch);
    void persistImportRows(next.rows);
    void appendImportAuditLog({
      batchId: next.batch.id,
      actorId: next.batch.createdBy,
      eventType: "mapping_applied",
      details: {
        job_setup: {
          fleet_client_id: setup.fleetClientId,
          fleet_location_id: setup.fleetLocationId,
          service_package: setup.servicePackageCode,
          scheduled_date: setup.scheduledDate,
        },
      },
    });
    setStep("mapping");
  };

  const applyMapping = (mapping: FieldMapping[]) => {
    if (!session) return;
    const next = remapSession(session, mapping);
    setSession(next);
    void persistImportBatch(next.batch);
    void persistImportRows(next.rows);
    void appendImportAuditLog({
      batchId: next.batch.id,
      actorId: next.batch.createdBy,
      eventType: "mapping_applied",
      details: { mappedColumns: mapping.length },
    });
  };

  const processSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      setStep("processing");
      const processed = await decodeValidateAndDetectDuplicates(session, (update) => {
        setProcessingProgress((prev) => ({ ...prev, ...update, totalRows: session.rows.length }));
      });
      setSession(processed);
      await persistImportBatch(processed.batch);
      await persistImportRows(processed.rows);
      await appendImportAuditLog({
        batchId: processed.batch.id,
        actorId: processed.batch.createdBy,
        eventType: "decode_completed",
        details: {
          decodedRows: processed.rows.filter((row) => row.decodeStatus === "success" || row.decodeStatus === "partial").length,
          invalidVinRows: processed.rows.filter((row) => row.decodeStatus === "invalid_vin").length,
        },
      });
      await appendImportAuditLog({
        batchId: processed.batch.id,
        actorId: processed.batch.createdBy,
        eventType: "validation_completed",
        details: {
          reviewRows: processed.rows.filter((row) => row.validationStatus === "needs_review").length,
          blockedRows: processed.rows.filter((row) => row.validationStatus === "blocked").length,
        },
      });
      await appendImportAuditLog({
        batchId: processed.batch.id,
        actorId: processed.batch.createdBy,
        eventType: "duplicates_detected",
        details: {
          duplicates: processed.rows.filter((row) => row.duplicateStatus === "exact_match" || row.duplicateStatus === "likely_duplicate").length,
          conflicts: processed.rows.filter((row) => row.duplicateStatus === "conflict").length,
        },
      });
      setStep("review");
    } catch (error) {
      const failed = { ...session, batch: { ...session.batch, status: "failed" as const } };
      setSession(failed);
      await persistImportBatch(failed.batch);
      await appendImportAuditLog({
        batchId: failed.batch.id,
        actorId: failed.batch.createdBy,
        eventType: "validation_completed",
        details: { failure: true, error: error instanceof Error ? error.message : "process failed" },
      });
      setStep("review");
    } finally {
      setLoading(false);
    }
  };

  const setRowOverride = (rowId: string, patch: Record<string, unknown>) => {
    if (!session) return;
    const next = {
      ...session,
      rows: session.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              resolutionPayload: {
                ...(row.resolutionPayload || {}),
                ...patch,
              },
              validationStatus: "pending" as const,
              commitStatus: "pending" as const,
            }
          : row
      ),
    };
    setSession(next);
    void persistImportRows(next.rows);
    void appendImportAuditLog({
      batchId: session.batch.id,
      rowId: rowId,
      actorId: session.batch.createdBy,
      eventType: "row_resolution_updated",
      details: { patch },
    });
  };

  const setRowSkip = (rowId: string, skip: boolean) => {
    if (!session) return;
    const next = {
      ...session,
      rows: session.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              previousValidationStatus: row.validationStatus,
              commitStatus: (skip ? "skipped" : "pending") as "skipped" | "pending",
              validationStatus: skip ? row.validationStatus : row.previousValidationStatus || row.validationStatus,
            }
          : row
      ),
    };
    setSession(next);
    void persistImportRows(next.rows);
    void appendImportAuditLog({
      batchId: session.batch.id,
      rowId: rowId,
      actorId: session.batch.createdBy,
      eventType: "row_resolution_updated",
      details: { skipped: skip },
    });
  };

  const bulkApproveByStatus = (statuses: VehicleImportRowStatus[]) => {
    if (!session) return;
    const next = {
      ...session,
      rows: session.rows.map((row) => {
        if (!statuses.includes(row.validationStatus)) return row;
        if (row.validationStatus === "needs_review") {
          return { ...row, validationStatus: "valid" as const };
        }
        return row;
      }),
    };
    setSession(next);
    void persistImportRows(next.rows);
  };

  /**
   * Manual per-row decode used by the Review + Resolve step. Forces a fresh
   * server-side decode (bypassing the in-memory cache) for one VIN, then
   * re-runs spec enrichment and validation for that row only.
   */
  const decodeRow = async (rowId: string, vinOverride?: string) => {
    if (!session) return;
    const target = session.rows.find((row) => row.id === rowId);
    if (!target) return;

    setDecodingRowIds((prev) => [...prev, rowId]);
    try {
      const withVin = vinOverride
        ? {
            ...target,
            resolutionPayload: { ...(target.resolutionPayload || {}), vin: vinOverride.trim().toUpperCase() },
          }
        : target;
      const decoded = await runDecodeForRow({ ...withVin, validationMessages: [] }, { force: true });
      const withSpecs = await resolveRowSpecs(decoded);
      const validated = applyValidation(withSpecs);
      const next = {
        ...session,
        rows: session.rows.map((row) => (row.id === rowId ? validated : row)),
      };
      setSession(next);
      void persistImportRows(next.rows);
      void appendImportAuditLog({
        batchId: session.batch.id,
        rowId,
        actorId: session.batch.createdBy,
        eventType: "row_resolution_updated",
        details: { manual_decode: true, decode_status: validated.decodeStatus, vin_override: Boolean(vinOverride) },
      });
    } finally {
      setDecodingRowIds((prev) => prev.filter((id) => id !== rowId));
    }
  };

  const commit = async () => {

    if (!session || !userId) return;
    setLoading(true);
    try {
      await appendImportAuditLog({
        batchId: session.batch.id,
        actorId: userId,
        eventType: "commit_started",
        details: {},
      });
      const committed = await commitImportSession(session, userId);
      setSession(committed);
      await persistImportBatch(committed.batch);
      await persistImportRows(committed.rows);
      await appendImportAuditLog({
        batchId: committed.batch.id,
        actorId: userId,
        eventType: "commit_completed",
        details: {
          committedRows: committed.rows.filter((row) => row.commitStatus === "committed").length,
          failedRows: committed.rows.filter((row) => row.commitStatus === "failed").length,
          skippedRows: committed.rows.filter((row) => row.commitStatus === "skipped").length,
        },
      });
      setStep("results");
    } catch (error) {
      const failed = { ...session, batch: { ...session.batch, status: "failed" as const } };
      setSession(failed);
      await persistImportBatch(failed.batch);
      await appendImportAuditLog({
        batchId: session.batch.id,
        actorId: userId,
        eventType: "commit_failed",
        details: { error: error instanceof Error ? error.message : "commit failed" },
      });
      setStep("review");
    } finally {
      setLoading(false);
    }
  };

  const createWorkOrders = async (vehicleIds?: string[]) => {
    if (!session?.batch.jobSetup) {
      const missing: WorkOrderHandoffResult = {
        draftId: null,
        createdIds: [],
        blockingValidations: [],
        error: "Job setup is missing for this batch.",
      };
      setWorkOrderResult(missing);
      return missing;
    }
    setLoading(true);
    try {
      const result = await createWorkOrdersForBatch({
        session,
        setup: session.batch.jobSetup,
        vehicleIds,
      });
      setWorkOrderResult(result);
      await appendImportAuditLog({
        batchId: session.batch.id,
        actorId: session.batch.createdBy,
        eventType: "commit_completed",
        details: {
          work_orders_created: result.createdIds.length,
          draft_id: result.draftId,
          error: result.error,
        },
      });
      return result;
    } finally {
      setLoading(false);
    }
  };

  const resumeBatch = async (batchId: string) => {
    const hydrated = await hydrateImportSession(batchId);
    if (!hydrated) return false;
    setSession(hydrated);
    setProcessingProgress((prev) => ({ ...prev, totalRows: hydrated.batch.totalRows, parsedRows: hydrated.batch.parsedRows }));
    if (hydrated.batch.status === "committed") setStep("results");
    else if (hydrated.batch.status === "review" || hydrated.batch.status === "failed") setStep("review");
    else if (hydrated.batch.status === "mapped") setStep("mapping");
    else setStep("landing");
    return true;
  };

  const rollbackBatch = async (batchId: string) => {
    if (!userId) return { reversed: 0, blocked: 0 };
    return rollbackImportedBatch(batchId, userId);
  };

  return {
    step,
    session,
    batch: session?.batch || null,
    rows: session?.rows || [],
    loading,
    summary,
    statusCounts,
    processingProgress,
    jobSetup: session?.batch.jobSetup ?? null,
    workOrderResult,
    setStep,
    loadFile,
    loadPaste,
    applyJobSetupStep,
    applyMapping,
    createWorkOrders,
    processSession,
    setRowOverride,
    setRowSkip,
    decodeRow,
    decodingRowIds,

    bulkApproveByStatus,
    commit,
    resumeBatch,
    rollbackBatch,
  };
}
