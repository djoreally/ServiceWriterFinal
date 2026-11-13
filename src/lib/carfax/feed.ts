/**
 * CARFAX feed — the single canonical construction of the CARFAX Generic Car
 * Care Maintenance File (24 fields, pipe-delimited, every value quoted, one
 * line per service event).
 *
 * This module is pure (no I/O, no framework imports) so every producer of the
 * feed shares exactly one construction:
 *   - the settings screen's manual export (browser download),
 *   - the production generator (src/server/carfax) that builds the HIST and
 *     daily PROD files for SFTP delivery.
 *
 * The byte-for-byte reference for this construction is the sample file CARFAX
 * reviewed (17 VINs / 18 service-event lines, LOCATION_ID servicewriter01);
 * the golden test in src/application/commands/__tests__/carfax.command.test.ts
 * pins it.
 */

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/* ------------------------------------------------------------------ types */

export interface CarfaxExportVehicle {
  vin: string | null; make: string | null; model: string | null; year: number | null;
  license_plate: string | null; plate_state: string | null; mileage: number | null; odometer_measure: string | null;
}
export interface CarfaxExportLaborItem { description: string | null; }
export interface CarfaxExportServiceItem { description: string | null; quantity: number | null; }

/** A service_records row in the exact shape the export query selects. */
export interface CarfaxSourceLine {
  id?: string;
  item_type: string | null;
  description: string | null;
  quantity: number | null;
  labor_hours: number | null;
  sort_order?: number | null;
  created_at?: string | null;
}
export interface CarfaxSourceVehicle {
  vin: string | null; make: string | null; model: string | null; year: number | null;
  license_plate: string | null; plate_region: string | null; mileage: number | null; mileage_unit: string | null;
}
export interface CarfaxSourceRow {
  id: string;
  work_performed: string | null;
  metadata: unknown;
  completed_at: string | null;
  created_at: string;
  vehicles: CarfaxSourceVehicle | null;
  service_record_line_items: CarfaxSourceLine[] | null;
}

export interface CarfaxExportServiceRecord {
  id: string; service_number: string | null; service_date: string | null; service_type: string | null;
  description: string | null; created_at: string; vehicles: CarfaxExportVehicle;
  labor_items: CarfaxExportLaborItem[] | null; service_items: CarfaxExportServiceItem[] | null;
}
export interface CarfaxFeedBusiness {
  carfax_location_id?: string | null; business_name?: string | null; address?: string | null;
  city?: string | null; state?: string | null; postal_code?: string | null; phone?: string | null; website_url?: string | null;
}

/* ------------------------------------------------------- row -> feed record */

/**
 * Map raw service_records rows (the export-services query shape) to feed
 * records. HIST keeps every completed record; PROD keeps only records whose
 * service date is `today` (YYYY-MM-DD). Line order is significant: the feed
 * pairs the i-th labor line with the i-th part line, so lines are ordered
 * exactly as the spec pull does — sort_order, then creation time, then id.
 * Labor-class = labor lines and any line carrying labor hours; every other
 * line (part, fee, discount, …) is part-side. A line is never both.
 */
export function mapCarfaxSourceRows(
  rows: CarfaxSourceRow[],
  exportType: "PROD" | "HIST",
  today: string,
): CarfaxExportServiceRecord[] {
  return rows
    .map((row): CarfaxExportServiceRecord => {
      const meta = object(row.metadata);
      const completedDate = (row.completed_at ?? row.created_at)?.slice(0, 10) ?? null;
      const vehicle = row.vehicles;
      const lines = [...(row.service_record_line_items ?? [])].sort((a, b) => {
        const bySort = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
        if (bySort !== 0) return bySort;
        const byCreated = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
        if (byCreated !== 0) return byCreated;
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
      const isLaborLine = (line: CarfaxSourceLine) => line.item_type === "labor" || Number(line.labor_hours ?? 0) > 0;
      const metaMileage = meta.mileage != null ? Number(meta.mileage) : NaN;
      return {
        id: row.id,
        service_number: meta.service_number ? String(meta.service_number) : row.id.slice(0, 8).toUpperCase(),
        service_date: completedDate,
        service_type: String(meta.service_type ?? meta.title ?? "Service"),
        description: row.work_performed ?? (meta.description ? String(meta.description) : null),
        created_at: row.created_at,
        vehicles: {
          vin: meta.vin ? String(meta.vin) : vehicle?.vin ?? null,
          make: vehicle?.make ?? null,
          model: vehicle?.model ?? null,
          year: vehicle?.year ?? null,
          license_plate: vehicle?.license_plate ?? null,
          plate_state: vehicle?.plate_region ?? null,
          mileage: Number.isFinite(metaMileage) ? metaMileage : vehicle?.mileage ?? null,
          odometer_measure: meta.odometer_measure ? String(meta.odometer_measure) : vehicle?.mileage_unit ?? "MI",
        },
        labor_items: lines.filter(isLaborLine).map((line) => ({ description: line.description ?? null })),
        service_items: lines.filter((line) => !isLaborLine(line)).map((line) => ({ description: line.description ?? null, quantity: line.quantity == null ? null : Number(line.quantity) })),
      };
    })
    .filter((row) => exportType === "HIST" || row.service_date === today);
}

/* ---------------------------------------------------------------- formatter */

/**
 * The 24 fields of the CARFAX Generic Car Care Maintenance File, in the exact
 * order the specification mandates ("Data fields MUST be placed in the order
 * shown"). This constant is the single source of the feed header — every feed
 * line, header included, is built by mapping over it.
 */
export const CARFAX_FEED_FIELDS = [
  "VIN", "RO_OPEN_DATE", "RO_CLOSE_DATE", "MILEAGE", "ODOMETER_MEASURE",
  "RO_INVOICE_NUMBER", "SERVICE_DESCRIPTION", "LABOR_DESCRIPTION",
  "PART_NAME_DESCRIPTION", "PART_QUANTITY", "MAKE", "MODEL", "MODEL_YEAR",
  "PLATE", "PLATE_STATE", "MANAGEMENT_SYSTEM", "LOCATION_ID", "LOCATION_NAME",
  "ADDRESS", "CITY", "STATE", "POSTAL_CODE", "PHONE", "URL",
] as const;

export type CarfaxFeedField = (typeof CARFAX_FEED_FIELDS)[number];

/** CARFAX-approved management-system name for this platform. */
export const CARFAX_MANAGEMENT_SYSTEM = "SERVICE_WRITER";

/** Full state/province name (lowercase) -> 2-letter code, for STATE fields. */
const STATE_NAME_TO_CODE: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
  "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
  "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
  "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
  "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
  "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "alberta": "AB", "british columbia": "BC", "manitoba": "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "nova scotia": "NS", "ontario": "ON",
  "prince edward island": "PE", "quebec": "QC", "saskatchewan": "SK",
};

function feedText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** Wrap one value in double quotes, doubling any embedded double quote. */
function quoteFeedValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** YYYY-MM-DD (or an ISO timestamp) -> MM/DD/YYYY, zero-padded; "" if absent. */
function formatFeedDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

/** Odometer measure as the spec's two-letter code: MI or KM, uppercase. */
function normalizeOdometerMeasure(value: string | null | undefined): string {
  const raw = feedText(value).toUpperCase();
  if (!raw) return "MI";
  if (raw.startsWith("KM") || raw.startsWith("KILOM")) return "KM";
  if (raw.startsWith("MI") || raw.startsWith("MILE")) return "MI";
  return raw;
}

/** State as a 2-letter USPS code; full names are mapped, codes pass through. */
function normalizeStateCode(value: string | null | undefined): string {
  const raw = feedText(value);
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return STATE_NAME_TO_CODE[raw.toLowerCase()] ?? raw;
}

/** Quantity: integers print without decimals; empty when there is no part. */
function formatPartQuantity(quantity: number | null | undefined): string {
  if (quantity == null || !Number.isFinite(quantity)) return "";
  return Number.isInteger(quantity) ? quantity.toFixed(0) : String(quantity);
}

/** Mileage rounded to the nearest mile per spec; empty when unknown. */
function formatMileage(mileage: number | null | undefined): string {
  if (mileage == null || !Number.isFinite(mileage)) return "";
  return String(Math.round(mileage));
}

/** The feed header row, built from CARFAX_FEED_FIELDS like every other line. */
export function carfaxFeedHeaderRow(): string {
  return CARFAX_FEED_FIELDS.map((field) => quoteFeedValue(field)).join("|");
}

/**
 * Build the CARFAX maintenance feed (pipe-delimited, every value quoted,
 * header row first). One output line per service event: the i-th labor line
 * of a completed record is paired with its i-th part line on one feed line,
 * record-level fields repeated, for max(labor lines, part lines, 1) lines per
 * record — a record with no line items still emits exactly one line so no
 * completed service is dropped.
 *
 * RO_OPEN_DATE: the export record carries no dedicated open date, so the
 * shipped convention is kept — open date = service (close) date. That is the
 * construction of the sample CARFAX reviewed; do not invent a separate open
 * date here.
 *
 * Location fields are emitted from workspace settings exactly as stored; the
 * formatter never rewrites stored location data (STATE is normalized to its
 * 2-letter code, as the spec requires a state abbreviation).
 */
export function formatCarfaxFeed(services: CarfaxExportServiceRecord[], business: CarfaxFeedBusiness): string {
  const location: Partial<Record<CarfaxFeedField, string>> = {
    LOCATION_ID: feedText(business.carfax_location_id),
    LOCATION_NAME: feedText(business.business_name),
    ADDRESS: feedText(business.address),
    CITY: feedText(business.city),
    STATE: normalizeStateCode(business.state),
    POSTAL_CODE: feedText(business.postal_code),
    PHONE: feedText(business.phone),
    URL: feedText(business.website_url),
  };

  const rows: string[] = [];
  for (const s of services) {
    const v = s.vehicles ?? ({} as CarfaxExportVehicle);
    const date = formatFeedDate(s.service_date);
    const record: Partial<Record<CarfaxFeedField, string>> = {
      VIN: feedText(v.vin).toUpperCase(),
      RO_OPEN_DATE: date,
      RO_CLOSE_DATE: date,
      MILEAGE: formatMileage(v.mileage),
      ODOMETER_MEASURE: normalizeOdometerMeasure(v.odometer_measure),
      RO_INVOICE_NUMBER: feedText(s.service_number),
      SERVICE_DESCRIPTION: feedText(s.description),
      MAKE: feedText(v.make),
      MODEL: feedText(v.model),
      MODEL_YEAR: v.year == null ? "" : String(Math.round(v.year)),
      PLATE: feedText(v.license_plate),
      PLATE_STATE: normalizeStateCode(v.plate_state),
      MANAGEMENT_SYSTEM: CARFAX_MANAGEMENT_SYSTEM,
      ...location,
    };
    const laborItems = s.labor_items ?? [];
    const partItems = s.service_items ?? [];
    const lineCount = Math.max(laborItems.length, partItems.length, 1);
    for (let i = 0; i < lineCount; i++) {
      const line: Record<CarfaxFeedField, string> = {
        ...record,
        LABOR_DESCRIPTION: feedText(laborItems[i]?.description),
        PART_NAME_DESCRIPTION: feedText(partItems[i]?.description),
        // Real quantity only when this line carries a part; never an invented "0".
        PART_QUANTITY: partItems[i] ? formatPartQuantity(partItems[i].quantity) : "",
      } as Record<CarfaxFeedField, string>;
      rows.push(CARFAX_FEED_FIELDS.map((field) => quoteFeedValue(line[field] ?? "")).join("|"));
    }
  }

  return [carfaxFeedHeaderRow(), ...rows].join("\n");
}

/* ------------------------------------------------------------------ parsing */

/**
 * Parse one pipe-delimited line of double-quoted values ("" = escaped quote).
 * Returns the field values, or null when the line is not well-formed quoted
 * pipe-delimited text. Used by feed validation to prove every emitted line
 * carries exactly the spec's fields.
 */
export function parseCarfaxFeedLine(line: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') return null;
    let val = "";
    i++;
    let closed = false;
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else {
          i++;
          closed = true;
          break;
        }
      } else {
        val += line[i];
        i++;
      }
    }
    if (!closed) return null;
    fields.push(val);
    if (i < line.length) {
      if (line[i] !== "|") return null;
      i++;
    }
  }
  return fields;
}

/* -------------------------------------------------------------- file naming */

/**
 * Feed file name per the CARFAX convention PartnerName_DataStatus_DataType_
 * FileExportDate: SW_HIST_RO_MMDDYYYY.txt / SW_PROD_RO_MMDDYYYY.txt, where the
 * date is the export (generation) date. Matches the reviewed sample's naming
 * (SW_SAMPLE_RO_11132026.txt).
 */
export function carfaxFeedFileName(kind: "HIST" | "PROD", exportDate: Date): string {
  const mm = String(exportDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(exportDate.getUTCDate()).padStart(2, "0");
  const yyyy = String(exportDate.getUTCFullYear());
  return `SW_${kind}_RO_${mm}${dd}${yyyy}.txt`;
}
