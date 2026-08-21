import type { FieldMapping, VehicleProfileInput } from "../types";
import { extractVinCandidate } from "../nhtsa.service";

const FIELD_SYNONYMS: Partial<Record<keyof VehicleProfileInput, string[]>> & Record<string, string[]> = {
  vin: [
    "vin", "vin #", "vin#", "vehicle vin", "vehicle identification number", "vin number", "v.i.n.", "v.i.n",
    "serial", "serial number", "vehicle serial", "chassis", "chassis number", "unit vin", "asset vin", "truck vin",
  ],
  year: ["year", "model year", "yr", "vehicle year", "veh year"],
  make: ["make", "brand", "vehicle make", "veh make", "mfg", "manufacturer"],
  model: ["model", "vehicle model", "veh model"],
  trim: ["trim", "trim level", "trim pkg"],
  series: ["series"],
  bodyStyle: ["body style", "body type"],
  bodyClass: ["body class"],
  vehicleType: ["vehicle type", "veh type", "type"],
  engine: ["engine", "engine type", "engine desc", "engine description"],
  engineCylinders: ["engine cylinders", "cylinders", "cyl", "# cyl", "#cyl", "num cylinders"],
  displacementLiters: ["displacement", "liters", "engine liters", "engine size", "eng size", "displacement liters"],
  fuelTypePrimary: ["fuel", "fuel type", "fuel type primary"],
  fuelTypeSecondary: ["fuel type secondary"],
  drivetrain: ["drivetrain", "drive type", "drive", "driveline", "awd", "4wd", "2wd", "fwd", "rwd"],
  transmission: ["transmission", "transmission style", "trans", "trans type"],
  gvwrClass: ["gvwr", "weight class", "gvw", "gross vehicle weight"],
  manufacturer: ["manufacturer", "oem"],
  plantCountry: ["plant country"],
  plantCity: ["plant city"],
  plate: ["license plate", "plate", "plate #", "plate#", "tag", "tag #", "tag#", "license plate number", "plate number", "reg", "registration", "lic plate"],
  unitNumber: [
    "unit", "unit #", "unit#", "unit number", "vehicle number", "fleet number", "van number",
    "van #", "van#", "truck #", "truck#", "asset", "asset #", "asset#", "asset id",
    "install", "install/acct", "install #", "install#", "acct", "acct #",
    "vehicle id", "vehicle #", "veh #", "veh#", "equipment #", "equipment id", "equip #",
    "fleet #", "fleet#", "fleet id", "internal id", "external ref", "external id",
  ],
  odometer: ["mileage", "odometer", "odo", "miles", "km", "current mileage", "current miles", "current odo"],
  odometerUnit: ["odometer unit", "distance unit", "odo unit"],
  color: ["color", "colour", "exterior color", "ext color", "vehicle color"],
  customerId: [
    "customer", "customer name", "account", "company", "client name", "client id",
    "fleet client", "fleet client id", "customer id", "company name", "business name",
    "acct name", "account name", "fleet name",
  ],
  fleetId: ["fleet", "fleet name"],
  locationId: ["location", "home location", "yard", "site", "job site", "base", "depot", "branch"],
  contractId: ["contract", "service contract", "contract name", "agreement"],
  serviceProfile: ["service profile", "service class", "profile", "service type", "service plan"],
  status: ["status", "service status", "do not service", "vehicle status", "active", "inactive"],
  notes: ["notes", "comments", "remarks", "service notes", "memo"],
  oilSpec: ["oil spec", "oil type", "oil grade", "oil weight"],
  oilCapacity: ["oil capacity", "oil qty", "oil quarts"],
  oilFilterPartNumber: ["filter", "oil filter part number", "oil filter", "filter #", "filter part"],
  tags: ["tags", "labels", "categories"],
};

// For vehicle imports, only VIN is truly required. The rest are helpful but not blocking.
const HARD_REQUIRED_FIELDS: Array<keyof VehicleProfileInput> = ["vin"];
const SOFT_REQUIRED_FIELDS: Array<keyof VehicleProfileInput> = ["year", "make", "model"];
const CONTEXT_FIELDS: Array<keyof VehicleProfileInput> = ["customerId", "locationId", "contractId", "serviceProfile"];

const normalize = (value: string) => value.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

function score(header: string, synonyms: string[]): number {
  const h = normalize(header);
  if (synonyms.some((s) => normalize(s) === h)) return 0.99;

  let best = 0;
  for (const term of synonyms) {
    const t = normalize(term);
    if (h.includes(t) || t.includes(h)) {
      best = Math.max(best, 0.84);
      continue;
    }
    const hTokens = h.split(" ");
    const tTokens = t.split(" ");
    const overlap = tTokens.filter((token) => hTokens.includes(token)).length;
    if (overlap > 0) best = Math.max(best, Math.min(0.76, overlap / tTokens.length));
  }
  return best;
}

/** Detect combined make/model columns like "MAKE/MODEL" */
function isCombinedMakeModel(header: string): boolean {
  const h = normalize(header);
  return /make\s*[/&]\s*model/i.test(h) || /make\s*model/i.test(h) || h === "vehicle" || h === "vehicle type";
}

/**
 * Split a combined vehicle column into make/model/trim.
 * "RAM 2500" → RAM / 2500, "Sprinter 3500 EXT" → Sprinter / 3500 / EXT.
 */
export function splitMakeModel(value: string): { make: string; model: string; trim?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    return { make: parts[0], model: parts[1], trim: parts.slice(2).join(" ") };
  }
  if (parts.length === 2) {
    return { make: parts[0], model: parts[1] };
  }
  return { make: trimmed, model: "" };
}

export function autoMapHeaders(headers: string[]): FieldMapping[] {
  const usedFields = new Set<string>();

  return headers.map((header) => {
    // Check for combined make/model first
    if (isCombinedMakeModel(header)) {
      return {
        sourceHeader: header,
        targetField: "make" as keyof VehicleProfileInput,
        confidence: 0.85,
        required: true,
        isCombinedMakeModel: true,
      } as FieldMapping & { isCombinedMakeModel?: boolean };
    }

    let bestField: keyof VehicleProfileInput | "ignore" = "ignore";
    let bestScore = 0;

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as Array<[keyof VehicleProfileInput, string[]]>) {
      if (usedFields.has(field)) continue;
      const s = score(header, synonyms);
      if (s > bestScore) {
        bestScore = s;
        bestField = field;
      }
    }

    if (bestScore < 0.45) bestField = "ignore";
    if (bestField !== "ignore") usedFields.add(bestField);

    const isRequired = bestField !== "ignore" && (
      HARD_REQUIRED_FIELDS.includes(bestField) ||
      SOFT_REQUIRED_FIELDS.includes(bestField)
    );

    return {
      sourceHeader: header,
      targetField: bestField,
      confidence: Number(bestScore.toFixed(2)),
      required: isRequired,
    };
  });
}

export function applyMapping(
  normalizedPayload: Record<string, unknown>,
  mapping: FieldMapping[]
): Partial<VehicleProfileInput> {
  const result: Partial<VehicleProfileInput> = {};

  mapping.forEach((entry) => {
    if (entry.targetField === "ignore") return;
    const raw = normalizedPayload[entry.sourceHeader];
    if (raw === "" || raw === null || raw === undefined) return;

    const value = String(raw).trim();

    if (entry.targetField === "vin") {
      result.vin = extractVinCandidate(value) || value.toUpperCase();
      return;
    }

    // Handle combined make/model columns
    if ((entry as FieldMapping & { isCombinedMakeModel?: boolean }).isCombinedMakeModel || entry.targetField === "make") {
      // Check if this looks like a combined value and make isn't already set from another column
      if ((entry as FieldMapping & { isCombinedMakeModel?: boolean }).isCombinedMakeModel) {
        const split = splitMakeModel(value);
        if (split) {
          result.make = split.make;
          if (split.model) result.model = split.model;
          if (split.trim && !result.trim) result.trim = split.trim;
        }
        return;
      }
    }

    if (["year", "engineCylinders", "odometer"].includes(entry.targetField)) {
      const numeric = Number.parseInt(value.replace(/[^0-9.-]/g, ""), 10);
      if (Number.isFinite(numeric)) {
        (result as Record<string, unknown>)[entry.targetField] = numeric;
      }
      return;
    }

    if (["displacementLiters", "oilCapacity"].includes(entry.targetField)) {
      const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(numeric)) {
        (result as Record<string, unknown>)[entry.targetField] = numeric;
      }
      return;
    }

    if (entry.targetField === "tags") {
      result.tags = value.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean);
      return;
    }

    (result as Record<string, unknown>)[entry.targetField] = value;
  });

  return result;
}
