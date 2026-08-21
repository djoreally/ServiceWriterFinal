/**
 * Detects import file type and classifies columns intelligently.
 * Supports: vehicle roster, company/account import, mixed fleet export, service history export.
 */

export type ImportFileType = "vehicle_roster" | "company_import" | "mixed_fleet_export" | "service_history_export" | "unknown";

export type ColumnClassification = {
  header: string;
  classification: "vehicle_identity" | "vehicle_detail" | "fleet_context" | "service_history" | "company_metadata" | "unknown";
  confidence: number;
  reason: string;
};

const VEHICLE_IDENTITY_PATTERNS: Array<{ pattern: RegExp; field: string }> = [
  { pattern: /\bvin\b/i, field: "vin" },
  { pattern: /vehicle\s*identification/i, field: "vin" },
  { pattern: /\bplate\b/i, field: "plate" },
  { pattern: /\btag\b/i, field: "plate" },
  { pattern: /\bunit\b/i, field: "unit_number" },
  { pattern: /\bvan\s*#/i, field: "unit_number" },
  { pattern: /\btruck\s*#/i, field: "unit_number" },
  { pattern: /\basset\b/i, field: "unit_number" },
  { pattern: /install.*acct/i, field: "unit_number" },
];

const VEHICLE_DETAIL_PATTERNS: RegExp[] = [
  /\byear\b/i, /\bmake\b/i, /\bmodel\b/i, /\bmake\s*[/&]\s*model/i,
  /\bodometer\b/i, /\bmileage\b/i, /\bmiles\b/i,
  /\bcolor\b/i, /\btrim\b/i, /\bengine\b/i, /\btransmission\b/i,
  /\bdrivetrain\b/i, /\bfuel\b/i, /\bbody\b/i, /\bcylinder/i,
  /\bdisplacement\b/i,
];

const COMPANY_PATTERNS: RegExp[] = [
  /\bbilling\s*email\b/i, /\bpayment\s*terms\b/i, /\bap\s*contact\b/i,
  /\bfleet\s*manager\b/i, /\bpostal\s*code\b/i, /\bzip\b/i,
  /\bcity\b/i, /\bstate\b/i, /\baddress\b/i, /\bphone\b/i,
  /\bcompany\s*name\b/i, /\bbusiness\s*name\b/i,
];

const SERVICE_DATE_PATTERN = /(?:oil\s*change|service|inspection|rotation|tire|brake|filter|flush|alignment|tune).*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i;
const DATE_COLUMN_PATTERN = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

export function classifyColumns(headers: string[]): ColumnClassification[] {
  return headers.map((header) => {
    const h = header.trim();

    // Service history columns (date-based service columns)
    if (SERVICE_DATE_PATTERN.test(h) || DATE_COLUMN_PATTERN.test(h)) {
      return { header, classification: "service_history" as const, confidence: 0.9, reason: "Date-based service column" };
    }

    // Vehicle identity
    for (const { pattern, field } of VEHICLE_IDENTITY_PATTERNS) {
      if (pattern.test(h)) {
        return { header, classification: "vehicle_identity" as const, confidence: 0.95, reason: `Matches vehicle identity pattern: ${field}` };
      }
    }

    // Vehicle detail
    for (const pat of VEHICLE_DETAIL_PATTERNS) {
      if (pat.test(h)) {
        return { header, classification: "vehicle_detail" as const, confidence: 0.85, reason: "Matches vehicle detail pattern" };
      }
    }

    // Company metadata
    for (const pat of COMPANY_PATTERNS) {
      if (pat.test(h)) {
        return { header, classification: "company_metadata" as const, confidence: 0.85, reason: "Matches company/account pattern" };
      }
    }

    // Fleet/client context (loose match)
    if (/\b(fleet|client|account|customer|company)\b/i.test(h)) {
      return { header, classification: "fleet_context" as const, confidence: 0.7, reason: "Fleet/client context column" };
    }

    return { header, classification: "unknown" as const, confidence: 0, reason: "No pattern match" };
  });
}

export function detectImportType(headers: string[], sampleRows?: Record<string, unknown>[]): {
  importType: ImportFileType;
  confidence: number;
  classifications: ColumnClassification[];
  reason: string;
} {
  const classifications = classifyColumns(headers);

  const vehicleIdentityCount = classifications.filter((c) => c.classification === "vehicle_identity").length;
  const vehicleDetailCount = classifications.filter((c) => c.classification === "vehicle_detail").length;
  const companyCount = classifications.filter((c) => c.classification === "company_metadata").length;
  const serviceHistoryCount = classifications.filter((c) => c.classification === "service_history").length;
  const fleetContextCount = classifications.filter((c) => c.classification === "fleet_context").length;

  const totalVehicle = vehicleIdentityCount + vehicleDetailCount;
  const totalCompany = companyCount;

  // Also check sample row data for VIN-like patterns (17 alphanumeric chars)
  let dataHasVins = false;
  if (sampleRows?.length) {
    for (const row of sampleRows.slice(0, 5)) {
      for (const val of Object.values(row)) {
        if (typeof val === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(val.trim())) {
          dataHasVins = true;
          break;
        }
      }
      if (dataHasVins) break;
    }
  }

  if (serviceHistoryCount > 2 && vehicleIdentityCount >= 1) {
    return { importType: "service_history_export", confidence: 0.9, classifications, reason: `${serviceHistoryCount} service-date columns with vehicle identifiers` };
  }

  if (totalVehicle >= 2 && totalCompany >= 3) {
    return { importType: "mixed_fleet_export", confidence: 0.8, classifications, reason: `Mixed: ${totalVehicle} vehicle cols + ${totalCompany} company cols` };
  }

  if (totalVehicle >= 2 || dataHasVins) {
    return { importType: "vehicle_roster", confidence: 0.9, classifications, reason: `${totalVehicle} vehicle columns detected${dataHasVins ? " + VIN data in rows" : ""}` };
  }

  if (totalCompany >= 3 && totalVehicle === 0) {
    return { importType: "company_import", confidence: 0.85, classifications, reason: `${totalCompany} company columns, no vehicle columns` };
  }

  return { importType: "unknown", confidence: 0.3, classifications, reason: "Could not confidently determine import type" };
}

/* ────────── Service history columns (YES/NO by date) ────────── */

const AFFIRMATIVE = /^(y|yes|true|done|complete|completed|x|✓)$/i;

function extractDateFromHeader(header: string): string | null {
  const match = header.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year > 70 ? 1900 : 2000;
  if (!month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type ServiceHistoryExtraction = {
  lastServiceDate: string | null;
  entries: Array<{ date: string; label: string; performed: boolean }>;
  note: string | null;
};

/**
 * Client rosters commonly track service history as one YES/NO column per visit
 * ("Oil Change 12/13/24"). Those are not vehicle fields: the newest YES becomes
 * the vehicle's last service date and the full set is preserved as a note.
 */
export function extractServiceHistory(row: Record<string, unknown>): ServiceHistoryExtraction {
  const classifications = classifyColumns(Object.keys(row));
  const entries: ServiceHistoryExtraction["entries"] = [];

  for (const classification of classifications) {
    if (classification.classification !== "service_history") continue;
    const date = extractDateFromHeader(classification.header);
    if (!date) continue;
    const value = String(row[classification.header] ?? "").trim();
    if (!value) continue;
    entries.push({ date, label: classification.header, performed: AFFIRMATIVE.test(value) });
  }

  if (entries.length === 0) return { lastServiceDate: null, entries: [], note: null };

  entries.sort((a, b) => a.date.localeCompare(b.date));
  const performed = entries.filter((entry) => entry.performed);
  const lastServiceDate = performed.length ? performed[performed.length - 1].date : null;
  const note = `[service_history] ${entries
    .map((entry) => `${entry.date}=${entry.performed ? "yes" : "no"}`)
    .join(", ")}`;

  return { lastServiceDate, entries, note };
}
