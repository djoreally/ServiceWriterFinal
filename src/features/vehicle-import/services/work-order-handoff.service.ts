/**
 * Work-order handoff — turns a committed vehicle import batch into fleet work
 * orders through the existing draft pipeline (create → validate → approve →
 * promote). No work order is created outside that transactional path.
 *
 * Multi-vehicle batches are additionally grouped into ONE fleet job so the
 * scheduler, dispatch board, and tech app treat them as a single stop.
 */
import {
  createDraft,
  validateDraftOnServer,
  approveDraft,
  promoteDraft,
  type DraftVehicleRef,
  type ServerValidationEntry,
  type WorkOrderDraftPayload,
} from "@/application/commands/fleet-work-order-draft.command";
import { createFleetJobFromWorkOrders } from "@/application/commands/fleet-jobs.command";

import type { ImportJobSetup, VehicleImportSession } from "../types";

export type WorkOrderHandoffResult = {
  draftId: string | null;
  createdIds: string[];
  blockingValidations: ServerValidationEntry[];
  error: string | null;
  /** Set when 2+ work orders were grouped into a single fleet job. */
  fleetJobId?: string | null;
  fleetJobNumber?: string | null;
};


/** Vehicles that were actually committed by this import batch. */
export function committedVehicleRefs(session: VehicleImportSession): DraftVehicleRef[] {
  return session.rows
    .filter((row) => row.commitStatus === "committed" && row.existingVehicleId)
    .map((row) => {
      const payload = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
      return {
        id: String(row.existingVehicleId),
        unit_number: payload.unitNumber ?? null,
        year: payload.year ?? null,
        make: payload.make ?? null,
        model: payload.model ?? null,
        vin: payload.vin ?? null,
      };
    });
}

export async function createWorkOrdersForBatch(params: {
  session: VehicleImportSession;
  setup: ImportJobSetup;
  vehicleIds?: string[];
}): Promise<WorkOrderHandoffResult> {
  const { session, setup } = params;
  const allRefs = committedVehicleRefs(session);
  const refs = params.vehicleIds?.length
    ? allRefs.filter((ref) => params.vehicleIds!.includes(ref.id))
    : allRefs;

  if (refs.length === 0) {
    return { draftId: null, createdIds: [], blockingValidations: [], error: "No committed vehicles to schedule." };
  }
  if (!setup.fleetClientId) {
    return { draftId: null, createdIds: [], blockingValidations: [], error: "Select a fleet client before creating work orders." };
  }
  if (!setup.servicePackageCode) {
    return { draftId: null, createdIds: [], blockingValidations: [], error: "Select a service package before creating work orders." };
  }

  const subtotal = Number((setup.servicePackagePrice * refs.length).toFixed(2));

  const payload: WorkOrderDraftPayload = {
    customer_id: setup.fleetClientId,
    location_id: setup.fleetLocationId,
    contract_id: setup.fleetContractId,
    selected_vehicles: refs,
    service_package: {
      code: setup.servicePackageCode,
      label: setup.servicePackageLabel || setup.servicePackageCode,
      base_price_per_vehicle: setup.servicePackagePrice,
      estimated_duration_minutes: setup.servicePackageDurationMinutes || 45,
      includes: setup.servicePackageIncludes || [],
    },
    add_ons: [],
    scheduled_date: setup.scheduledDate,
    scheduled_time: setup.scheduledTime,
    technician_id: setup.technicianId,
    po_number: setup.poNumber,
    billing_method: setup.billingMethod,
    notes: setup.notes
      ? `${setup.notes}\n[source] vehicle import batch ${session.batch.id}`
      : `[source] vehicle import batch ${session.batch.id}`,
    estimated_subtotal: subtotal,
    estimated_discount: 0,
    estimated_tax: 0,
    estimated_total: subtotal,
    source_type: "import",
    created_from: `vehicle_import:${session.batch.id}`,
  };

  try {
    const { id: draftId } = await createDraft(payload);
    const validations = await validateDraftOnServer(draftId);
    const blocking = validations.filter((entry) => entry.blocking && !entry.passed);
    if (blocking.length > 0) {
      return { draftId, createdIds: [], blockingValidations: blocking, error: null };
    }

    await approveDraft(draftId);
    const { createdIds } = await promoteDraft(draftId, { autoApprove: false });

    // Multi-vehicle batches become ONE fleet job. Grouping failures must not
    // discard the work orders that were already created.
    let fleetJobId: string | null = null;
    let fleetJobNumber: string | null = null;
    if (createdIds.length > 1) {
      try {
        const job = await createFleetJobFromWorkOrders(createdIds, `Vehicle import batch ${session.batch.id}`);
        fleetJobId = job.jobId || null;
        fleetJobNumber = job.jobNumber ?? null;
      } catch {
        fleetJobId = null;
      }
    }

    return { draftId, createdIds, blockingValidations: [], error: null, fleetJobId, fleetJobNumber };

  } catch (error) {
    return {
      draftId: null,
      createdIds: [],
      blockingValidations: [],
      error: error instanceof Error ? error.message : "Failed to create work orders.",
    };
  }
}
