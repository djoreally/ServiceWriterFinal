/**
 * Creation-time data validation (Build Board Session 7, condition 4).
 *
 * The 2026-11-13 Carfax production pull exposed real defects that were all
 * created without any server-side check:
 *   - a patterned placeholder VIN (5TDGBRCH3LS111111) saved as a real vehicle
 *   - duplicate service records from a legacy import (same VIN/date/mileage)
 *   - a 934,000-mile odometer reading on a GMC Acadia
 *   - a workspace address_line1 holding a doubled full address
 *     ("428 Railroad Avenue, Ambler, Pennsylvania, 19002, Ambler, Pennsylvania, 19002")
 *   - odometer unit stored lowercase ("mi") and state stored as a full name
 *     ("Pennsylvania") where downstream consumers need "MI" / "PA"
 *
 * These helpers are the single source for the creation-time rules. They are
 * pure (no DB access) so every creation path — vehicle create/update,
 * service-record create, the account-export importer, fleet import, and the
 * workspace settings saves — applies exactly the same checks, and so the
 * rules are unit-testable without a database.
 */

/** Highest odometer reading (miles or km) accepted at creation time. */
export const MAX_ODOMETER_READING = 1_500_000;

/* ------------------------------------------------------------------ VINs */

/** Standard VIN charset: digits + letters excluding I, O, Q. */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
/** Placeholder guard: any single character repeated 6+ times in a row. */
const VIN_PLACEHOLDER_PATTERN = /(.)\1{5,}/;

export function normalizeVin(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Returns a clear error message when the VIN is not acceptable at creation,
 * or null when it is. A VIN must be exactly 17 characters from the standard
 * VIN charset (no I, O, or Q), and must not carry a placeholder pattern
 * (one character repeated 6 or more times consecutively, e.g. the tail of
 * 5TDGBRCH3LS111111).
 */
export function validateVin(raw: string): string | null {
  const vin = normalizeVin(raw);
  if (vin.length !== 17) {
    return `VIN must be exactly 17 characters (received ${vin.length}).`;
  }
  if (!VIN_PATTERN.test(vin)) {
    return "VIN may only contain letters and digits, excluding I, O, and Q.";
  }
  if (VIN_PLACEHOLDER_PATTERN.test(vin)) {
    return "VIN looks like a placeholder (one character repeated 6 or more times in a row) and cannot be saved as a real vehicle.";
  }
  return null;
}

/* --------------------------------------------------------------- Mileage */

/**
 * Validates an odometer/mileage value at creation. Accepts numbers and
 * numeric strings (service-record metadata carries both). Absent values
 * (null/undefined/"") are not this check's concern and pass. Rejects
 * non-numeric, negative, and readings above MAX_ODOMETER_READING.
 */
export function validateMileageValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return "Mileage must be a number.";
  if (n < 0) return "Mileage cannot be negative.";
  if (n > MAX_ODOMETER_READING) {
    return `Mileage cannot exceed ${MAX_ODOMETER_READING.toLocaleString("en-US")} — check the odometer reading for an extra digit.`;
  }
  return null;
}

export function mileageFromUnknown(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------- Normalization */

const ODOMETER_UNIT_ALIASES: Record<string, "MI" | "KM"> = {
  MI: "MI",
  MILE: "MI",
  MILES: "MI",
  KM: "KM",
  KILOMETER: "KM",
  KILOMETERS: "KM",
  KILOMETRE: "KM",
  KILOMETRES: "KM",
};

/**
 * Normalizes an odometer unit for storage: MI/KM family values are stored
 * uppercase ("MI" / "KM"). Unknown values are returned trimmed + uppercased
 * so nothing is silently rewritten into a unit it is not.
 */
export function normalizeOdometerUnit(value: string): string {
  const upper = value.trim().toUpperCase();
  return ODOMETER_UNIT_ALIASES[upper] ?? upper;
}

export const US_STATE_CODES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI",
  MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
  NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
  VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY",
};

const US_STATE_CODE_SET = new Set(Object.values(US_STATE_CODES));

/**
 * Normalizes a US state value for storage: a full state name maps to its
 * 2-letter USPS code and a 2-letter code is uppercased ("Pennsylvania" ->
 * "PA", "pa" -> "PA"). Anything that is not a US state (a Canadian province,
 * free text) is returned trimmed and unchanged — this function only claims
 * the values it knows.
 */
export function normalizeUsState(value: string): string {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (US_STATE_CODES[upper]) return US_STATE_CODES[upper];
  if (/^[A-Za-z]{2}$/.test(trimmed) && US_STATE_CODE_SET.has(upper)) return upper;
  return trimmed;
}

/* ------------------------------------------------- Street address sanity */

const CITY_STATE_ZIP_PATTERN = /,\s*[^,]+,\s*[A-Za-z. ]+\s+\d{5}(?:-\d{4})?\b/g;
const ZIP_PATTERN = /\b\d{5}(?:-\d{4})?\b/g;

/**
 * Guards the street-address field (workspace_settings.address_line1) against
 * a whole address being pasted into it. Returns an error when the value
 * repeats the full address inside itself — the same ", City, ST ZIP" block
 * twice, the same ZIP twice, or the same comma-separated segment (street,
 * city, or state) twice — which is the shape of the production defect
 * "428 Railroad Avenue, Ambler, Pennsylvania, 19002, Ambler, Pennsylvania, 19002".
 * A single complete address on one line is fine; only repetition is rejected.
 */
export function validateStreetAddress(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const message =
    "Street address appears to contain the full address more than once. The street field takes the street address only (for example \"428 Railroad Avenue\") — city, state, and ZIP belong in their own fields.";

  const cityStateZipBlocks = value.match(CITY_STATE_ZIP_PATTERN) ?? [];
  if (cityStateZipBlocks.length >= 2) return message;

  const zips = value.match(ZIP_PATTERN) ?? [];
  if (new Set(zips).size !== zips.length) return message;

  const segments = value
    .split(",")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length >= 3);
  if (new Set(segments).size !== segments.length) return message;

  return null;
}

/* ------------------------------------------- Service-record duplicates */

/** The calendar day (UTC) a service record belongs to, for duplicate keys. */
export function serviceDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

export interface ServiceRecordDuplicateShape {
  serviceDate: string | null;
  mileage: number | null;
  invoiceNumber: string | null;
}

function normalizedInvoice(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed || null;
}

/**
 * The duplicate rule for service records: same vehicle (enforced by the
 * caller's query) + same service date + same mileage + same invoice number.
 * Mileage and invoice participate "where present": when both records carry
 * a value it must be equal, and at least one of the two must be present on
 * both — vehicle + date alone would condemn a legitimate second visit on
 * the same day.
 */
export function isDuplicateServiceRecord(
  candidate: ServiceRecordDuplicateShape,
  existing: ServiceRecordDuplicateShape,
): boolean {
  if (!candidate.serviceDate || candidate.serviceDate !== existing.serviceDate) return false;

  const candidateInvoice = normalizedInvoice(candidate.invoiceNumber);
  const existingInvoice = normalizedInvoice(existing.invoiceNumber);
  if (candidateInvoice && existingInvoice && candidateInvoice !== existingInvoice) return false;
  if (candidate.mileage !== null && existing.mileage !== null && candidate.mileage !== existing.mileage) return false;

  const invoiceMatch = candidateInvoice !== null && candidateInvoice === existingInvoice;
  const mileageMatch = candidate.mileage !== null && candidate.mileage === existing.mileage;
  return invoiceMatch || mileageMatch;
}
