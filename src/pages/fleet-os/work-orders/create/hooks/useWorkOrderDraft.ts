import { useCallback, useRef } from "react";
import { createDraft, updateDraft, type WorkOrderDraftPayload } from "@/application/commands/fleet-work-order-draft.command";
import { computeEstimate, type WorkOrderDraftState } from "../state/workOrderReducer";

function toPayload(state: WorkOrderDraftState): WorkOrderDraftPayload {
  const est = computeEstimate(state);
  return {
    customer_id: state.customer?.id ?? null,
    location_id: state.location?.id ?? null,
    contract_id: state.contract?.id ?? null,
    selected_vehicles: state.vehicles,
    service_package: state.servicePackage,
    add_ons: state.addOns,
    scheduled_date: state.scheduledDate || null,
    scheduled_time: state.scheduledTime || null,
    technician_id: state.assignLater ? null : state.technicianId,
    po_number: state.poNumber || null,
    billing_method: state.billingMethod || null,
    notes: state.notes || null,
    estimated_subtotal: est.subtotal,
    estimated_discount: est.discount,
    estimated_tax: est.tax,
    estimated_total: est.total,
    source_type: state.sourceType,
  };
}

export function useWorkOrderDraft(
  state: WorkOrderDraftState,
  setDraftId: (id: string) => void,
) {
  // Track the in-flight persist so concurrent callers await the same result
  // instead of getting a `null` from a re-entrancy guard (which was surfacing
  // as "Draft could not be saved." on the Create button).
  const inflightRef = useRef<Promise<string | null> | null>(null);
  const draftIdRef = useRef<string | null>(state.draftId ?? null);
  draftIdRef.current = state.draftId ?? draftIdRef.current;

  const persist = useCallback(async (): Promise<string | null> => {
    if (inflightRef.current) return inflightRef.current;

    const run = (async () => {
      const payload = toPayload(state);
      const existingId = draftIdRef.current;
      if (existingId) {
        await updateDraft(existingId, payload);
        return existingId;
      }
      if (!payload.customer_id) return null;
      const { id } = await createDraft(payload);
      draftIdRef.current = id;
      setDraftId(id);
      return id;
    })();

    inflightRef.current = run;
    try {
      return await run;
    } finally {
      inflightRef.current = null;
    }
  }, [state, setDraftId]);

  return { persist };
}
