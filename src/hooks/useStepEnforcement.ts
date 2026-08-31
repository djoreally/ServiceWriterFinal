/**
 * useStepEnforcement — UI step-gating hook for work order execution.
 *
 * Exposes:
 *  - currentPhase: the work order's execution_phase
 *  - activeStep: the first unlocked, incomplete checklist item
 *  - completedCount / totalCount: progress tracking
 *  - missingFields: VIN / Mileage / Signature still needed before completion
 *  - canComplete: whether the "Complete Work Order" button should be enabled
 *  - advanceStep: calls the enforcement RPC and refreshes state
 *  - captureVin / captureMileage: field-capture helpers
 */

import { errorMessage } from "@/lib/error-message";
import { useState, useMemo, useCallback } from "react";
import {
  advanceChecklistStep,
  captureWorkOrderVin,
  captureWorkOrderMileage,
} from "@/application/commands/work-order.command";

export interface ChecklistItem {
  id: string;
  step_name: string;
  step_order: number;
  status: string;
  requires_photo: boolean;
  evidence_url: string | null;
  notes: string | null;
  execution_phase: string;
  is_mandatory: boolean;
  is_unlocked: boolean;
}

export interface WorkOrderEnforcementState {
  execution_phase: string;
  requires_vin: boolean;
  requires_mileage: boolean;
  requires_signature: boolean;
  vin_captured: string | null;
  mileage_captured: number | null;
  signature_url: string | null;
}

export function useStepEnforcement(
  workOrder: WorkOrderEnforcementState | null,
  checklist: ChecklistItem[],
  onRefresh: () => void
) {
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPhase = workOrder?.execution_phase ?? "pre_service";

  /** The first unlocked, non-completed step — the one the tech should act on */
  const activeStep = useMemo(
    () =>
      checklist
        .filter((s) => s.is_unlocked && s.status !== "completed")
        .sort((a, b) => a.step_order - b.step_order)[0] ?? null,
    [checklist]
  );

  const completedCount = useMemo(
    () => checklist.filter((s) => s.status === "completed").length,
    [checklist]
  );

  const totalMandatory = useMemo(
    () => checklist.filter((s) => s.is_mandatory).length,
    [checklist]
  );

  /** Fields still missing before the work order can be completed */
  const missingFields = useMemo(() => {
    if (!workOrder) return [];
    const missing: string[] = [];
    if (workOrder.requires_vin && !workOrder.vin_captured) missing.push("VIN");
    if (workOrder.requires_mileage && workOrder.mileage_captured == null) missing.push("Mileage");
    if (workOrder.requires_signature && !workOrder.signature_url) missing.push("Signature");

    const incompleteMandatory = checklist.filter(
      (s) => s.is_mandatory && s.status !== "completed"
    ).length;
    if (incompleteMandatory > 0) missing.push(`${incompleteMandatory} checklist step(s)`);

    return missing;
  }, [workOrder, checklist]);

  const canComplete = missingFields.length === 0;

  /** Advance the active step via the enforcement RPC */
  const advanceStep = useCallback(
    async (itemId: string, evidenceUrl?: string, notes?: string) => {
      setAdvancing(true);
      setError(null);
      try {
        await advanceChecklistStep(itemId, evidenceUrl, notes);
        onRefresh();
      } catch (e: unknown) {
        setError(errorMessage(e));
        throw e;
      } finally {
        setAdvancing(false);
      }
    },
    [onRefresh]
  );

  const captureVin = useCallback(
    async (workOrderId: string, vin: string) => {
      await captureWorkOrderVin(workOrderId, vin);
      onRefresh();
    },
    [onRefresh]
  );

  const captureMileage = useCallback(
    async (workOrderId: string, mileage: number) => {
      await captureWorkOrderMileage(workOrderId, mileage);
      onRefresh();
    },
    [onRefresh]
  );

  return {
    currentPhase,
    activeStep,
    completedCount,
    totalMandatory,
    missingFields,
    canComplete,
    advancing,
    error,
    advanceStep,
    captureVin,
    captureMileage,
  };
}
