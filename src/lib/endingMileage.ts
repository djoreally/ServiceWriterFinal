/**
 * Ending-mileage parsing for appointment completion.
 *
 * The ending mileage field is REQUIRED, but "empty" and "zero" are
 * different facts: a vehicle can legitimately record an odometer
 * reading of 0 (no reading exists / brand-new vehicle), while a blank
 * field means the tech never entered anything. Validation therefore
 * treats only a missing value — null, undefined, an empty or
 * whitespace-only string, or text that does not parse as a number —
 * as invalid. Zero is a valid reading. Negative readings stay invalid,
 * as they were before.
 *
 * Returns the parsed mileage, or null when the value is invalid.
 */
export function parseEndingMileage(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (trimmed === "") return null;
  const parsed = typeof trimmed === "number" ? trimmed : parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

/** True when `value` is an acceptable ending mileage (0 included). */
export function isValidEndingMileage(value: string | number | null | undefined): boolean {
  return parseEndingMileage(value) !== null;
}
