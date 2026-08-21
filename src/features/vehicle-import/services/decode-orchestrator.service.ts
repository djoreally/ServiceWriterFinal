import { decodeVin, extractVinCandidate, isValidVinFormat } from "../nhtsa.service";
import type { VehicleImportRow, VehicleProfileInput } from "../types";

const compareFields: Array<keyof VehicleProfileInput> = ["year", "make", "model", "trim", "series", "engine", "fuelTypePrimary", "drivetrain", "transmission"];

function normalizedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

export async function runDecodeForRow(
  row: VehicleImportRow,
  options?: { force?: boolean },
): Promise<VehicleImportRow> {
  // A manual VIN correction (resolutionPayload) always wins over the imported value.
  const vin = extractVinCandidate(row.resolutionPayload?.vin || row.mappedPayload.vin);
  if (!vin) {
    return {
      ...row,
      decodeStatus: "not_started",
      validationMessages: [
        ...row.validationMessages,
        { code: "VIN_MISSING", severity: "warning", field: "vin", message: "VIN missing; decode skipped." },
      ],
    };
  }

  if (!isValidVinFormat(vin)) {
    return {
      ...row,
      decodeStatus: "invalid_vin",
      validationMessages: [
        ...row.validationMessages,
        { code: "VIN_INVALID", severity: "error", field: "vin", message: "VIN format invalid." },
      ],
    };
  }

  const nextRow: VehicleImportRow = {
    ...row,
    mappedPayload: { ...row.mappedPayload, vin },
    decodeStatus: "pending",
  };

  const result = await decodeVin(vin, { force: options?.force });

  const decodedPayload = result.profile;
  const messages = [...nextRow.validationMessages];
  let recommendation = { ...(row.resolutionPayload || {}) };

  if (!decodedPayload) {
    messages.push({
      code: "DECODE_UNAVAILABLE",
      severity: "warning",
      field: "vin",
      message: result.errorMessage || "VIN decode did not return a structured payload.",
    });
    return { ...nextRow, decodeStatus: result.status, validationMessages: messages };
  }

  for (const field of compareFields) {
    const imported = nextRow.mappedPayload[field];
    const decoded = decodedPayload[field];
    if (!imported || !decoded) continue;

    if (normalizedValue(imported) !== normalizedValue(decoded)) {
      messages.push({
        code: "DECODE_MISMATCH",
        severity: "warning",
        field,
        message: `${field} differs from VIN decode. Recommended value: ${decoded}`,
      });
      recommendation = { ...recommendation, [field]: decoded };
    }
  }

  return {
    ...nextRow,
    decodeStatus: result.status,
    decodedPayload,
    resolutionPayload: recommendation,
    validationMessages: messages,
  };
}

export async function runDecodeOrchestration(rows: VehicleImportRow[], concurrency = 5): Promise<VehicleImportRow[]> {
  const output: VehicleImportRow[] = [];
  for (let index = 0; index < rows.length; index += concurrency) {
    const chunk = rows.slice(index, index + concurrency);
    const decoded = await Promise.all(chunk.map((row) => runDecodeForRow(row)));
    output.push(...decoded);
  }
  return output;
}
