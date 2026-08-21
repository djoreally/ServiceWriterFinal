import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import {
  validateDraftOnServer,
  resolveDraftPricing,
  type ServerValidationEntry,
} from "@/application/commands/fleet-work-order-draft.command";
import type {
  WorkOrderDraftAction,
  WorkOrderDraftState,
  ValidationEntry,
} from "../state/workOrderReducer";

function computeClientEntries(state: WorkOrderDraftState): ValidationEntry[] {
  const entries: ValidationEntry[] = [];

  entries.push({
    key: "customer",
    type: "customer",
    passed: !!state.customer,
    blocking: true,
    severity: "error",
    message: state.customer ? "Customer selected" : "Select a fleet customer",
  });

  entries.push({
    key: "location",
    type: "location",
    passed: !!state.location,
    blocking: false,
    severity: "warning",
    message: state.location ? "Location selected" : "Select a location",
  });

  entries.push({
    key: "vehicles",
    type: "vehicles",
    passed: state.vehicles.length > 0,
    blocking: true,
    severity: "error",
    message: state.vehicles.length > 0
      ? `${state.vehicles.length} vehicle${state.vehicles.length === 1 ? "" : "s"} selected`
      : "Select at least one vehicle",
  });

  entries.push({
    key: "package",
    type: "pricing",
    passed: !!state.servicePackage,
    blocking: true,
    severity: "error",
    message: state.servicePackage ? `Package: ${state.servicePackage.label}` : "Select a service package",
  });

  const scheduleOk = !!state.scheduledDate && !!state.scheduledTime;
  entries.push({
    key: "schedule",
    type: "schedule",
    passed: scheduleOk,
    blocking: false,
    severity: "warning",
    message: scheduleOk ? `Scheduled ${state.scheduledDate} ${state.scheduledTime}` : "Choose date and time",
  });

  entries.push({
    key: "technician",
    type: "technician",
    passed: state.assignLater || !!state.technicianId,
    blocking: false,
    severity: "warning",
    message: state.technicianId
      ? "Technician assigned"
      : state.assignLater
        ? "Technician assignment deferred"
        : "Technician not yet assigned",
  });

  const poRequired = !!state.contract?.po_required;
  entries.push({
    key: "po",
    type: "po",
    passed: !poRequired || !!state.poNumber,
    blocking: poRequired,
    severity: poRequired ? "error" : "info",
    message: poRequired
      ? state.poNumber ? `PO ${state.poNumber} attached` : "Contract requires PO"
      : state.poNumber ? `PO ${state.poNumber} attached` : "No PO required",
  });

  return entries;
}

function toClientEntry(e: ServerValidationEntry): ValidationEntry {
  const type = (e.validation_type ?? "customer") as ValidationEntry["type"];
  const sev = (e.severity as ValidationEntry["severity"]) ?? "info";
  return {
    key: `srv:${e.key}`,
    type,
    passed: e.passed,
    blocking: e.blocking,
    severity: sev,
    message: e.message,
  };
}

/**
 * Client-side validation preview merged with the server's authoritative
 * validator. Server rules always win when both fire for the same key.
 */
export function useWorkOrderValidation(
  state: WorkOrderDraftState,
  dispatch: Dispatch<WorkOrderDraftAction>,
) {
  const draftId = state.draftId;

  // Immediate client-side entries so the summary rail is never empty.
  useEffect(() => {
    dispatch({ type: "SET_VALIDATION", entries: computeClientEntries(state) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.customer,
    state.location,
    state.vehicles,
    state.servicePackage,
    state.scheduledDate,
    state.scheduledTime,
    state.technicianId,
    state.assignLater,
    state.poNumber,
    state.contract,
  ]);

  // Debounced server-authoritative sync once the draft has been persisted.
  const runRef = useRef(0);
  useEffect(() => {
    if (!draftId) return;
    const myRun = ++runRef.current;
    const handle = setTimeout(async (): Promise<void> => {
      try {
        const [serverEntries] = await Promise.all([
          validateDraftOnServer(draftId),
          resolveDraftPricing(draftId).catch((): null => null),
        ]);
        if (runRef.current !== myRun) return;
        const client = computeClientEntries(state);
        const serverKeys = new Set(serverEntries.map((e) => e.key));
        const merged: ValidationEntry[] = [
          ...client.filter((c) => !serverKeys.has(c.key)),
          ...serverEntries.map(toClientEntry),
        ];
        dispatch({ type: "SET_VALIDATION", entries: merged });
      } catch (err) {
        console.warn("[useWorkOrderValidation] server sync failed", err);
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [
    draftId,
    state.customer,
    state.location,
    state.vehicles,
    state.servicePackage,
    state.scheduledDate,
    state.scheduledTime,
    state.technicianId,
    state.assignLater,
    state.poNumber,
    state.contract,
    state.addOns,
    dispatch,
    state,
  ]);
}

export function isDraftPromotable(state: WorkOrderDraftState): boolean {
  return state.validation.every((v) => v.passed || !v.blocking);
}

