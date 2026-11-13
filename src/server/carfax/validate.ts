/**
 * CARFAX feed validation — the generator's refusal gate.
 *
 * A feed file is emitted only when every record in it passes the same
 * creation-time rules the app enforces on write (PR #272,
 * src/server/hono/lib/creation-validation) and the built file is structurally
 * sound. Any failure refuses the whole file: a partial or defective file at
 * CARFAX is worse than no file, and the refusal is written to the run record
 * with the reasons.
 */
import {
  validateMileageValue,
  validateVin,
} from "@/server/hono/lib/creation-validation";
import {
  CARFAX_FEED_FIELDS,
  carfaxFeedHeaderRow,
  parseCarfaxFeedLine,
} from "@/lib/carfax/feed";
import type {
  CarfaxExportServiceRecord,
  CarfaxFeedBusiness,
} from "@/lib/carfax/feed";

/**
 * Validate the records and business identity behind a feed before it is
 * formatted. Returns human-readable failure reasons; an empty array means
 * the feed may be built.
 */
export function validateCarfaxFeedRecords(
  records: CarfaxExportServiceRecord[],
  business: CarfaxFeedBusiness,
): string[] {
  const errors: string[] = [];

  if (!business.carfax_location_id?.trim()) {
    errors.push("LOCATION_ID is not configured for this workspace (CARFAX settings).");
  }
  if (records.length === 0) {
    errors.push("The feed would be empty: no completed service records in scope.");
  }

  for (const record of records) {
    const label = `record ${record.service_number ?? record.id}`;
    const vin = record.vehicles?.vin?.trim() ?? "";
    if (!vin) {
      errors.push(`${label}: VIN is missing.`);
    } else {
      const vinError = validateVin(vin);
      if (vinError) errors.push(`${label}: ${vinError}`);
    }
    if (!record.service_date) {
      errors.push(`${label}: service date is missing.`);
    }
    const mileageError = validateMileageValue(record.vehicles?.mileage ?? null);
    if (mileageError) errors.push(`${label}: ${mileageError}`);
  }

  return errors;
}

/**
 * Validate the built feed text: the header is exactly the spec header and
 * every data line parses as quoted pipe-delimited values with exactly
 * CARFAX_FEED_FIELDS.length fields. The formatter guarantees this by
 * construction; the check exists so a future formatter change cannot ship a
 * malformed file silently.
 */
export function validateCarfaxFeedContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");
  if (lines[0] !== carfaxFeedHeaderRow()) {
    errors.push("Feed header does not match the CARFAX spec header.");
  }
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCarfaxFeedLine(lines[i]);
    if (!fields) {
      errors.push(`Feed line ${i + 1} is not well-formed quoted pipe-delimited text.`);
    } else if (fields.length !== CARFAX_FEED_FIELDS.length) {
      errors.push(`Feed line ${i + 1} carries ${fields.length} fields, expected ${CARFAX_FEED_FIELDS.length}.`);
    }
  }
  return errors;
}
