/**
 * tech-app-vehicle.command — pure planning for the tech app's
 * vehicle-field update (PATCH /v1/tech-app/jobs/:appointmentId/vehicle).
 *
 * Ty's ask (2026-11-12): standing at the vehicle, the technician
 * must be able to correct the odometer, the VIN, and the plate on
 * the job's vehicle — the values Service Writer holds were typed
 * at booking time and are often wrong or missing (the plate most
 * of all). This module owns the field rules; the route handler
 * owns auth, the assignment scope, and the write itself.
 *
 * The write lands on the ONE canonical vehicles row (the same row
 * the office edits through PATCH /v1/vehicles/:id — same column
 * rules: mileage a whole number >= 0, plate capped at 30 chars).
 * Nothing here touches pricing, invoices, or any other table.
 *
 * Rules:
 * - Only the keys present in the input are planned; at least one
 *   of mileage / vin / plate must be present.
 * - mileage: a whole number >= 0 (a numeric string is coerced);
 *   null or an empty string clears the reading.
 * - vin: trimmed, uppercased, spaces stripped; empty clears it;
 *   a non-empty VIN must be exactly 17 alphanumeric characters
 *   (the canonical route only caps length — a tech typing a VIN
 *   at the fender deserves the real check, not a silent bad save).
 * - plate: trimmed, uppercased, inner whitespace collapsed; empty
 *   clears it; capped at 30 chars like the canonical route.
 */

export interface VehicleFieldPatch {
  mileage?: number | null;
  vin?: string | null;
  license_plate?: string | null;
}

/**
 * The plan: exactly one of patch / error is non-null. (A plain
 * shape, not a discriminated union — this repo typechecks with
 * strictNullChecks off, where union narrowing does not hold.)
 */
export interface VehicleFieldUpdatePlan {
  patch: VehicleFieldPatch | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MILEAGE_ERROR = "Mileage must be a whole number, zero or more.";
const VIN_ERROR = "A VIN is exactly 17 characters (letters and numbers).";
const PLATE_ERROR = "A plate is at most 30 characters.";

export function planVehicleFieldUpdate(input: unknown): VehicleFieldUpdatePlan {
  if (!isRecord(input)) {
    return { patch: null, error: "Send the vehicle fields as an object." };
  }
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  if (!has("mileage") && !has("vin") && !has("plate")) {
    return { patch: null, error: "Nothing to update — send mileage, vin, or plate." };
  }

  const patch: VehicleFieldPatch = {};

  if (has("mileage")) {
    const raw = input.mileage;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch.mileage = null;
    } else if (typeof raw === "number" || typeof raw === "string") {
      const value = typeof raw === "number" ? raw : Number(raw.trim().replace(/,/g, ""));
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        return { patch: null, error: MILEAGE_ERROR };
      }
      patch.mileage = value;
    } else {
      return { patch: null, error: MILEAGE_ERROR };
    }
  }

  if (has("vin")) {
    const raw = input.vin;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch.vin = null;
    } else if (typeof raw === "string") {
      const vin = raw.trim().toUpperCase().replace(/\s+/g, "");
      if (!/^[A-Z0-9]{17}$/.test(vin)) {
        return { patch: null, error: VIN_ERROR };
      }
      patch.vin = vin;
    } else {
      return { patch: null, error: VIN_ERROR };
    }
  }

  if (has("plate")) {
    const raw = input.plate;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch.license_plate = null;
    } else if (typeof raw === "string") {
      const plate = raw.trim().toUpperCase().replace(/\s+/g, " ");
      if (plate.length > 30) {
        return { patch: null, error: PLATE_ERROR };
      }
      patch.license_plate = plate;
    } else {
      return { patch: null, error: PLATE_ERROR };
    }
  }

  return { patch, error: null };
}
