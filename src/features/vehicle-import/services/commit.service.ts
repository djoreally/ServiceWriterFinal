import { supabase } from "@/integrations/supabase/client";
import { fetchFleetClientMap } from "@/application/commands/fleet-import.command";
import type { Database } from "@/integrations/supabase/types";
import { upsertVehicleIntelligenceProfiles } from "@/application/services/vehicle-intelligence/vehicle-intelligence.service";
import type { VehicleIntelligenceInput } from "@/application/services/vehicle-intelligence/types";
import { extractVinCandidate } from "../nhtsa.service";
import type { VehicleImportBatch, VehicleImportRow, VehicleImportSession } from "../types";

function buildCommitIdempotencyKey(input: {
  userId: string;
  batchId: string;
  rowIds: string[];
}): string {
  let hash = 0;
  const raw = `${input.userId}|${input.batchId}|${input.rowIds.sort().join(",")}`;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `import_commit_${Math.abs(hash).toString(36)}`;
}

function mapStatus(input?: string) {
  if (input === "inactive") return "inactive";
  if (input === "do_not_service") return "maintenance";
  return "active";
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function resolveEntityId(value: unknown, map: Map<string, string>): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isUuid(raw)) return raw;
  return map.get(raw.toLowerCase()) ?? null;
}

export async function commitRows(session: VehicleImportSession, userId: string): Promise<VehicleImportSession> {
  type FleetVehicleInsert = Database["public"]["Tables"]["fleet_vehicles"]["Insert"];
  const clientMap = await fetchFleetClientMap(userId);
  const [locationsRes, contractsRes, serviceProfilesRes] = await Promise.all([
    supabase.from("fleet_locations").select("id,name").eq("user_id", userId),
    supabase.from("fleet_contracts").select("id,name").eq("user_id", userId),
    supabase.from("fleet_service_rules").select("id,service_class").eq("user_id", userId).eq("is_active", true),
  ]);

  const locationMap = new Map<string, string>();
  (locationsRes.data || []).forEach((location) => {
    locationMap.set(String(location.id).toLowerCase(), String(location.id));
    locationMap.set(String(location.name || "").trim().toLowerCase(), String(location.id));
  });

  const contractMap = new Map<string, string>();
  (contractsRes.data || []).forEach((contract) => {
    contractMap.set(String(contract.id).toLowerCase(), String(contract.id));
    contractMap.set(String(contract.name || "").trim().toLowerCase(), String(contract.id));
  });

  const serviceProfileMap = new Map<string, string>();
  (serviceProfilesRes.data || []).forEach((profile) => {
    serviceProfileMap.set(String(profile.id).toLowerCase(), String(profile.id));
    serviceProfileMap.set(String(profile.service_class || "").trim().toLowerCase(), String(profile.id));
  });

  const approved = session.rows.filter(
    (row) => ["valid", "needs_review"].includes(row.validationStatus) && row.commitStatus !== "committed"
  );

  const rowFailureById = new Map<string, string>();
  const staged = approved.map((row) => {
    const merged = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
    const fleetClientId = resolveEntityId(merged.customerId, clientMap);
    const fleetLocationId = resolveEntityId(merged.locationId, locationMap);
    const fleetContractId = resolveEntityId(merged.contractId, contractMap);
    const serviceProfileId = resolveEntityId(merged.serviceProfile, serviceProfileMap);
    const normalizedVin = extractVinCandidate(merged.vin);

    if (!fleetClientId || (row.validationStatus as string) === "error") {
      rowFailureById.set(row.id, "Fleet client assignment is required before vehicles can be imported.");
      return { rowId: row.id, payload: null as FleetVehicleInsert | null };
    }

    return {
      rowId: row.id,
      payload: {
        user_id: userId,
        fleet_client_id: fleetClientId,
        fleet_location_id: fleetLocationId,
        fleet_contract_id: fleetContractId,
        year: merged.year ?? null,
        make: merged.make ?? null,
        model: merged.model ?? null,
        vin: normalizedVin ?? null,
        license_plate: merged.plate ?? null,
        unit_number: merged.unitNumber ?? null,
        color: merged.color ?? null,
        engine: merged.engine ?? null,
        fuel_type: merged.fuelTypePrimary ?? null,
        mileage: merged.odometer ?? null,
        status: mapStatus(merged.status),
        notes: merged.notes
          ? `${merged.notes}\n[import_context] service_profile=${serviceProfileId || String(merged.serviceProfile || "").trim()}`
          : `[import_context] service_profile=${serviceProfileId || String(merged.serviceProfile || "").trim()}`,
      },
    };
  });

  const { data: operationBatch } = await supabase
    .from("fleet_operation_batches")
    .select("id,status")
    .eq("user_id", userId)
    .eq("operation_type", "vehicle_import_commit")
    .eq(
      "idempotency_key",
      buildCommitIdempotencyKey({
        userId,
        batchId: session.batch.id,
        rowIds: staged.map((entry) => entry.rowId),
      })
    )
    .in("status", ["running", "completed"])
    .maybeSingle();

  if (operationBatch?.id) {
    return session;
  }

  const idempotencyKey = buildCommitIdempotencyKey({
    userId,
    batchId: session.batch.id,
    rowIds: staged.map((entry) => entry.rowId),
  });

  const { data: newOperationBatch } = await supabase
    .from("fleet_operation_batches")
    .insert({
      user_id: userId,
      operation_type: "vehicle_import_commit",
      status: "running",
      idempotency_key: idempotencyKey,
      context: { batch_id: session.batch.id, row_count: staged.length },
    })
    .select("id")
    .maybeSingle();

  const operationBatchId = newOperationBatch?.id as string | undefined;

  const insertedByRowId = new Map<string, string>();
  for (const entry of staged) {
    if (!entry.payload) continue;
    const payload = entry.payload;

    const normalizedVin = String(payload.vin || "").trim().toUpperCase();
    if (normalizedVin) {
      const { data: vinMatch } = await supabase
        .from("fleet_vehicles")
        .select("id,fleet_client_id")
        .eq("user_id", userId)
        .eq("vin", normalizedVin)
        .maybeSingle();
      if (vinMatch?.id) {
        rowFailureById.set(
          entry.rowId,
          String(vinMatch.fleet_client_id || "") === String(payload.fleet_client_id || "")
            ? "Duplicate import across time: VIN already exists for this fleet client."
            : "Cross-client VIN conflict: VIN already exists under a different fleet client."
        );
        continue;
      }
    }

    const { data: inserted, error: insertError } = await supabase.from("fleet_vehicles").insert(payload).select("id").maybeSingle();
    if (insertError || !inserted?.id) {
      rowFailureById.set(entry.rowId, insertError?.message || "Failed to insert vehicle row.");
      continue;
    }
    insertedByRowId.set(entry.rowId, inserted.id);
  }

  const intelligenceInputs = staged
    .filter((entry) => entry.payload)
    .map((entry): VehicleIntelligenceInput | null => {
      const matchedRow = approved.find((row) => row.id === entry.rowId);
      const insertedVehicleId = insertedByRowId.get(entry.rowId);
      if (!matchedRow || !insertedVehicleId) return null;
      const merged = { ...matchedRow.mappedPayload, ...matchedRow.decodedPayload, ...matchedRow.resolutionPayload };
      return {
        vehicleId: insertedVehicleId,
        userId,
        vin: extractVinCandidate(merged.vin) || null,
        year: merged.year || null,
        make: merged.make || null,
        model: merged.model || null,
        engine: merged.engine || null,
        engineCylinders: merged.engineCylinders || null,
        displacementLiters: merged.displacementLiters || null,
        fuelTypePrimary: merged.fuelTypePrimary || null,
        vehicleType: merged.vehicleType || null,
      };
    })
    .filter((entry): entry is VehicleIntelligenceInput => entry !== null);

  await upsertVehicleIntelligenceProfiles(intelligenceInputs);

  const rows: VehicleImportRow[] = session.rows.map((row) => {
    if (row.commitStatus === "committed") {
      return row;
    }

    if (!["valid", "needs_review"].includes(row.validationStatus)) {
      return { ...row, commitStatus: "skipped", validationStatus: row.validationStatus };
    }

    const stagedEntry = staged.find((entry) => entry.rowId === row.id);
    const rowFailure = rowFailureById.get(row.id);
    if (stagedEntry && !stagedEntry.payload) {
      return {
        ...row,
        commitStatus: "failed",
        validationStatus: "blocked",
        validationMessages: [
          ...row.validationMessages,
          {
            code: "COMMIT_ASSIGNMENT_MISSING",
            severity: "error",
            field: "customerId",
            message: rowFailure || "Fleet client assignment is missing for commit.",
          },
        ],
      };
    }

    const insertedId = insertedByRowId.get(row.id);
    if (!insertedId) {
      return {
        ...row,
        commitStatus: "failed",
        validationStatus: "failed",
        validationMessages: rowFailure
          ? [...row.validationMessages, { code: "COMMIT_FAILED", severity: "error", message: rowFailure }]
          : row.validationMessages,
      };
    }
    return { ...row, commitStatus: "committed", validationStatus: "imported", existingVehicleId: insertedId };
  });

  const batch: VehicleImportBatch = {
    ...session.batch,
    readyRows: rows.filter((row) => row.validationStatus === "valid").length,
    warningRows: rows.filter((row) => row.validationStatus === "needs_review" || row.validationStatus === "pending").length,
    errorRows: rows.filter((row) => row.validationStatus === "blocked" || row.validationStatus === "failed").length,
    duplicateRows: rows.filter((row) => row.duplicateStatus !== "none" && row.duplicateStatus !== "new_record").length,
    committedRows: rows.filter((row) => row.commitStatus === "committed").length,
    status: rows.some((row) => row.commitStatus === "failed") ? "failed" : "committed",
  };

  if (operationBatchId) {
    for (const row of rows) {
      await supabase.from("fleet_operation_batch_items").upsert({
        batch_id: operationBatchId,
        item_key: row.id,
        status:
          row.commitStatus === "committed"
            ? "succeeded"
            : row.commitStatus === "skipped"
              ? "skipped"
              : "failed",
        payload: {
          validation_status: row.validationStatus,
          commit_status: row.commitStatus,
        },
        error_message:
          row.commitStatus === "failed"
            ? row.validationMessages.find((message) => message.severity === "error")?.message || "commit failed"
            : null,
      });
    }

    const failedCount = rows.filter((row) => row.commitStatus === "failed").length;
    await supabase
      .from("fleet_operation_batches")
      .update({
        status: failedCount > 0 ? (rows.some((row) => row.commitStatus === "committed") ? "partial_failed" : "failed") : "completed",
        completed_at: new Date().toISOString(),
        error_message: failedCount > 0 ? `${failedCount} import row(s) failed during commit` : null,
      })
      .eq("id", operationBatchId)
      .eq("user_id", userId);
  }

  return { batch, rows };
}

export async function rollbackImportedBatch(batchId: string, userId: string): Promise<{ reversed: number; blocked: number }> {
  const { data: rows } = await supabase
    .from("vehicle_import_rows")
    .select("id,existing_vehicle_id,commit_status")
    .eq("batch_id", batchId)
    .eq("commit_status", "committed");
  const vehicleIds = (rows || [])
    .map((row) => String(row.existing_vehicle_id || ""))
    .filter(Boolean);
  if (vehicleIds.length === 0) return { reversed: 0, blocked: 0 };

  const { data: attachedOrders } = await supabase
    .from("fleet_work_orders")
    .select("fleet_vehicle_id,status")
    .eq("user_id", userId)
    .in("fleet_vehicle_id", vehicleIds)
    .not("status", "in", "(cancelled)");
  const blockedVehicleIds = new Set((attachedOrders || []).map((order) => String(order.fleet_vehicle_id || "")));

  let reversed = 0;
  for (const vehicleId of vehicleIds) {
    if (blockedVehicleIds.has(vehicleId)) continue;
    const { data: vehicle } = await supabase
      .from("fleet_vehicles")
      .select("notes")
      .eq("id", vehicleId)
      .eq("user_id", userId)
      .maybeSingle();
    const existingNotes = String(vehicle?.notes || "");
    const rollbackNotes = `${existingNotes}${existingNotes ? "\n" : ""}[import_rollback] batch=${batchId};reversed_at=${new Date().toISOString()}`;
    const { error } = await supabase
      .from("fleet_vehicles")
      .update({ status: "inactive", notes: rollbackNotes })
      .eq("id", vehicleId)
      .eq("user_id", userId);
    if (!error) reversed += 1;
  }

  await supabase.from("vehicle_import_audit_log").insert({
    batch_id: batchId,
    event_type: "rollback_completed",
    details: { reversed, blocked: blockedVehicleIds.size },
    actor_id: userId,
  });

  return { reversed, blocked: blockedVehicleIds.size };
}
