import { normalizeVin } from "../nhtsa.service";
import type { ExistingVehicleCandidate, VehicleImportRow } from "../types";

export function detectDuplicates(rows: VehicleImportRow[], existing: ExistingVehicleCandidate[]): VehicleImportRow[] {
  const seenVins = new Set<string>();

  return rows.map((row) => {
    const merged = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
    const vin = normalizeVin(String(merged.vin || ""));
    const messages = [...row.validationMessages];
    let duplicateStatus = row.duplicateStatus;
    let validationStatus = row.validationStatus;
    let existingVehicleId: string | undefined;

    const customerContext = String(merged.customerId || merged.clientId || "").toLowerCase();
    const fleetContext = String(merged.fleetId || "").toLowerCase();
    const contextKey = customerContext || fleetContext;

    if (vin) {
      const existingMatch = existing.find((vehicle) => normalizeVin(vehicle.vin || "") === vin);
      if (existingMatch) {
        duplicateStatus = "exact_match";
        existingVehicleId = existingMatch.id;
        validationStatus = "needs_review";
        messages.push({ code: "DUPLICATE_EXACT", severity: "warning", field: "vin", message: "Exact VIN exists in Fleet OS." });
        if (contextKey && String(existingMatch.fleet_client_id || "").toLowerCase() !== contextKey) {
          duplicateStatus = "conflict";
          validationStatus = "blocked";
          messages.push({ code: "DUPLICATE_CONTEXT_CONFLICT", severity: "error", message: "VIN exists under a different fleet/customer context." });
        }
      } else if (seenVins.has(vin)) {
        duplicateStatus = "conflict";
        validationStatus = "blocked";
        messages.push({ code: "DUPLICATE_IN_FILE", severity: "error", field: "vin", message: "Duplicate VIN in this batch." });
      }
      seenVins.add(vin);
    }

    if (duplicateStatus === "none") {
      const plate = String(merged.plate || "").toLowerCase();
      const unit = String(merged.unitNumber || "").toLowerCase();
      const likely = existing.find((vehicle) => {
        const sameContext = contextKey
          ? String(vehicle.fleet_client_id || "").toLowerCase() === contextKey
          : true;
        if (!sameContext) return false;
        if (plate && vehicle.license_plate && vehicle.license_plate.toLowerCase() === plate) return true;
        if (unit && vehicle.unit_number && vehicle.unit_number.toLowerCase() === unit) return true;
        if (!vin && merged.year && merged.make && merged.model) {
          return (
            vehicle.year === merged.year &&
            vehicle.make?.toLowerCase() === String(merged.make).toLowerCase() &&
            vehicle.model?.toLowerCase() === String(merged.model).toLowerCase()
          );
        }
        return false;
      });
      if (likely) {
        duplicateStatus = "likely_duplicate";
        existingVehicleId = likely.id;
        if (validationStatus !== "blocked") validationStatus = "needs_review";
        messages.push({ code: "DUPLICATE_LIKELY", severity: "warning", message: "Likely duplicate by plate/unit." });
      }
    }

    if (duplicateStatus === "none") duplicateStatus = "new_record";

    return {
      ...row,
      duplicateStatus,
      existingVehicleId,
      validationStatus,
      validationMessages: messages,
    };
  });
}
