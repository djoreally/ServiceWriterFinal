import type { VehicleImportRow, VehicleImportRowStatus } from "../types";
import { extractVinCandidate, isValidVinFormat } from "../nhtsa.service";

const currentYear = new Date().getUTCFullYear();

export function applyValidation(row: VehicleImportRow): VehicleImportRow {
  const messages = [...row.validationMessages];
  const payload = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };

  const normalizedVin = extractVinCandidate(payload.vin) || "";

  // --- Vehicle identity checks (tiered: VIN > plate > unit number) ---
  const hasVin = !!normalizedVin;
  const hasPlate = !!payload.plate;
  const hasUnit = !!payload.unitNumber;

  if (!hasVin && !hasPlate && !hasUnit) {
    messages.push({ code: "NO_VEHICLE_IDENTITY", severity: "error", field: "vin", message: "No vehicle identity found. Provide VIN, plate, or unit number." });
  } else {
    if (!hasVin) {
      messages.push({ code: "VIN_MISSING", severity: "warning", field: "vin", message: "VIN is missing. Vehicle matched by plate or unit number." });
    } else if (!isValidVinFormat(normalizedVin)) {
      messages.push({ code: "VIN_INVALID", severity: "warning", field: "vin", message: "VIN format is invalid. Will attempt import with other identifiers." });
    }
  }

  // --- Vehicle detail checks (warnings, not errors) ---
  if (!payload.year || payload.year < 1900 || payload.year > currentYear + 2) {
    messages.push({ code: "YEAR_INVALID", severity: "warning", field: "year", message: "Model year is missing or invalid." });
  }

  if (!payload.make) messages.push({ code: "MAKE_MISSING", severity: "warning", field: "make", message: "Make is missing." });
  if (!payload.model) messages.push({ code: "MODEL_MISSING", severity: "warning", field: "model", message: "Model is missing." });
  if (!payload.odometer) messages.push({ code: "ODOMETER_MISSING", severity: "info", field: "odometer", message: "Odometer missing." });
  if (!payload.plate && hasVin) messages.push({ code: "PLATE_MISSING", severity: "info", field: "plate", message: "Plate missing." });

  // --- Fleet/context fields: warnings only, never hard errors ---
  if (!payload.customerId) messages.push({ code: "FLEET_UNASSIGNED", severity: "warning", field: "customerId", message: "Fleet/client assignment is missing. Can be assigned after import." });
  if (!payload.locationId) messages.push({ code: "LOCATION_UNASSIGNED", severity: "info", field: "locationId", message: "Location assignment is missing." });
  if (!payload.contractId) messages.push({ code: "CONTRACT_UNASSIGNED", severity: "info", field: "contractId", message: "Contract assignment is missing." });
  if (!payload.serviceProfile) messages.push({ code: "SERVICE_PROFILE_UNASSIGNED", severity: "info", field: "serviceProfile", message: "Service profile is missing." });

  const hasError = messages.some((m) => m.severity === "error");
  const hasWarning = messages.some((m) => m.severity === "warning");

  let status: VehicleImportRowStatus = "valid";
  if (hasError) status = "blocked";
  else if (hasWarning) status = "needs_review";

  return {
    ...row,
    validationMessages: dedupeMessages(messages),
    validationStatus: status,
  };
}

function dedupeMessages(messages: VehicleImportRow["validationMessages"]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = `${message.code}:${message.field || ""}:${message.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyValidationToRows(rows: VehicleImportRow[]): VehicleImportRow[] {
  return rows.map(applyValidation);
}
